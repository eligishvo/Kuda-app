// Turns the raw price lists from the Worker into what the map and the results list show:
// one line per destination airport, with the best price that fits the user's dates and budget.
// Plain functions (no React, no network) so the rules are easy to test.
import { addDays, durationBucket, fitsWindow, monthsInWindow, nightsBetween, Window } from '../../shared/dates';
import { Destination, OneWay, PriceEstimate } from '../../shared/types';
import { lengthRange, Search, shortDate } from '../search/search';

/** live = Google's price; estimate / rough = older Travelpayouts fares; none = nothing for these dates. */
export type ResultKind = 'live' | 'estimate' | 'rough' | 'none';

export type Result = {
  airport: string;
  cc: string;
  city: string;
  /** Full airport name, e.g. "Sofia Airport". */
  name: string;
  lat: number;
  lon: number;
  kind: ResultKind;
  estimate?: PriceEstimate;
  /** Priced as two one-way tickets (out and back bought separately). */
  split?: boolean;
  /** For an airport with nothing shown: why (no cached fare, wrong dates, over budget, only with stops). */
  reason?: Reason;
  /** That reason in words, e.g. "$450 each, over your $400 budget". */
  note?: string;
};

/**
 * Why a selected airport shows nothing: no fare at all, fares only on other dates, or fares that the search's
 * own rules leave out (over budget, only with stops while "Nonstop only" is on, or another filter).
 */
export type Reason = 'none' | 'dates' | 'budget' | 'nonstop' | 'other';

export type AirportInfo = { code: string; name: string; city: string; cc: string; lat: number; lon: number };

export type Results = {
  /** Priced destinations that pass the search's rules, cheapest first, then the selected ones with nothing. */
  list: Result[];
  /** How many destinations had fares for the dates that the search's rules left out, by reason. */
  excluded: { budget: number; nonstop: number; other: number };
};

/** The most Explore calls one search may make (each is one SerpApi search). */
export const MAX_EXPLORE_CALLS = 4;
export const MAX_ESTIMATE_CALLS = 8;

export type Plan = {
  explore: { month: number; duration: 1 | 2 | 3 }[];
  estimates: { from: string; to: string }[];
  /** One-way fares to and from everywhere (free Travelpayouts calls). */
  oneWays: { month: string; dir: 'out' | 'back' }[];
  /**
   * The same two kinds of free calls again for each selected airport on its own: the answers for "everywhere"
   * hold only a few dates per destination, the ones for a single route hold many more.
   */
  routes: { dest: string; estimates: { from: string; to: string }[]; oneWays: { month: string; dir: 'out' | 'back' }[] }[];
};

export const MAX_ONE_WAY_CALLS = 8;
/** At most this many selected airports get their own calls (they are free, but each takes a moment). */
export const MAX_ROUTE_AIRPORTS = 15;

/**
 * Which Worker calls a search needs. Google Explore is asked once per month you could leave in;
 * Travelpayouts (free) once per month, plus once for trips that leave in one month and return in the next.
 */
