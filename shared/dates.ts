// Date helpers shared by the app and the Worker. Dates are plain text ("2026-12-07") and are treated as
// calendar days with no time zone, so a trip never shifts by a day.
import { DateText } from './types';

const DAY = 86400000;

export const isDate = (s: unknown): s is DateText =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

const toMs = (d: DateText) => Date.parse(`${d}T00:00:00Z`);

export const addDays = (d: DateText, days: number): DateText => new Date(toMs(d) + days * DAY).toISOString().slice(0, 10);

/** Nights between two dates (7 for Monday → next Monday). */
export const nightsBetween = (out: DateText, ret: DateText): number => Math.round((toMs(ret) - toMs(out)) / DAY);

/** The user's travel window: leave no earlier than, be back no later than, and stay this many nights. */
export type Window = { earliestOut: DateText; latestRet: DateText; minNights: number; maxNights: number };

/** Does a trip on these dates fit the window? */
export function fitsWindow(outDate: DateText, retDate: DateText, w: Window): boolean {
  if (!isDate(outDate) || !isDate(retDate)) return false;
  const nights = nightsBetween(outDate, retDate);
  return outDate >= w.earliestOut && retDate <= w.latestRet && nights >= w.minNights && nights <= w.maxNights;
}

/** The calendar months a window touches, e.g. Dec 20 → Jan 10 gives [{2026, 12}, {2027, 1}]. */
export function monthsInWindow(earliestOut: DateText, latestRet: DateText): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  let y = Number(earliestOut.slice(0, 4));
  let m = Number(earliestOut.slice(5, 7));
  const endY = Number(latestRet.slice(0, 4));
  const endM = Number(latestRet.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (out.length > 24) break;
  }
  return out;
}

/**
 * Google Explore only knows three trip lengths: 1 = weekend, 2 = one week, 3 = two weeks.
 * Picks the one closest to the middle of the user's range.
 */
export function durationBucket(minNights: number, maxNights: number): 1 | 2 | 3 {
  const mid = (minNights + maxNights) / 2;
  if (mid <= 4) return 1;
  if (mid <= 10) return 2;
  return 3;
}
