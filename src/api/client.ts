// Talks to the Kuda Worker. The Worker's address and the app token are typed in once on the debug screen and
// kept on the phone (the token is never committed to the repo). Kept free of React so it can be tested.
import { ApiResult, Destination, Itinerary, OneWay, Seller, Usage } from '../../shared/types';

export type Connection = { url: string; token: string };

/** `back` is the airport to fly home from, when it isn't the arrival airport. */
export type FlightQuery = { origin: string; dest: string; out: string; ret: string; adults?: number; back?: string };

function query(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

/** One GET to the Worker. Never throws: problems come back as { ok: false, error }. */
export async function get<T>(c: Connection, path: string, fetchFn: typeof fetch = fetch): Promise<ApiResult<T>> {
  if (!c.url) return { ok: false, error: 'Set the Worker address first.' };
  if (!c.token) return { ok: false, error: 'Set the app token first.' };
  try {
    const res = await fetchFn(`${c.url.replace(/\/+$/, '')}${path}`, { headers: { 'X-App-Token': c.token } });
    const body = (await res.json().catch(() => null)) as ApiResult<T> | null;
    if (body && typeof body.ok === 'boolean') return body;
    return { ok: false, error: `The Worker answered ${res.status} without data.` };
  } catch {
    return { ok: false, error: 'Could not reach the Worker. Check the address and your connection.' };
  }
}

export const api = {
  usage: (c: Connection, f?: typeof fetch) => get<Usage>(c, '/usage', f),
  explore: (c: Connection, p: { origin: string; month: number; duration: 1 | 2 | 3; adults?: number; area?: string }, f?: typeof fetch) =>
    get<Destination[]>(c, `/explore${query(p)}`, f),
  estimates: (c: Connection, p: { origin: string; from: string; to: string }, f?: typeof fetch) =>
    get<Destination[]>(c, `/estimates${query(p)}`, f),
  oneWays: (c: Connection, p: { origin: string; month: string; dir: 'out' | 'back' }, f?: typeof fetch) =>
    get<OneWay[]>(c, `/oneways${query(p)}`, f),
  flights: (c: Connection, p: FlightQuery, f?: typeof fetch) =>
    get<Itinerary[]>(c, `/flights${query({ ...p, back: p.back && p.back !== p.dest ? p.back : undefined })}`, f),
  sellers: (c: Connection, p: FlightQuery & { bookingToken: string }, f?: typeof fetch) =>
    get<Seller[]>(c, `/booking${query({ origin: p.origin, dest: p.dest, out: p.out, ret: p.ret, adults: p.adults, back: p.back && p.back !== p.dest ? p.back : undefined, booking_token: p.bookingToken })}`, f),
  returns: (c: Connection, p: FlightQuery & { departureToken: string }, f?: typeof fetch) =>
    get<Itinerary[]>(c, `/returns${query({ origin: p.origin, dest: p.dest, out: p.out, ret: p.ret, adults: p.adults, back: p.back && p.back !== p.dest ? p.back : undefined, departure_token: p.departureToken })}`, f),
};
