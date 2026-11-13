// Helpers for the destination screen: which dates to check live, and how to describe and compare flights.
// Plain functions (no React, no network) so they're easy to test.
import { addDays, fitsWindow, isDate, nightsBetween, Window } from '../../shared/dates';
import { DateText, Destination, Itinerary, TripSelection } from '../../shared/types';

export type DatePair = { out: DateText; ret: DateText };

/** How many date pairs are checked live when a destination opens (each is one SerpApi search). */
export const LIVE_CHECKS = 3;

/** Every date pair the price lists suggest for an airport that fits the window, cheapest first. */
export function suggestedPairs(code: string, lists: Destination[][], w: Window): DatePair[] {
  const seen = new Map<string, { pair: DatePair; price: number }>();
  for (const list of lists) {
    for (const d of list) {
      if (d.airport !== code || !fitsWindow(d.estimate.outDate, d.estimate.retDate, w)) continue;
      const key = `${d.estimate.outDate}_${d.estimate.retDate}`;
      const prev = seen.get(key);
      if (!prev || d.estimate.price < prev.price) seen.set(key, { pair: { out: d.estimate.outDate, ret: d.estimate.retDate }, price: d.estimate.price });
    }
  }
  return [...seen.values()].sort((a, b) => a.price - b.price).map((x) => x.pair);
}

/**
 * The date pairs to check live: the suggested ones first, then trips of a middling length spread across the
 * window (early, middle, late) until there are `count`.
 */
export function datePairs(w: Window, suggested: DatePair[], count = LIVE_CHECKS): DatePair[] {
  const out: DatePair[] = [];
  const add = (p: DatePair) => {
    if (out.length < count && !out.some((o) => o.out === p.out && o.ret === p.ret)) out.push(p);
  };
  suggested.forEach(add);
  const span = nightsBetween(w.earliestOut, w.latestRet);
  const nights = Math.max(w.minNights, Math.min(w.maxNights, Math.round((w.minNights + w.maxNights) / 2), span));
  const slack = Math.max(0, span - nights);
  for (const share of [0.5, 0.15, 0.85, 0, 1, 0.33, 0.67]) {
    const start = addDays(w.earliestOut, Math.round(slack * share));
    add({ out: start, ret: addDays(start, nights) });
  }
  return out;
}

/** Date pairs travel between screens as text: "2026-12-07_2026-12-14,2026-12-10_2026-12-16". */
export const encodePairs = (pairs: DatePair[]) => pairs.map((p) => `${p.out}_${p.ret}`).join(',');
export function decodePairs(text: unknown): DatePair[] {
  if (typeof text !== 'string') return [];
  return text
    .split(',')
    .map((t) => t.split('_'))
    .filter((p): p is [DateText, DateText] => p.length === 2 && isDate(p[0]) && isDate(p[1]) && p[1] >= p[0])
    .map(([out, ret]) => ({ out, ret }));
}

/** "2026-12-07 06:30" → "06:30". */
export const clock = (stamp: string) => stamp.slice(11, 16) || stamp;

