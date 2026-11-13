// What live lookups cost, end to end with fakes: the app's client talks to the real Worker code, which talks
// to a fake SerpApi. Counts both the requests the app sends to the Worker and the searches sent to SerpApi.
import { describe, expect, it } from 'vitest';
import { Env, handle, Store } from '../worker/src/handler';
import { allowanceText, costText, createLive, flightQuery, pairsToCheck, searchesLeft } from '../src/flights/live';
import { airportCodesIn } from '../src/map/mapData';
import { planCalls } from '../src/results/results';
import { sanitizeSearch, summary } from '../src/search/search';
import flights from './fixtures/flights.json';

function fakeWorld(cap = '8') {
  const kv = new Map<string, string>();
  const store: Store = { get: async (k) => kv.get(k) ?? null, put: async (k, v) => void kv.set(k, v) };
  let serpapi = 0;
  const upstream = (async (input: string) => {
    if (new URL(input).hostname === 'serpapi.com') serpapi++;
    return { ok: true, status: 200, json: async () => flights };
  }) as unknown as typeof fetch;
  const env: Env = { CACHE: store, SERPAPI_KEY: 'k', TRAVELPAYOUTS_TOKEN: 't', APP_TOKEN: 'app', DAILY_SEARCH_CAP: cap };
  let toWorker = 0;
  // The phone's fetch, pointed at the Worker code instead of the internet
  const phone = (async (url: string, init?: RequestInit) => {
    toWorker++;
    return handle(new Request(url, init), env, { fetch: upstream, now: () => new Date('2026-11-13T10:00:00Z') });
  }) as unknown as typeof fetch;
  return { live: createLive(phone), conn: { url: 'https://worker.example', token: 'app' }, counts: () => ({ toWorker, serpapi }) };
}

const q = { origin: 'TLV', dest: 'ATH', out: '2026-12-07', ret: '2026-12-14', adults: 1 };

describe('live lookups: costs', () => {
  it('opening a destination spends zero searches', async () => {
    const w = fakeWorld();
    // What the screen does on opening: read the allowance and look for answers already loaded
    const u = await w.live.refreshUsage(w.conn);
    expect(w.live.peekFlights(q)).toBeUndefined();
    expect(w.counts().serpapi).toBe(0);
    expect(u).toEqual({ date: '2026-11-13', used: 0, cap: 8 });
    expect(allowanceText(u)).toBe('8 of 8 searches left today');
  });

  it('checking one date pair makes at most one upstream request, and none the second time', async () => {
    const w = fakeWorld();
    const r = await w.live.checkFlights(w.conn, q);
    expect(r.ok).toBe(true);
    expect(w.counts()).toEqual({ toWorker: 1, serpapi: 1 });
    expect(w.live.usage()).toMatchObject({ used: 1, cap: 8 });
    await w.live.checkFlights(w.conn, q);
    expect(w.live.peekFlights(q)?.length).toBeGreaterThan(0);
    expect(w.counts()).toEqual({ toWorker: 1, serpapi: 1 });
  });

  it('opening an already-loaded return list makes no request at all', async () => {
    const w = fakeWorld();
    const out = await w.live.checkFlights(w.conn, q);
    const token = out.ok ? out.data.find((it) => it.departureToken)?.departureToken : undefined;
    expect(token).toBeTruthy();
    await w.live.loadReturns(w.conn, q, token as string);
    expect(w.counts()).toEqual({ toWorker: 2, serpapi: 2 });
    expect(w.live.peekReturns(q, token as string)).toBeDefined();
    await w.live.loadReturns(w.conn, q, token as string);
    expect(w.counts()).toEqual({ toWorker: 2, serpapi: 2 });
  });

  it('a failed check is not remembered, so it can be tried again', async () => {
    const w = fakeWorld('1');
    await w.live.checkFlights(w.conn, q);
    const other = { ...q, out: '2026-12-08', ret: '2026-12-15' };
    const r = await w.live.checkFlights(w.conn, other);
    expect(r.ok).toBe(false);
    expect(w.live.peekFlights(other)).toBeUndefined();
    expect(searchesLeft(w.live.usage())).toBe(0);
    expect(w.counts().serpapi).toBe(1);
  });

  it('says the cost before you tap', () => {
    const a = { out: '2026-12-07', ret: '2026-12-14' };
    const b = { out: '2026-12-10', ret: '2026-12-17' };
    expect(pairsToCheck([a, b], (p) => p === a)).toEqual([b]);
    expect(costText(1)).toBe('up to 1 search');
    expect(costText(3)).toBe('up to 3 searches');
    expect(costText(0)).toBe('free (already loaded)');
  });
});

describe('one departure airport everywhere (QA)', () => {
  it('after switching to Ramon, the summary, the price search and the live check all use ETM', async () => {
    const s = sanitizeSearch({ departureCc: 'IL', departureAirport: 'ETM' }, '2026-11-13', airportCodesIn);
    expect(summary(s)).toMatch(/^From ETM · /);
    expect(planCalls(s).origin).toBe('ETM');
    const asked: string[] = [];
    const phone = (async (url: string) => {
      asked.push(url);
      return { ok: true, status: 200, json: async () => ({ ok: true, data: [], cached: false, usage: { date: '2026-11-13', used: 1, cap: 8 } }) };
    }) as unknown as typeof fetch;
    await createLive(phone).checkFlights({ url: 'https://w.example', token: 't' }, flightQuery(s, 'ATH', 'ATH', { out: '2026-12-07', ret: '2026-12-14' }));
    expect(new URL(asked[0]).searchParams.get('origin')).toBe('ETM');
  });

  it('an old saved search with TLV and ETM uses TLV for all of them', () => {
    const s = sanitizeSearch({ departureCc: 'IL', departureAirports: ['TLV', 'ETM'] }, '2026-11-13', airportCodesIn);
    expect([summary(s).slice(0, 8), planCalls(s).origin, flightQuery(s, 'ATH', 'ATH', { out: '2026-12-07', ret: '2026-12-14' }).origin]).toEqual(['From TLV', 'TLV', 'TLV']);
  });
});