export function planCalls(s: Search, selected: string[] = []): Plan {
  // The shortest trip the results accept (the asked minimum minus the flexibility) decides how late you could
  // still leave and how early you could already be back, so no month a fitting trip needs is left out
  const shortest = lengthRange(s).min;
  const lastOut = addDays(s.latestRet, -shortest);
  const months = monthsInWindow(s.earliestOut, lastOut < s.earliestOut ? s.earliestOut : lastOut);
  const duration = durationBucket(s.minNights, s.maxNights);
  const ym = (m: { year: number; month: number }) => `${m.year}-${String(m.month).padStart(2, '0')}`;
  const estimates: Plan['estimates'] = [];
  months.forEach((m, i) => {
    estimates.push({ from: ym(m), to: ym(m) });
    const next = months[i + 1] ?? (ym(m) < s.latestRet.slice(0, 7) ? { year: m.month === 12 ? m.year + 1 : m.year, month: m.month === 12 ? 1 : m.month + 1 } : null);
    if (next) estimates.push({ from: ym(m), to: ym(next) });
  });
  // One-way fares: the months you could leave in, and the months you could come back in
  const firstBack = addDays(s.earliestOut, shortest);
  const backMonths = monthsInWindow(firstBack > s.latestRet ? s.latestRet : firstBack, s.latestRet);
  // Always fetched: two one-way tickets often make a trip the round-trip lists don't have
  const oneWays: Plan['oneWays'] = [
    ...months.map((m) => ({ month: ym(m), dir: 'out' as const })),
    ...backMonths.map((m) => ({ month: ym(m), dir: 'back' as const })),
  ].slice(0, MAX_ONE_WAY_CALLS);
  const routes: Plan['routes'] = [...new Set(selected)]
    .sort()
    .slice(0, MAX_ROUTE_AIRPORTS)
    .map((dest) => ({ dest, estimates: estimates.slice(0, 3), oneWays: oneWays.slice(0, 4) }));
  return {
    explore: months.slice(0, MAX_EXPLORE_CALLS).map((m) => ({ month: m.month, duration })),
    estimates: estimates.slice(0, MAX_ESTIMATE_CALLS),
    oneWays,
    routes,
  };
}

/** The dates and trip lengths that count, with the length widened by the search's flexibility. */
export function windowOf(s: Search): Window {
  const { min, max } = lengthRange(s);
  return { earliestOut: s.earliestOut, latestRet: s.latestRet, minNights: min, maxNights: max };
}

/** Google's price before an Aviasales estimate, and an estimate before a rough (connecting) one. */
const TRUST: Record<ResultKind, number> = { live: 0, estimate: 1, rough: 2, none: 3 };

/**
 * Builds the map's pins from the same options the results list shows, after the same rules
 * (`defaultFilters`: dates and trip length, budget, Nonstop only), so the two always agree. Each arrival
 * airport gets its most trusted fare that passes, then the cheapest. Pins are for trips that come home from
 * the same airport; "home from another airport" lines are in the list only.
 *   selected — the destination airports picked on the map; empty means "anywhere"
 *   options — every dated option (buildOptions + two-ticket trips), before filtering
 *   lists — every raw price list, to tell "no fare at all" from "fares only on other dates"
 *   infoOf — name, city and position of an airport from the bundled data
 */
export function buildResults(
  s: Search,
  selected: string[],
  options: Option[],
  lists: Destination[][],
  infoOf: (code: string) => AirportInfo | undefined,
): Results {
  const f = defaultFilters(s);
  const roundTrips = options.filter((o) => !o.back);
  const best = new Map<string, Option>();
  for (const o of filterOptions(roundTrips, f)) {
    const prev = best.get(o.airport);
    if (!prev || TRUST[o.kind] < TRUST[prev.kind] || (TRUST[o.kind] === TRUST[prev.kind] && o.estimate.price < prev.estimate.price)) best.set(o.airport, o);
  }
  const excluded = { budget: 0, nonstop: 0, other: 0 };
  const anywhere = selected.length === 0;
  const codes = anywhere ? [...new Set(roundTrips.map((o) => o.airport))] : [...new Set(selected)];

  const priced: Result[] = [];
  const none: Result[] = [];
  for (const code of codes) {
    const pick = best.get(code);
    if (pick) {
      const { back: _back, ...result } = pick;
      priced.push(result);
      continue;
    }
    const verdict = whyNothing(s, code, roundTrips, lists, f);
    if (verdict.reason === 'budget' || verdict.reason === 'nonstop' || verdict.reason === 'other') excluded[verdict.reason] += 1;
    if (anywhere) continue;
    const info = infoOf(code);
    if (!info || info.cc === s.departureCc) continue;
    none.push({ airport: code, cc: info.cc, city: info.city || code, name: info.name, lat: info.lat, lon: info.lon, kind: 'none', reason: verdict.reason, note: verdict.note });
  }
  priced.sort((a, b) => a.estimate!.price - b.estimate!.price || a.airport.localeCompare(b.airport));
  none.sort((a, b) => a.city.localeCompare(b.city));
  return { list: [...priced, ...none], excluded };
}