/** 135 → "2h 15m". */
export function durationText(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** How many days after take-off the last flight lands (0 = same day). */
export function arrivalDayShift(it: Itinerary): number {
  const first = it.legs[0]?.departs.slice(0, 10);
  const last = it.legs[it.legs.length - 1]?.arrives.slice(0, 10);
  return isDate(first) && isDate(last) ? nightsBetween(first, last) : 0;
}

/** "TLV → LCA → ATH". */
export const routeText = (it: Itinerary) => [it.legs[0]?.from, ...it.legs.map((l) => l.to)].join(' → ');

/** "Aegean" or "Cyprus Airways, Aegean". */
export const airlinesText = (it: Itinerary) => [...new Set(it.legs.map((l) => l.airline).filter(Boolean))].join(', ');

export function stopsLine(it: Itinerary): string {
  if (it.stops === 0) return 'Nonstop';
  const via = it.layovers.map((l) => `${durationText(l.durationMin)} in ${l.airport}${l.overnight ? ' (overnight)' : ''}`).join(', ');
  return `${it.stops === 1 ? '1 stop' : `${it.stops} stops`}${via ? ` · ${via}` : ''}`;
}

export type Comparison = { count: number; cheapest: number | null; fastestMin: number | null; fewestStops: number | null };

/** The best price, time and stops among a list of options: one line of the comparison between dates. */
export function compare(list: Itinerary[]): Comparison {
  const prices = list.map((i) => i.price).filter((p): p is number => p != null);
  return {
    count: list.length,
    cheapest: prices.length ? Math.min(...prices) : null,
    fastestMin: list.length ? Math.min(...list.map((i) => i.durationMin)) : null,
    fewestStops: list.length ? Math.min(...list.map((i) => i.stops)) : null,
  };
}

/** How many return flights go with an outbound flight, in words. */
export function returnsText(count: number): string {
  return count === 0 ? 'No return flights' : count === 1 ? '1 return flight' : `${count} return flights`;
}

/**
 * The same for a whole date option, from the outbound flights counted so far:
 * "6 return flights" when they all agree or only one was counted, "3–7 return flights" otherwise.
 */
export function returnsRange(counts: number[]): string {
  if (counts.length === 0) return '';
  const lo = Math.min(...counts);
  const hi = Math.max(...counts);
  return lo === hi ? returnsText(lo) : `${lo}–${hi} return flights`;
}

/** The chosen flights, ready to hand to the trip planner. `returnFrom` is the airport flown home from. */
export function buildTrip(origin: string, destination: string, returnFrom: string, adults: number, outbound: Itinerary, inbound: Itinerary): TripSelection {
  // Google shows the whole trip's price on the return option; fall back to the outbound's if it has none
  return { origin, destination, returnFrom, adults, outbound, inbound, price: inbound.price ?? outbound.price };
}

/** Cleans a trip read from storage; null when it isn't one. */
export function sanitizeTrip(raw: unknown): TripSelection | null {
  const t = raw as Partial<TripSelection> | null;
  const okLegs = (i: unknown): i is Itinerary => !!i && Array.isArray((i as Itinerary).legs) && (i as Itinerary).legs.length > 0;
  if (!t || typeof t.origin !== 'string' || typeof t.destination !== 'string' || !okLegs(t.outbound) || !okLegs(t.inbound)) return null;
  return {
    origin: t.origin,
    destination: t.destination,
    returnFrom: typeof t.returnFrom === 'string' ? t.returnFrom : t.destination,
    adults: typeof t.adults === 'number' ? t.adults : 1,
    outbound: t.outbound,
    inbound: t.inbound,
    price: typeof t.price === 'number' ? t.price : null,
  };
}

type Place = { code: string; name: string; city: string; cc: string; lat: number; lon: number };

/** Distance between two places in kilometres (straight line over the globe). */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The airports from `candidates` closest to `from`, nearest first (never `from` itself). */
export function nearest<T extends Place>(from: Place, candidates: T[], count: number): T[] {
  return candidates
    .filter((c) => c.code !== from.code)
    .map((c) => ({ c, d: distanceKm(from, c) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, count)
    .map((x) => x.c);
}

/** Airports matching what was typed: an exact code first, then cities that start with it, then anything containing it. */
export function findAirports<T extends Place>(typed: string, airports: T[], count = 8): T[] {
  const q = typed.trim().toLowerCase();
  if (q.length < 2) return [];
  const score = (a: T) => {
    const city = a.city.toLowerCase();
    if (a.code.toLowerCase() === q) return 0;
    if (city.startsWith(q)) return 1;
    if (city.includes(q)) return 2;
    if (a.name.toLowerCase().includes(q)) return 3;
    return -1;
  };
  return airports
    .map((a) => ({ a, s: score(a) }))
    .filter((x) => x.s >= 0)
    .sort((x, y) => x.s - y.s || x.a.city.localeCompare(y.a.city))
    .slice(0, count)
    .map((x) => x.a);
}
