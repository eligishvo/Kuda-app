// The trip the user is searching for: where from, when, how long, how many people and the budget.
// Plain functions (no React) so the rules are easy to test.
import { addDays, isDate, nightsBetween } from '../../shared/dates';
import { DateText } from '../../shared/types';

export type Search = {
  /** Departure country and the airports in it to fly from (at least one). */
  departureCc: string;
  departureAirports: string[];
  earliestOut: DateText;
  latestRet: DateText;
  minNights: number;
  maxNights: number;
  adults: number;
  /** Most to pay per person for the round trip, in US dollars. */
  budget: number;
};

/** The one place to change the starting budget. */
export const DEFAULT_BUDGET = 400;
export const LIMITS = {
  nights: { min: 1, max: 30 },
  adults: { min: 1, max: 9 },
  budget: { min: 50, max: 5000, step: 25 },
  /** Google Explore only has prices for about the next six months. */
  horizonDays: 180,
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const whole = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback);

export function defaultSearch(today: DateText): Search {
  return {
    departureCc: 'IL',
    departureAirports: ['TLV'],
    earliestOut: addDays(today, 14),
    latestRet: addDays(today, 60),
    minNights: 5,
    maxNights: 9,
    adults: 1,
    budget: DEFAULT_BUDGET,
  };
}

/**
 * Makes any search valid: used on what was saved on the phone (dates in the past move forward) and after
 * every change on the search screen. `airportsOf` lists the airport codes of a country.
 */
export function sanitizeSearch(raw: unknown, today: DateText, airportsOf: (cc: string) => string[]): Search {
  const d = defaultSearch(today);
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Search, unknown>>;

  let departureCc = typeof r.departureCc === 'string' && airportsOf(r.departureCc).length > 0 ? r.departureCc : d.departureCc;
  let all = airportsOf(departureCc);
  if (all.length === 0) {
    // The map data has no airports for the default either (only in tests): keep the default as is
    departureCc = d.departureCc;
    all = d.departureAirports;
  }
  const asked = Array.isArray(r.departureAirports) ? r.departureAirports.filter((c): c is string => typeof c === 'string' && all.includes(c)) : [];
  const departureAirports = asked.length > 0 ? [...new Set(asked)].sort() : [all.includes('TLV') ? 'TLV' : all[0]];

  let minNights = clamp(whole(r.minNights, d.minNights), LIMITS.nights.min, LIMITS.nights.max);
  let maxNights = clamp(whole(r.maxNights, d.maxNights), LIMITS.nights.min, LIMITS.nights.max);
  if (maxNights < minNights) [minNights, maxNights] = [maxNights, minNights];

  const last = addDays(today, LIMITS.horizonDays);
  let earliestOut = isDate(r.earliestOut) ? r.earliestOut : d.earliestOut;
  let latestRet = isDate(r.latestRet) ? r.latestRet : d.latestRet;
  if (earliestOut < today) earliestOut = today;
  if (earliestOut > addDays(last, -minNights)) earliestOut = addDays(last, -minNights);
  // The window must be long enough for the shortest trip
  if (latestRet < addDays(earliestOut, minNights)) latestRet = addDays(earliestOut, minNights);
  if (latestRet > last) latestRet = last;

  return {
    departureCc,
    departureAirports,
    earliestOut,
    latestRet,
    minNights,
    maxNights,
    adults: clamp(whole(r.adults, d.adults), LIMITS.adults.min, LIMITS.adults.max),
    budget: clamp(whole(r.budget, d.budget), LIMITS.budget.min, LIMITS.budget.max),
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-12-07" → "7 Dec". */
export function shortDate(d: DateText): string {
  return `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
}

export const nightsText = (s: Search) => (s.minNights === s.maxNights ? `${s.minNights} nights` : `${s.minNights}–${s.maxNights} nights`);
export const travelersText = (n: number) => (n === 1 ? '1 adult' : `${n} adults`);

/** The one-line summary shown on the map, e.g. "TLV · 26 Nov – 11 Jan · 5–9 nights · 1 adult · up to $400". */
export function summary(s: Search): string {
  return [
    s.departureAirports.join(', '),
    `${shortDate(s.earliestOut)} – ${shortDate(s.latestRet)}`,
    nightsText(s),
    travelersText(s.adults),
    `up to $${s.budget}`,
  ].join(' · ');
}

/** How many days the window leaves for choosing when to leave (0 = exactly one possible trip of the shortest length). */
export function slackDays(s: Search): number {
  return nightsBetween(s.earliestOut, s.latestRet) - s.minNights;
}

/** One cell of a month calendar: a date, or null for the blanks before the 1st. */
export function monthGrid(year: number, month: number): (DateText | null)[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // Weeks start on Sunday
  const cells: (DateText | null)[] = Array(first.getUTCDay()).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  return cells;
}