/** Which of the search's rules leaves an option out, checked in this order; null = it is shown. */
export type Exclusion = 'mixed' | 'length' | 'nonstop' | 'live' | 'budget';
export function excludedBy(o: Option, f: Filters): Exclusion | null {
  const e = o.estimate;
  if (!f.mixed && o.back) return 'mixed';
  if (e.nights < f.minDays || e.nights > f.maxDays) return 'length';
  if (f.nonstopOnly && e.stops !== 0) return 'nonstop';
  if (f.liveOnly && o.kind !== 'live') return 'live';
  if (e.price > f.maxPrice) return 'budget';
  return null;
}

/**
 * Why an airport shows nothing, in words. Fares that fit the dates but break a rule come first (the closest
 * to being shown: over budget before "only with stops"), then fares on other dates, then no fare at all.
 */
export function whyNothing(
  s: Search,
  code: string,
  options: Option[],
  lists: Destination[][],
  f: Filters = defaultFilters(s),
): { reason: Reason; note: string; near?: Option } {
  const mine = options.filter((o) => o.airport === code).sort((a, b) => a.estimate.price - b.estimate.price);
  const overBudget = mine.find((o) => excludedBy(o, f) === 'budget');
  if (overBudget) return { reason: 'budget', note: `$${overBudget.estimate.price} each, over your $${f.maxPrice} budget`, near: overBudget };
  const withStops = mine.find((o) => excludedBy(o, f) === 'nonstop');
  if (withStops) return { reason: 'nonstop', note: `Only flights with stops ($${withStops.estimate.price} each); Nonstop only is on`, near: withStops };
  if (mine.length > 0) return { reason: 'other', note: 'Left out by the filters', near: mine[0] };
  let near: PriceEstimate | undefined;
  let score = Infinity;
  for (const list of lists) {
    for (const d of list) {
      if (d.airport !== code) continue;
      const by = missBy(d.estimate, s);
      if (by < score || (by === score && near && d.estimate.price < near.price)) {
        score = by;
        near = d.estimate;
      }
    }
  }
  if (near) return { reason: 'dates', note: `Only other dates: closest ${shortDate(near.outDate)} – ${shortDate(near.retDate)}, ${whyMissed(near, s)}` };
  return { reason: 'none', note: 'No cached fare for this airport in these months' };
}

/** How a price is written: "$142" for Google's, "from ~$110" for estimates, "~$310?" for rough ones. */
export function priceText(r: Result, short = false): string {
  if (!r.estimate) return short ? '?' : 'No estimate';
  const p = `$${r.estimate.price}`;
  if (r.kind === 'live') return p;
  if (r.kind === 'estimate') return short ? `~${p}` : `from ~${p}`;
  return short ? `~${p}?` : `rough ~${p}`;
}

export function stopsText(stops: number | null): string {
  if (stops == null) return '';
  return stops === 0 ? 'nonstop' : stops === 1 ? '1 stop' : `${stops} stops`;
}

/**
 * One line of the results list: a destination on specific dates, with its price.
 * `back` is set when the trip flies home from a different airport than it arrives at.
 */
export type Option = Result & {
  estimate: PriceEstimate;
  back?: { airport: string; city: string; name: string };
};

/** With nothing selected, only airports this close to each other are paired (kilometres). */
export const MIX_RADIUS_KM = 400;
/** How many date combinations are kept per pair of airports, and in total. */
export const MIX_PER_PAIR = 2;
export const MIX_MAX = 300;

function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Trips that fly into one airport and home from another, priced as two one-way tickets:
 * a fare out to airport A plus a fare back from airport B. With destinations selected, A and B are both
 * among them; with nothing selected, B must be within 400 km of A. Dates must fit the window.
 */
