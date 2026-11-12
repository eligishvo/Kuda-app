// Turns the raw price lists from the Worker into what the map and the results list show:
// one line per destination airport, with the best price that fits the user's dates and budget.
// Plain functions (no React, no network) so the rules are easy to test.
import { addDays, durationBucket, fitsWindow, monthsInWindow, Window } from '../../shared/dates';
import { Destination, OneWay, PriceEstimate } from '../../shared/types';
import { Search } from '../search/search';

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
};

export type AirportInfo = { code: string; name: string; city: string; cc: string; lat: number; lon: number };

export type Results = {
  /** Priced destinations within budget, cheapest first, then the ones with no estimate. */
  list: Result[];
  /** How many priced destinations were left out for costing more than the budget. */
  overBudget: number;
};

/** The most Explore calls one search may make (each is one SerpApi search). */
export const MAX_EXPLORE_CALLS = 4;
export const MAX_ESTIMATE_CALLS = 8;

export type Plan = {
  explore: { month: number; duration: 1 | 2 | 3 }[];
  estimates: { from: string; to: string }[];
  /** One-way fares, only when trips returning from another airport are wanted (free Travelpayouts calls). */
  oneWays: { month: string; dir: 'out' | 'back' }[];
};

export const MAX_ONE_WAY_CALLS = 8;

/**
 * Which Worker calls a search needs. Google Explore is asked once per month you could leave in;
 * Travelpayouts (free) once per month, plus once for trips that leave in one month and return in the next.
 */
export function planCalls(s: Search): Plan {
  const lastOut = addDays(s.latestRet, -s.minNights);
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
  const firstBack = addDays(s.earliestOut, s.minNights);
  const backMonths = monthsInWindow(firstBack > s.latestRet ? s.latestRet : firstBack, s.latestRet);
  const oneWays: Plan['oneWays'] = s.mixAirports
    ? [...months.map((m) => ({ month: ym(m), dir: 'out' as const })), ...backMonths.map((m) => ({ month: ym(m), dir: 'back' as const }))].slice(0, MAX_ONE_WAY_CALLS)
    : [];
  return {
    explore: months.slice(0, MAX_EXPLORE_CALLS).map((m) => ({ month: m.month, duration })),
    estimates: estimates.slice(0, MAX_ESTIMATE_CALLS),
    oneWays,
  };
}

export const windowOf = (s: Search): Window => ({ earliestOut: s.earliestOut, latestRet: s.latestRet, minNights: s.minNights, maxNights: s.maxNights });

/** Connecting Travelpayouts fares are the least trustworthy, so anything else is preferred to them. */
const trust = (d: Destination) => (d.estimate.confidence === 'rough' ? 1 : 0);

/** The best entry per airport among those whose dates fit the window: trusted before rough, then the cheapest. */
function bestFitting(lists: Destination[][], w: Window): Map<string, Destination> {
  const best = new Map<string, Destination>();
  for (const list of lists) {
    for (const d of list) {
      if (!fitsWindow(d.estimate.outDate, d.estimate.retDate, w)) continue;
      const prev = best.get(d.airport);
      if (!prev || trust(d) < trust(prev) || (trust(d) === trust(prev) && d.estimate.price < prev.estimate.price)) best.set(d.airport, d);
    }
  }
  return best;
}

/**
 * Builds the results.
 *   selected — the destination airports the user picked on the map; empty means "anywhere"
 *   explore / estimates — what the Worker returned for each planned call
 *   infoOf — name, city and position of an airport from the bundled data
 * Google's price wins; Travelpayouts only fills airports Google gave nothing usable for.
 */
export function buildResults(
  s: Search,
  selected: string[],
  explore: Destination[][],
  estimates: Destination[][],
  infoOf: (code: string) => AirportInfo | undefined,
): Results {
  const w = windowOf(s);
  const live = bestFitting(explore, w);
  const filler = bestFitting(estimates, w);
  const anywhere = selected.length === 0;
  const codes = anywhere ? [...new Set([...live.keys(), ...filler.keys()])] : [...new Set(selected)];

  const priced: Result[] = [];
  const none: Result[] = [];
  let overBudget = 0;
  for (const code of codes) {
    const found = live.get(code) ?? filler.get(code);
    const info = infoOf(code);
    // An airport that is neither in the bundled data nor located by Google can't be put on the map
    const lat = info?.lat ?? found?.lat;
    const lon = info?.lon ?? found?.lon;
    if (lat == null || lon == null) continue;
    if (info?.cc === s.departureCc) continue;
    const base = { airport: code, cc: info?.cc ?? '', city: info?.city || found?.city || code, name: info?.name ?? found?.city ?? code, lat, lon };
    if (!found) {
      none.push({ ...base, kind: 'none' });
    } else if (found.estimate.price > s.budget) {
      overBudget += 1;
    } else {
      priced.push({ ...base, kind: found.estimate.confidence, estimate: found.estimate });
    }
  }
  priced.sort((a, b) => a.estimate!.price - b.estimate!.price || a.airport.localeCompare(b.airport));
  none.sort((a, b) => a.city.localeCompare(b.city));
  return { list: [...priced, ...none], overBudget };
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
export type Option = Result & { estimate: PriceEstimate; back?: { airport: string; city: string; name: string } };

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
  maxPrice: s.budget, minDays: s.minNights, maxDays: s.maxNights, nonstopOnly: s.nonstopOnly, liveOnly: false, mixed: s.mixAirports, sort: 'price',
});

/** Applies the results screen's filters and sorting. */
export function filterOptions(options: Option[], f: Filters): Option[] {
  const kept = options.filter((o) => {
    const e = o.estimate;
    if (e.price > f.maxPrice || e.nights < f.minDays || e.nights > f.maxDays) return false;
    if (f.nonstopOnly && e.stops !== 0) return false;
    if (f.liveOnly && o.kind !== 'live') return false;
    if (!f.mixed && o.back) return false;
    return true;
  });
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
