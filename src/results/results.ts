// Turns the raw price lists from the Worker into what the map and the results list show:
// one line per destination airport, with the best price that fits the user's dates and budget.
// Plain functions (no React, no network) so the rules are easy to test.
import { addDays, durationBucket, fitsWindow, monthsInWindow, Window } from '../../shared/dates';
import { Destination, PriceEstimate } from '../../shared/types';
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
};

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
  return {
    explore: months.slice(0, MAX_EXPLORE_CALLS).map((m) => ({ month: m.month, duration })),
    estimates: estimates.slice(0, MAX_ESTIMATE_CALLS),
  };
}

export const windowOf = (s: Search): Window => ({ earliestOut: s.earliestOut, latestRet: s.latestRet, minNights: s.minNights, maxNights: s.maxNights });

/** The cheapest entry per airport among those whose dates fit the window. */
function bestFitting(lists: Destination[][], w: Window): Map<string, Destination> {
  const best = new Map<string, Destination>();
  for (const list of lists) {
    for (const d of list) {
      if (!fitsWindow(d.estimate.outDate, d.estimate.retDate, w)) continue;
      const prev = best.get(d.airport);
      if (!prev || d.estimate.price < prev.estimate.price) best.set(d.airport, d);
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