export function buildMixed(
  s: Search,
  selected: string[],
  outs: OneWay[][],
  backs: OneWay[][],
  infoOf: (code: string) => AirportInfo | undefined,
): Option[] {
  const w = windowOf(s);
  const wanted = selected.length === 0 ? null : new Set(selected);
  const group = (lists: OneWay[][]) => {
    const m = new Map<string, OneWay[]>();
    for (const list of lists) {
      for (const o of list) {
        const info = infoOf(o.airport);
        if (!info || info.cc === s.departureCc || (wanted && !wanted.has(o.airport))) continue;
        const arr = m.get(o.airport) ?? [];
        // The same airport and date can come from two months' answers: keep the cheaper
        const dup = arr.findIndex((x) => x.date === o.date);
        if (dup < 0) arr.push(o);
        else if (o.price < arr[dup].price) arr[dup] = o;
        m.set(o.airport, arr);
      }
    }
    return m;
  };
  const outBy = group(outs);
  const backBy = group(backs);
  const all: Option[] = [];
  for (const [a, outList] of outBy) {
    const ia = infoOf(a)!;
    for (const [b, backList] of backBy) {
      if (a === b) continue;
      const ib = infoOf(b)!;
      if (!wanted && km(ia, ib) > MIX_RADIUS_KM) continue;
      const combos: Option[] = [];
      for (const o of outList) {
        for (const r of backList) {
          if (!fitsWindow(o.date, r.date, w)) continue;
          combos.push({
            airport: a, cc: ia.cc, city: ia.city || a, name: ia.name, lat: ia.lat, lon: ia.lon,
            kind: o.confidence === 'estimate' && r.confidence === 'estimate' ? 'estimate' : 'rough',
            back: { airport: b, city: ib.city || b, name: ib.name },
            split: true,
            estimate: {
              source: 'travelpayouts',
              confidence: o.confidence === 'estimate' && r.confidence === 'estimate' ? 'estimate' : 'rough',
              price: o.price + r.price,
              outDate: o.date,
              retDate: r.date,
              nights: Math.round((Date.parse(`${r.date}T00:00:00Z`) - Date.parse(`${o.date}T00:00:00Z`)) / 86400000),
              stops: o.stops == null || r.stops == null ? null : Math.max(o.stops, r.stops),
              airline: [...new Set([o.airline, r.airline].filter(Boolean))].join(' + ') || undefined,
              outTime: o.time,
              retTime: r.time,
            },
          });
        }
      }
      combos.sort((x, y) => x.estimate.price - y.estimate.price);
      all.push(...combos.slice(0, MIX_PER_PAIR));
    }
  }
  return all.sort((x, y) => x.estimate.price - y.estimate.price).slice(0, MIX_MAX);
}

/**
 * Every priced option that fits the dates: one per destination and pair of dates (Google's price replaces a
 * Travelpayouts one for the same dates). Unlike buildResults it keeps several dates per destination and is
 * not cut at the budget; the results screen filters and sorts it.
 */
export function buildOptions(
  s: Search,
  selected: string[],
  explore: Destination[][],
  estimates: Destination[][],
  infoOf: (code: string) => AirportInfo | undefined,
): Option[] {
  const w = windowOf(s);
  const wanted = selected.length === 0 ? null : new Set(selected);
  const seen = new Map<string, Option>();
  // Google's lists first, so they win a tie on the same dates
  for (const list of [...explore, ...estimates]) {
    for (const d of list) {
      const e = d.estimate;
      if ((wanted && !wanted.has(d.airport)) || !fitsWindow(e.outDate, e.retDate, w)) continue;
      const key = `${d.airport}_${e.outDate}_${e.retDate}`;
      if (seen.has(key)) continue;
      const info = infoOf(d.airport);
      const lat = info?.lat ?? d.lat;
      const lon = info?.lon ?? d.lon;
      if (lat == null || lon == null || info?.cc === s.departureCc) continue;
      seen.set(key, {
        airport: d.airport, cc: info?.cc ?? '', city: info?.city || d.city || d.airport, name: info?.name ?? d.city ?? d.airport,
        lat, lon, kind: e.confidence, estimate: e,
      });
    }
  }
  return [...seen.values()];
}

