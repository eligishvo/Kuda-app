// The Kuda Worker's logic. It sits between the app and the flight-data services so that:
//   - the API keys stay here (as Worker secrets) and never ship inside the app,
//   - answers are cached, so repeating a search is free and instant,
//   - SerpApi searches are capped per day (the free plan has only 250 a month).
// It is written against small interfaces (a key-value store and a fetch function) so the tests can run it
// in Node with fakes; worker/src/index.ts plugs in the real Cloudflare ones.
import { isDate } from '../../shared/dates';
import { normalizeExplore, normalizeFlights, normalizeOneWays, normalizeSellers, normalizeTravelpayouts } from '../../shared/normalize';
import { ApiResult, Usage } from '../../shared/types';

/** The part of Cloudflare KV that the Worker uses. */
export type Store = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

export type Env = {
  CACHE: Store;
  SERPAPI_KEY?: string;
  TRAVELPAYOUTS_TOKEN?: string;
  APP_TOKEN?: string;
  /** Most SerpApi searches per day (text, from wrangler.toml). */
  DAILY_SEARCH_CAP?: string;
};

export type Deps = { fetch: typeof fetch; now: () => Date };

export const DEFAULT_CAP = 40;
const HOUR = 3600;
/** How long answers are kept. Explore prices move slowly; live flight prices don't. */
export const TTL = { explore: 12 * HOUR, estimates: 12 * HOUR, flights: HOUR, returns: HOUR, empty: HOUR, usage: 3 * 24 * HOUR };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-App-Token',
};

