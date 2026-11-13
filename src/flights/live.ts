// Live Google Flights lookups (each one can cost a SerpApi search) and the Worker's daily allowance.
// Every answer is remembered while the app is open, so opening a destination again, switching dates back and
// forth or reopening a list of returns never asks the Worker twice. The Worker also caches answers for an
// hour, so a repeat after a restart is free too. Kept free of React so the costs can be tested.
import { ApiResult, Itinerary, Usage } from '../../shared/types';
import { api, Connection, FlightQuery } from '../api/client';
import { DatePair } from './flights';

type Listener = (u: Usage) => void;

/** A live check's question: always from the search's one departure airport, for the search's travelers. */
export const flightQuery = (s: { departureAirport: string; adults: number }, dest: string, back: string, p: DatePair): FlightQuery => ({
  origin: s.departureAirport, dest, back, out: p.out, ret: p.ret, adults: s.adults,
});

/** One lookup's name: same route, fly-back airport, dates and travelers = same answer. */
export const flightKey = (q: FlightQuery) => [q.origin, q.dest, q.back && q.back !== q.dest ? q.back : q.dest, q.out, q.ret, q.adults ?? 1].join('|');

export function createLive(fetchFn?: typeof fetch) {
  const flights = new Map<string, Itinerary[]>();
  const returns = new Map<string, Itinerary[]>();
  let usage: Usage | null = null;
  const listeners = new Set<Listener>();

  const noteUsage = (u: Usage | undefined) => {
    if (!u) return;
    usage = u;
    listeners.forEach((l) => l(u));
  };

  /** Asks the Worker unless the answer is already remembered; only good answers are remembered. */
  async function remembered(store: Map<string, Itinerary[]>, key: string, ask: () => Promise<ApiResult<Itinerary[]>>): Promise<ApiResult<Itinerary[]>> {
    const hit = store.get(key);
    if (hit) return { ok: true, data: hit, cached: true, usage: usage ?? { date: '', used: 0, cap: 0 } };
    const r = await ask();
    noteUsage(r.usage);
    if (r.ok) store.set(key, r.data);
    return r;
  }

  return {
    /** The outbound flights of a date pair, if they were checked already (free). */
    peekFlights: (q: FlightQuery) => flights.get(flightKey(q)),
    /** The returns that go with one outbound flight, if they were loaded already (free). */
    peekReturns: (q: FlightQuery, token: string) => returns.get(`${flightKey(q)}#${token}`),
    /** Checks one date pair live: at most one search, none when it was checked before. */
    checkFlights: (c: Connection, q: FlightQuery) => remembered(flights, flightKey(q), () => api.flights(c, q, fetchFn)),
    /** Loads the returns for one outbound flight: at most one search, none when loaded before. */
    loadReturns: (c: Connection, q: FlightQuery, token: string) =>
      remembered(returns, `${flightKey(q)}#${token}`, () => api.returns(c, { ...q, departureToken: token }, fetchFn)),
    /** Asks the Worker how many searches are left today. Never spends one. */
    async refreshUsage(c: Connection): Promise<Usage | null> {
      const r = await api.usage(c, fetchFn);
      noteUsage(r.ok ? r.data : r.usage);
      return usage;
    },
    /** Other screens' Worker answers carry the allowance too. */
    noteUsage,
    usage: () => usage,
    onUsage(l: Listener) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

export type Live = ReturnType<typeof createLive>;

/** The one shared by every screen. */
export const live = createLive();

/** Searches left today, never below zero. */
export const searchesLeft = (u: Usage | null) => (u ? Math.max(0, u.cap - u.used) : null);

/** "5 of 8 searches left today" (the Worker's own numbers). */
export const allowanceText = (u: Usage | null) => (u ? `${searchesLeft(u)} of ${u.cap} searches left today` : '');

/** "up to 1 search", "up to 3 searches", "free (already loaded)". */
export const costText = (n: number) => (n === 0 ? 'free (already loaded)' : `up to ${n} ${n === 1 ? 'search' : 'searches'}`);

/** The chosen date pairs that would still cost a search (the others were checked already). */
export function pairsToCheck(chosen: DatePair[], isLoaded: (p: DatePair) => boolean): DatePair[] {
  return chosen.filter((p) => !isLoaded(p));
}