export type Sort = 'price' | 'date' | 'length';

export type Filters = {
  /** Most to pay per person. */
  maxPrice: number;
  minDays: number;
  maxDays: number;
  nonstopOnly: boolean;
  /** Only Google's live prices (leave out the older estimates). */
  liveOnly: boolean;
  /** Include trips that fly home from a different airport than they arrive at. */
  mixed: boolean;
  sort: Sort;
};

export const defaultFilters = (s: Search): Filters => ({
  maxPrice: s.budget, minDays: lengthRange(s).min, maxDays: lengthRange(s).max, nonstopOnly: s.nonstopOnly, liveOnly: false, mixed: s.mixAirports, sort: 'price',
});

/** Applies the results screen's filters and sorting. */
export function filterOptions(options: Option[], f: Filters): Option[] {
  const kept = options.filter((o) => excludedBy(o, f) === null);
  const byPrice = (a: Option, b: Option) => a.estimate.price - b.estimate.price || a.estimate.outDate.localeCompare(b.estimate.outDate) || a.airport.localeCompare(b.airport);
  if (f.sort === 'date') kept.sort((a, b) => a.estimate.outDate.localeCompare(b.estimate.outDate) || byPrice(a, b));
  else if (f.sort === 'length') kept.sort((a, b) => a.estimate.nights - b.estimate.nights || byPrice(a, b));
  else kept.sort(byPrice);
  return kept;
}

/** The whole party's cost: prices are per person. */
export const totalCost = (o: Option, adults: number) => o.estimate.price * adults;

/** Where a price comes from and how far to trust it, in words for the screens. */
export type Origin = {
  /** The service the price was read from. */
  source: 'Google Flights' | 'Aviasales';
  /** Short tag, e.g. "Checked", "Estimate". */
  status: 'Checked' | 'Estimate' | 'Rough estimate' | 'No price';
  /** One sentence saying what that means. */
  detail: string;
};

export function originOf(kind: ResultKind, mixed = false): Origin {
  if (kind === 'live') {
    return { source: 'Google Flights', status: 'Checked', detail: 'Google’s price when the search ran (kept for up to 12 hours). The seller is the airline or an agency Google lists; the live check names them.' };
  }
  if (kind === 'estimate') {
    return {
      source: 'Aviasales',
      status: 'Estimate',
      detail: mixed
        ? 'Two nonstop one-way fares other people found on Aviasales in the last week, added together and raised 10%. Not checked live.'
        : 'A nonstop fare other people found on Aviasales in the last week, raised 10%. Not checked live.',
    };
  }
  if (kind === 'rough') {
    return {
      source: 'Aviasales',
      status: 'Rough estimate',
      detail: mixed
        ? 'One-way fares from Aviasales’ cache, at least one with a connection. Often 16–28% off. Not checked live.'
        : 'A connecting fare from Aviasales’ cache. Often 16–28% off. Not checked live.',
    };
  }
  return { source: 'Google Flights', status: 'No price', detail: 'Neither source has a price for these dates. The live check asks Google directly.' };
}

/** How many date combinations of two one-way tickets are kept per airport. */
export const SAME_PER_AIRPORT = 4;

/**
 * Round trips to one airport made of two one-way tickets: out to it, back from it. Budget airlines sell
 * one-way tickets, and the one-way lists hold many more dates than the round-trip lists, so this finds trips
 * of the requested length that the round-trip prices miss.
 */