function reply(body: ApiResult<unknown> | { ok: true; service: string }, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

const iata = (v: string | null): v is string => v != null && /^[A-Z]{3}$/.test(v);
const whole = (v: string | null, min: number, max: number): number | null => {
  if (v == null || !/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
};
const isMonth = (v: string | null): v is string => v != null && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

function capOf(env: Env): number {
  const n = Number(env.DAILY_SEARCH_CAP);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_CAP;
}

async function readUsage(env: Env, now: Date): Promise<Usage> {
  const date = now.toISOString().slice(0, 10);
  const used = Number((await env.CACHE.get(`usage:${date}`)) ?? 0) || 0;
  return { date, used, cap: capOf(env) };
}

/** A short, stable name for a long value (departure tokens are hundreds of characters). */
async function digest(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return [...bytes.slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

class Problem extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** One SerpApi search. Counts against the daily cap before it is sent. */
async function serpapi(env: Env, deps: Deps, params: Record<string, string>): Promise<any> {
  if (!env.SERPAPI_KEY) throw new Problem('The Worker has no SERPAPI_KEY secret yet.', 500);
  const usage = await readUsage(env, deps.now());
  if (usage.used >= usage.cap) throw new Problem(`Daily search limit reached (${usage.cap}). It resets at midnight UTC.`, 429);
  await env.CACHE.put(`usage:${usage.date}`, String(usage.used + 1), { expirationTtl: TTL.usage });
  const url = new URL('https://serpapi.com/search.json');
  for (const [k, v] of Object.entries({ ...params, currency: 'USD', hl: 'en', gl: 'il', api_key: env.SERPAPI_KEY })) url.searchParams.set(k, v);
  const res = await deps.fetch(url.toString());
  const body: any = await res.json().catch(() => null);
  if (body == null) throw new Problem(`SerpApi answered ${res.status} without data.`, 502);
  // "No results" is a normal answer (Google has nothing for that area or date), not a failure
  if (typeof body.error === 'string' && /no results|empty results|hasn't returned any results/i.test(body.error)) return { empty: true };
  if (!res.ok || body.error) throw new Problem(`SerpApi: ${body.error ?? res.status}`, 502);
  return body;
}

/** Cached round trips from the origin: to everywhere, or to one destination when `dest` is given. */
async function travelpayouts(env: Env, deps: Deps, origin: string, from: string, to: string, dest = ''): Promise<any> {
  if (!env.TRAVELPAYOUTS_TOKEN) throw new Problem('The Worker has no TRAVELPAYOUTS_TOKEN secret yet.', 500);
  const url = new URL('https://api.travelpayouts.com/aviasales/v3/prices_for_dates');
  const params: Record<string, string> = { origin, departure_at: from, return_at: to, one_way: 'false', unique: 'false', sorting: 'price', limit: '1000', currency: 'usd', token: env.TRAVELPAYOUTS_TOKEN };
  if (dest) params.destination = dest;
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await deps.fetch(url.toString());
  const body: any = await res.json().catch(() => null);
  if (!res.ok || body == null || body.success === false) throw new Problem(`Travelpayouts: ${body?.error ?? res.status}`, 502);
  return body;
}

/**
 * One-way fares for a month: from the airport to everywhere ('out') or from everywhere to it ('back').
 * With `dest`, only between the airport and that destination (many more dates for that one route).
 */
async function oneWays(env: Env, deps: Deps, airport: string, month: string, dir: 'out' | 'back', dest = ''): Promise<any> {
  if (!env.TRAVELPAYOUTS_TOKEN) throw new Problem('The Worker has no TRAVELPAYOUTS_TOKEN secret yet.', 500);
  const url = new URL('https://api.travelpayouts.com/aviasales/v3/prices_for_dates');
  const params: Record<string, string> = { [dir === 'out' ? 'origin' : 'destination']: airport, departure_at: month, one_way: 'true', unique: 'false', sorting: 'price', limit: '1000', currency: 'usd', token: env.TRAVELPAYOUTS_TOKEN };
  if (dest) params[dir === 'out' ? 'destination' : 'origin'] = dest;
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await deps.fetch(url.toString());
  const body: any = await res.json().catch(() => null);
  if (!res.ok || body == null || body.success === false) throw new Problem(`Travelpayouts: ${body?.error ?? res.status}`, 502);
  return body;
}

/** Answers from the cache when it can; otherwise runs `load`, saves the result and answers with it. */
async function cached(env: Env, deps: Deps, key: string, ttl: number, load: () => Promise<{ data: unknown; empty?: boolean }>): Promise<Response> {
  const hit = await env.CACHE.get(key);
  if (hit != null) return reply({ ok: true, data: JSON.parse(hit), cached: true, usage: await readUsage(env, deps.now()) });
  const { data, empty } = await load();
  await env.CACHE.put(key, JSON.stringify(data), { expirationTtl: empty ? TTL.empty : ttl });
  return reply({ ok: true, data, cached: false, usage: await readUsage(env, deps.now()) });
}

/**
 * The real internet and clock. fetch is wrapped in a small function on purpose: Cloudflare refuses to run
 * its fetch when it is called as a property of another object ("Illegal invocation").
 */
export const REAL: Deps = { fetch: (input, init) => fetch(input, init), now: () => new Date() };

export async function handle(request: Request, env: Env, deps: Deps = REAL): Promise<Response> {
  const url = new URL(request.url);
  const q = url.searchParams;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'GET') return reply({ ok: false, error: 'Only GET is supported.' }, 405);
  if (url.pathname === '/') return reply({ ok: true, service: 'kuda-worker' });

  // Every real endpoint needs the app's shared token
  if (!env.APP_TOKEN) return reply({ ok: false, error: 'The Worker has no APP_TOKEN secret yet.' }, 500);
  if (request.headers.get('X-App-Token') !== env.APP_TOKEN) return reply({ ok: false, error: 'Missing or wrong app token.' }, 401);

  try {
    if (url.pathname === '/usage') return reply({ ok: true, data: await readUsage(env, deps.now()), cached: false, usage: await readUsage(env, deps.now()) });

    const origin = q.get('origin');
    if (!iata(origin)) throw new Problem('origin must be a 3-letter airport code, e.g. TLV.', 400);

    if (url.pathname === '/explore') {
      const month = whole(q.get('month'), 1, 12);
      const duration = whole(q.get('duration'), 1, 3);
      const adults = whole(q.get('adults') ?? '1', 1, 9);
      const area = q.get('area') ?? '';
      if (month == null) throw new Problem('month must be 1–12.', 400);
      if (duration == null) throw new Problem('duration must be 1 (weekend), 2 (one week) or 3 (two weeks).', 400);
      if (adults == null) throw new Problem('adults must be 1–9.', 400);
      if (area && !/^\/[mg]\/[\w]+$/.test(area)) throw new Problem('area must be a Google id like /m/035qy.', 400);
      return await cached(env, deps, `explore:${origin}:${month}:${duration}:${adults}:${area}`, TTL.explore, async () => {
        const params: Record<string, string> = { engine: 'google_travel_explore', departure_id: origin, month: String(month), travel_duration: String(duration), adults: String(adults) };
        if (area) params.arrival_area_id = area;
        const raw = await serpapi(env, deps, params);
        const data = normalizeExplore(raw);
        return { data, empty: data.length === 0 };
      });
    }

    // Optional on /estimates and /oneways: one destination airport instead of everywhere
    const dest = q.get('dest') ?? '';
    if (dest && !iata(dest) && url.pathname !== '/flights' && url.pathname !== '/returns' && url.pathname !== '/booking') {
      throw new Problem('dest must be a 3-letter airport code.', 400);
    }
    const destKey = dest ? `:${dest}` : '';

    if (url.pathname === '/estimates') {
      const from = q.get('from');
      const to = q.get('to');
      if (!isMonth(from) || !isMonth(to)) throw new Problem('from and to must be months like 2026-12.', 400);
      return await cached(env, deps, `estimates:${origin}:${from}:${to}${destKey}`, TTL.estimates, async () => {
        const data = normalizeTravelpayouts(await travelpayouts(env, deps, origin, from, to, dest));
        return { data, empty: data.length === 0 };
      });
    }

    if (url.pathname === '/oneways') {
      const month = q.get('month');
      const dir = q.get('dir');
      if (!isMonth(month)) throw new Problem('month must be like 2026-12.', 400);
      if (dir !== 'out' && dir !== 'back') throw new Problem('dir must be out or back.', 400);
      return await cached(env, deps, `oneways:${origin}:${month}:${dir}${destKey}`, TTL.estimates, async () => {
        const data = normalizeOneWays(await oneWays(env, deps, origin, month, dir, dest), dir);
        return { data, empty: data.length === 0 };
      });
    }

    if (url.pathname === '/flights' || url.pathname === '/returns' || url.pathname === '/booking') {
      const dest = q.get('dest');
      const out = q.get('out');
      const ret = q.get('ret');
      const adults = whole(q.get('adults') ?? '1', 1, 9);
      if (!iata(dest)) throw new Problem('dest must be a 3-letter airport code.', 400);
      if (!isDate(out) || !isDate(ret) || ret < out) throw new Problem('out and ret must be dates like 2026-12-07, with ret on or after out.', 400);
      if (adults == null) throw new Problem('adults must be 1–9.', 400);
      // "back" is the airport to fly home from. When it differs from the arrival airport the trip is an
      // "open jaw", which Google handles as a two-leg multi-city search: there, then home from the other airport.
      const back = q.get('back') ?? '';
      if (back && !iata(back)) throw new Problem('back must be a 3-letter airport code.', 400);
      const openJaw = back !== '' && back !== dest;
      const params: Record<string, string> = openJaw
        ? {
            engine: 'google_flights',
            type: '3',
            multi_city_json: JSON.stringify([
              { departure_id: origin, arrival_id: dest, date: out },
              { departure_id: back, arrival_id: origin, date: ret },
            ]),
            adults: String(adults),
          }
        : { engine: 'google_flights', type: '1', departure_id: origin, arrival_id: dest, outbound_date: out, return_date: ret, adults: String(adults) };
      const base = `${origin}:${dest}:${out}:${ret}:${adults}${openJaw ? `:${back}` : ''}`;
      if (url.pathname === '/flights') {
        return await cached(env, deps, `flights:${base}`, TTL.flights, async () => {
          const data = normalizeFlights(await serpapi(env, deps, params));
          return { data, empty: data.length === 0 };
        });
      }
      if (url.pathname === '/booking') {
        // Who sells a chosen trip: the same search plus the trip's booking token
        const booking = q.get('booking_token');
        if (!booking || booking.length > 6000) throw new Problem('booking_token (from /returns) is required.', 400);
        return await cached(env, deps, `booking:${base}:${await digest(booking)}`, TTL.flights, async () => {
          const data = normalizeSellers(await serpapi(env, deps, { ...params, booking_token: booking }));
          return { data, empty: data.length === 0 };
        });
      }
      const token = q.get('departure_token');
      if (!token || token.length > 4000) throw new Problem('departure_token (from /flights) is required.', 400);
      return await cached(env, deps, `returns:${base}:${await digest(token)}`, TTL.returns, async () => {
        const data = normalizeFlights(await serpapi(env, deps, { ...params, departure_token: token }));
        return { data, empty: data.length === 0 };
      });
    }

    return reply({ ok: false, error: 'Not found.' }, 404);
  } catch (e) {
    const usage = await readUsage(env, deps.now()).catch(() => undefined);
    if (e instanceof Problem) return reply({ ok: false, error: e.message, usage }, e.status);
    // Say what went wrong (never includes the keys: they only appear in outgoing addresses, not in errors we build)
    const detail = e instanceof Error ? e.message.slice(0, 200) : 'unknown';
    console.log('Unexpected error', detail);
    return reply({ ok: false, error: `The Worker hit an unexpected error: ${detail}`, usage }, 500);
  }
}
