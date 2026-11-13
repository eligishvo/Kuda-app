// The trip the user is searching for: where from, when, how long, how many people and the budget.
// Plain functions (no React) so the rules are easy to test.
import { addDays, isDate, nightsBetween } from '../../shared/dates';
import { DateText } from '../../shared/types';

export type Search = {
  /**
   * Departure country and the one airport in it that every price search and live check flies from
   * (TLV unless you pick another, e.g. Ramon, ETM).
   */
  departureCc: string;
  departureAirport: string;
  earliestOut: DateText;
  latestRet: DateText;
  minNights: number;
  maxNights: number;
  adults: number;
  /** Most to pay per person for the round trip, in US dollars. */
  budget: number;
  /** Only show flights without a stop. */
  nonstopOnly: boolean;
  /** Also offer trips that fly into one airport and home from another. */
  mixAirports: boolean;
  /** Also show trips up to this many days shorter or longer than asked (0 = exactly as asked). */
  flexDays: number;
};

/** The one place to change the starting budget. */
export const DEFAULT_BUDGET = 400;
/** Trip length flexibility to start with: ±2 days. */
export const DEFAULT_FLEX = 2;
export const LIMITS = {
  nights: { min: 1, max: 30 },
  adults: { min: 1, max: 9 },
  budget: { min: 50, max: 5000, step: 25 },
  flex: { max: 5 },
  /** Google Explore only has prices for about the next six months. */
  horizonDays: 180,
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const whole = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback);

export function defaultSearch(today: DateText): Search {
  return {
    departureCc: 'IL',
    departureAirport: 'TLV',
    earliestOut: addDays(today, 14),
    latestRet: addDays(today, 60),
    minNights: 5,
    maxNights: 9,
    adults: 1,
    budget: DEFAULT_BUDGET,
    nonstopOnly: false,
    mixAirports: true,
    flexDays: DEFAULT_FLEX,
  };
}

/**
 * Makes any search valid: used on what was saved on the phone (dates in the past move forward) and after
 * every change on the search screen. `airportsOf` lists the airport codes of a country.
 */
/**
 * The departure airport to use. A saved single airport wins if it is in the country. Searches saved by older
 * versions held a list (sorted, so TLV + Ramon became ETM first and ETM was silently searched): TLV is kept if it
 * was in the list, otherwise the first valid one. With nothing valid: TLV, or the country's first airport.
 */
export function pickDeparture(one: unknown, list: unknown, all: string[]): string {
  if (typeof one === 'string' && all.includes(one)) return one;
  const old = Array.isArray(list) ? list.filter((c): c is string => typeof c === 'string' && all.includes(c)) : [];
  if (old.includes('TLV')) return 'TLV';
  if (old.length > 0) return old[0];
  return all.includes('TLV') ? 'TLV' : all[0];
}

export function sanitizeSearch(raw: unknown, today: DateText, airportsOf: (cc: string) => string[]): Search {
  const d = defaultSearch(today);
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Search, unknown>>;

  let departureCc = typeof r.departureCc === 'string' && airportsOf(r.departureCc).length > 0 ? r.departureCc : d.departureCc;
  let all = airportsOf(departureCc);
  if (all.length === 0) {
    // The map data has no airports for the default either (only in tests): keep the default as is
    departureCc = d.departureCc;
    all = [d.departureAirport];
  }
  const departureAirport = pickDeparture(r.departureAirport, (r as { departureAirports?: unknown }).departureAirports, all);

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
    departureAirport,
    earliestOut,
    latestRet,
    minNights,
    maxNights,
    adults: clamp(whole(r.adults, d.adults), LIMITS.adults.min, LIMITS.adults.max),
    budget: clamp(whole(r.budget, d.budget), LIMITS.budget.min, LIMITS.budget.max),
    nonstopOnly: r.nonstopOnly === true,
    mixAirports: r.mixAirports !== false,
    flexDays: clamp(whole(r.flexDays, d.flexDays), 0, LIMITS.flex.max),
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-12-07" → "7 Dec". */
export function shortDate(d: DateText): string {
  return `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
}

/**
 * Trip length in words. A "day" here is one night away: leaving on the 7th and coming back on the 14th is
 * a 7-day trip (the code calls these nights, the screens say days).
 */
export const daysText = (n: number) => (n === 1 ? '1 day' : `${n} days`);
export const nightsText = (s: Search) =>
  `${s.minNights === s.maxNights ? daysText(s.minNights) : `${s.minNights}–${s.maxNights} days`}${s.flexDays > 0 ? ` (±${s.flexDays})` : ''}`;

/** The trip lengths that are shown: the asked range widened by the flexibility (never below 1 day). */
export const lengthRange = (s: Search) => ({ min: Math.max(1, s.minNights - s.flexDays), max: s.maxNights + s.flexDays });

/** For a trip outside the asked length: "1 day longer than asked", "2 days shorter than asked"; else ''. */
export function lengthNote(days: number, s: Search): string {
  const over = days - s.maxNights;
  const under = s.minNights - days;
  if (over > 0) return `${daysText(over)} longer than asked`;
  if (under > 0) return `${daysText(under)} shorter than asked`;
  return '';
}
export const travelersText = (n: number) => (n === 1 ? '1 adult' : `${n} adults`);

/** The one-line summary shown on the map, e.g. "From TLV · 26 Nov – 11 Jan · 5–9 days (±2) · 1 adult · up to $400". */
export function summary(s: Search): string {
  return [
    `From ${s.departureAirport}`,
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