export function buildSameAirport(
  s: Search,
  selected: string[],
  outs: OneWay[][],
  backs: OneWay[][],
  infoOf: (code: string) => AirportInfo | undefined,
): Option[] {
  const w = windowOf(s);
  const wanted = selected.length === 0 ? null : new Set(selected);
  const byAirport = (lists: OneWay[][]) => {
    const m = new Map<string, Map<string, OneWay>>();
    for (const list of lists) {
      for (const o of list) {
        if (wanted && !wanted.has(o.airport)) continue;
        const dates = m.get(o.airport) ?? new Map<string, OneWay>();
        const prev = dates.get(o.date);
        if (!prev || o.price < prev.price) dates.set(o.date, o);
        m.set(o.airport, dates);
      }
    }
    return m;
  };
  const outBy = byAirport(outs);
  const backBy = byAirport(backs);
  const all: Option[] = [];
  for (const [code, outDates] of outBy) {
    const backDates = backBy.get(code);
    const info = infoOf(code);
    if (!backDates || !info || info.cc === s.departureCc) continue;
    const combos: Option[] = [];
    for (const o of outDates.values()) {
      for (const r of backDates.values()) {
        if (!fitsWindow(o.date, r.date, w)) continue;
        const trusted = o.confidence === 'estimate' && r.confidence === 'estimate';
        combos.push({
          airport: code, cc: info.cc, city: info.city || code, name: info.name, lat: info.lat, lon: info.lon,
          kind: trusted ? 'estimate' : 'rough',
          split: true,
          estimate: {
            source: 'travelpayouts',
            confidence: trusted ? 'estimate' : 'rough',
            price: o.price + r.price,
            outDate: o.date,
            retDate: r.date,
            nights: nightsBetween(o.date, r.date),
            stops: o.stops == null || r.stops == null ? null : Math.max(o.stops, r.stops),
            airline: [...new Set([o.airline, r.airline].filter(Boolean))].join(' + ') || undefined,
            outTime: o.time,
            retTime: r.time,
          },
        });
      }
    }
    // The cheapest few, preferring trusted (nonstop) fares
    combos.sort((x, y) => (x.kind === 'rough' ? 1 : 0) - (y.kind === 'rough' ? 1 : 0) || x.estimate.price - y.estimate.price);
    all.push(...combos.slice(0, SAME_PER_AIRPORT));
  }
  return all;
}

/** Joins lists of options, keeping one per airport pair and dates: the cheaper, or Google's on a tie. */
export function mergeOptions(lists: Option[][]): Option[] {
  const best = new Map<string, Option>();
  for (const list of lists) {
    for (const o of list) {
      const key = `${o.airport}_${o.back?.airport ?? ''}_${o.estimate.outDate}_${o.estimate.retDate}`;
      const prev = best.get(key);
      if (!prev || o.estimate.price < prev.estimate.price || (o.estimate.price === prev.estimate.price && o.kind === 'live')) best.set(key, o);
    }
  }
  return [...best.values()];
}

/** A selected airport with nothing in the list, why, and the nearest fare that was found for it. */
export type Missing = {
  airport: string;
  city: string;
  name: string;
  reason: Reason;
  /** The reason in words, e.g. "Only flights with stops ($210 each); Nonstop only is on". */
  note: string;
  /** The fare that came closest, for its source label. */
  near?: { estimate: PriceEstimate; kind: ResultKind };
};

/** How far a trip is from fitting the search, in days (0 = it fits). */
function missBy(e: PriceEstimate, s: Search): number {
  const { min, max } = lengthRange(s);
  const early = Math.max(0, nightsBetween(e.outDate, s.earliestOut));
  const late = Math.max(0, nightsBetween(s.latestRet, e.retDate));
  const short = Math.max(0, min - e.nights);
  const long = Math.max(0, e.nights - max);
  return early + late + short + long;
}

function whyMissed(e: PriceEstimate, s: Search): string {
  const parts: string[] = [];
  const { min, max } = lengthRange(s);
  if (e.nights < min || e.nights > max) parts.push(`${e.nights} days`);
  if (e.outDate < s.earliestOut) parts.push(`leaves ${shortDate(e.outDate)}`);
  if (e.retDate > s.latestRet) parts.push(`back ${shortDate(e.retDate)}`);
  return parts.join(', ');
}

/**
 * The selected airports with no line in the results list (after the search's own rules: dates, length,
 * budget, Nonstop only), each with why: no cached fare, fares only on other dates, over budget, or only with
 * stops. Closest to fitting first. Empty when nothing is selected.
 */
export function missingDestinations(
  s: Search,
  selected: string[],
  lists: Destination[][],
  options: Option[],
  infoOf: (code: string) => AirportInfo | undefined,
): Missing[] {
  if (selected.length === 0) return [];
  const f = defaultFilters(s);
  const shown = new Set(filterOptions(options, f).map((o) => o.airport));
  const order: Record<Reason, number> = { budget: 0, nonstop: 1, other: 2, dates: 3, none: 4 };
  const out: (Missing & { score: number })[] = [];
  for (const code of [...new Set(selected)]) {
    const info = infoOf(code);
    if (shown.has(code) || !info || info.cc === s.departureCc) continue;
    const v = whyNothing(s, code, options, lists, f);
    let near: Missing['near'] = v.near ? { estimate: v.near.estimate, kind: v.near.kind } : undefined;
    let score = 0;
    if (v.reason === 'dates') {
      // The fare on other dates that came closest, for its source label
      score = Infinity;
      for (const list of lists) {
        for (const d of list) {
          if (d.airport !== code) continue;
          const by = missBy(d.estimate, s);
          if (by < score || (by === score && near && d.estimate.price < near.estimate.price)) {
            score = by;
            near = { estimate: d.estimate, kind: d.estimate.confidence };
          }
        }
      }
    }
    out.push({ airport: code, city: info.city || code, name: info.name, reason: v.reason, note: v.note, near, score: order[v.reason] * 1000 + Math.min(score, 999) });
  }
  return out
    .sort((a, b) => a.score - b.score || a.city.localeCompare(b.city))
    .map(({ score: _score, ...m }) => m);
}

/**
 * The cheapest price list fare for exactly these dates on this route (arrive at `code`, fly home from
 * `back`), for showing next to a date pair before anything is checked live. Undefined when none matches.
 */
export function estimateFor(options: Option[], code: string, back: string, p: { out: string; ret: string }): Option | undefined {
  return options
    .filter((o) => o.airport === code && (o.back?.airport ?? o.airport) === back && o.estimate.outDate === p.out && o.estimate.retDate === p.ret)
    .sort((a, b) => a.estimate.price - b.estimate.price)[0];
}

/** What an empty results list says: no fare for the dates at all, or how many fares each rule left out. */
export function emptyListText(options: Option[], f: Filters): string {
  if (options.length === 0) return 'No cached fare fits these dates. See below for what each airport had, or try wider dates or a different trip length.';
  const count: Record<Exclusion, number> = { mixed: 0, length: 0, nonstop: 0, live: 0, budget: 0 };
  for (const o of options) {
    const why = excludedBy(o, f);
    if (why) count[why] += 1;
  }
  const parts = [
    count.budget ? `${count.budget} over $${f.maxPrice}` : '',
    count.nonstop ? `${count.nonstop} only with stops (Nonstop only is on)` : '',
    count.length ? `${count.length} the wrong length` : '',
    count.live ? `${count.live} estimates (Live prices only is on)` : '',
    count.mixed ? `${count.mixed} flying home from another airport` : '',
  ].filter(Boolean);
  return `Nothing passes the filters: ${parts.join(', ')}.`;
}

/** The map panel's line about destinations left out by the search's rules: "2 over $400 · 1 only with stops". */
export function excludedText(x: Results['excluded'], budget: number): string {
  return [
    x.budget ? `${x.budget} more over $${budget}` : '',
    x.nonstop ? `${x.nonstop} only with stops` : '',
    x.other ? `${x.other} left out by filters` : '',
  ].filter(Boolean).join(' · ');
}
