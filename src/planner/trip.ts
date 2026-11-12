// A planned trip: the chosen flights plus what you add around them (a day-by-day plan, where you stay,
// a budget, a checklist and notes). Everything is typed in by hand and kept on the phone.
// Plain functions that return a new trip each time (no React, no storage), so the rules are easy to test.
import { addDays, isDate, nightsBetween } from '../../shared/dates';
import { DateText, TripSelection } from '../../shared/types';

/** One thing to do on a day. */
export type PlanItem = { id: string; time?: string; title: string; note?: string; cost?: number };
/** A place to sleep. `price` is the total for the whole stay, for everyone. */
export type Stay = { id: string; name: string; checkIn: DateText; checkOut: DateText; price?: number; note?: string };
/** Any other cost. `perPerson` costs are multiplied by the number of adults. */
export type Cost = { id: string; label: string; amount: number; perPerson: boolean };
export type CheckItem = { id: string; text: string; done: boolean };

export type Trip = {
  id: string;
  createdAt: number;
  name: string;
  flights: TripSelection;
  /** What the flights cost in total for everyone, in US dollars. Starts from Google's price; editable. */
  flightsCost: number;
  /** Plan items per day, keyed by date. */
  days: Record<DateText, PlanItem[]>;
  stays: Stay[];
  costs: Cost[];
  checklist: CheckItem[];
  notes: string;
};

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const DEFAULT_CHECKLIST = ['Passports valid for the trip', 'Travel insurance', 'Book where to stay', 'Online check-in', 'Transport to and from the airport'];

/** The dates a trip covers: the day you land there and the day you fly home. */
export function tripDates(flights: TripSelection): { arrive: DateText; leave: DateText; depart: DateText } {
  const out = flights.outbound.legs;
  const depart = out[0]?.departs.slice(0, 10) ?? '';
  const landed = out[out.length - 1]?.arrives.slice(0, 10) ?? '';
  const leave = flights.inbound.legs[0]?.departs.slice(0, 10) ?? '';
  const arrive = isDate(landed) ? landed : depart;
  return { depart, arrive, leave: isDate(leave) && leave >= arrive ? leave : arrive };
}

/** Every day you are there, from the day you land to the day you fly home. */
export function daysOf(trip: Trip): DateText[] {
  const { arrive, leave } = tripDates(trip.flights);
  if (!isDate(arrive) || !isDate(leave)) return [];
  const out: DateText[] = [];
  for (let d = arrive; d <= leave && out.length < 60; d = addDays(d, 1)) out.push(d);
  return out;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-12-07" → "Mon 7 Dec". */
export function dayLabel(d: DateText): string {
  const date = new Date(`${d}T00:00:00Z`);
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** Starts a trip from chosen flights. `place` is the destination's name for the trip's title. */
export function newTrip(flights: TripSelection, place: string, now: number, makeId: () => string = newId): Trip {
  const { arrive, leave } = tripDates(flights);
  const when = isDate(arrive) && isDate(leave) ? ` · ${dayLabel(arrive).slice(4)} – ${dayLabel(leave).slice(4)}` : '';
  return {
    id: makeId(),
    createdAt: now,
    name: `${place}${when}`,
    flights,
    flightsCost: flights.price ?? 0,
    days: {},
    stays: [],
    costs: [],
    checklist: DEFAULT_CHECKLIST.map((text) => ({ id: makeId(), text, done: false })),
    notes: '',
  };
}

/** Reads a time as typed ("9", "930", "9:5", "09:30") into "09:30"; undefined when it isn't a time. */
export function parseTime(typed: string): string | undefined {
  const t = typed.trim();
  let h: number;
  let min: number;
  const split = /^(\d{1,2})[:.](\d{1,2})$/.exec(t);
  if (split) {
    h = Number(split[1]);
    min = Number(split[2]);
  } else if (/^\d{1,2}$/.test(t)) {
    // Just the hour: "9" → 09:00
    h = Number(t);
    min = 0;
  } else if (/^\d{3,4}$/.test(t)) {
    // No separator: the last two digits are the minutes, "930" → 09:30
    h = Number(t.slice(0, -2));
    min = Number(t.slice(-2));
  } else {
    return undefined;
  }
  if (h > 23 || min > 59) return undefined;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Reads an amount as typed ("120", "$120", "1,200.5"); undefined when empty or not a number. */
export function parseAmount(typed: string): number | undefined {
  const t = typed.replace(/[$,\s]/g, '');
  if (!t || !/^\d+(\.\d+)?$/.test(t)) return undefined;
  return Math.round(Number(t) * 100) / 100;
}

/** Timed items first in time order, then the untimed ones in the order they were added. */
const byTime = (items: PlanItem[]) =>
  [...items].sort((a, b) => (a.time && b.time ? a.time.localeCompare(b.time) : a.time ? -1 : b.time ? 1 : 0));

// ----- Day-by-day plan -----

/** Adds an item to a day, or replaces the one with the same id. */
export function saveItem(trip: Trip, day: DateText, item: PlanItem): Trip {
  const rest = (trip.days[day] ?? []).filter((i) => i.id !== item.id);
  return { ...trip, days: { ...trip.days, [day]: byTime([...rest, item]) } };
}

export function removeItem(trip: Trip, day: DateText, id: string): Trip {
  const rest = (trip.days[day] ?? []).filter((i) => i.id !== id);
  const days = { ...trip.days };
  if (rest.length) days[day] = rest;
  else delete days[day];
  return { ...trip, days };
}

// ----- Where to stay -----

/** Adds a stay or replaces the one with the same id; stays are kept in date order. */
export function saveStay(trip: Trip, stay: Stay): Trip {
  const rest = trip.stays.filter((s) => s.id !== stay.id);
  return { ...trip, stays: [...rest, stay].sort((a, b) => a.checkIn.localeCompare(b.checkIn)) };
}

export const removeStay = (trip: Trip, id: string): Trip => ({ ...trip, stays: trip.stays.filter((s) => s.id !== id) });

/** The nights of the trip (named by the evening's date) that no stay covers yet. */
export function nightsWithoutStay(trip: Trip): DateText[] {
  const days = daysOf(trip);
  return days.slice(0, -1).filter((night) => !trip.stays.some((s) => s.checkIn <= night && night < s.checkOut));
}

// ----- Budget -----

export const saveCost = (trip: Trip, cost: Cost): Trip => ({ ...trip, costs: [...trip.costs.filter((c) => c.id !== cost.id), cost] });
export const removeCost = (trip: Trip, id: string): Trip => ({ ...trip, costs: trip.costs.filter((c) => c.id !== id) });

export type Budget = { flights: number; stays: number; activities: number; other: number; total: number; perPerson: number };

/** Adds everything up. Activity costs (on plan items) and stays are totals for everyone. */
export function budgetOf(trip: Trip): Budget {
  const adults = Math.max(1, trip.flights.adults);
  const stays = trip.stays.reduce((n, s) => n + (s.price ?? 0), 0);
  const activities = Object.values(trip.days).reduce((n, items) => n + items.reduce((m, i) => m + (i.cost ?? 0), 0), 0);
  const other = trip.costs.reduce((n, c) => n + c.amount * (c.perPerson ? adults : 1), 0);
  const total = Math.round((trip.flightsCost + stays + activities + other) * 100) / 100;
  return { flights: trip.flightsCost, stays, activities, other, total, perPerson: Math.round((total / adults) * 100) / 100 };
}

// ----- Checklist -----

export const addCheck = (trip: Trip, text: string, makeId: () => string = newId): Trip =>
  text.trim() ? { ...trip, checklist: [...trip.checklist, { id: makeId(), text: text.trim(), done: false }] } : trip;
export const toggleCheck = (trip: Trip, id: string): Trip => ({ ...trip, checklist: trip.checklist.map((c) => (c.id === id ? { ...c, done: !c.done } : c)) });
export const removeCheck = (trip: Trip, id: string): Trip => ({ ...trip, checklist: trip.checklist.filter((c) => c.id !== id) });

// ----- Reading trips back from the phone -----

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const numOr = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const optNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/**
 * Cleans the list of trips read from storage: drops anything that isn't a trip and fills in missing parts,
 * so a trip saved by an older version of the app still opens. `flightsOk` checks the flights part.
 */
export function sanitizeTrips(raw: unknown, flightsOk: (f: unknown) => TripSelection | null): Trip[] {
  if (!Array.isArray(raw)) return [];
  const out: Trip[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const flights = flightsOk(r?.flights);
    if (!r || typeof r.id !== 'string' || !flights) continue;
    const days: Record<DateText, PlanItem[]> = {};
    for (const [d, items] of Object.entries((r.days ?? {}) as Record<string, unknown>)) {
      if (!isDate(d) || !Array.isArray(items)) continue;
      const clean = (items as Record<string, unknown>[])
        .filter((i) => i && typeof i.id === 'string' && typeof i.title === 'string')
        .map((i) => ({ id: i.id as string, title: i.title as string, time: parseTime(str(i.time)), note: str(i.note) || undefined, cost: optNum(i.cost) }));
      if (clean.length) days[d] = clean;
    }
    out.push({
      id: r.id,
      createdAt: numOr(r.createdAt, 0),
      name: str(r.name, 'Trip'),
      flights,
      flightsCost: numOr(r.flightsCost, flights.price ?? 0),
      days,
      stays: (Array.isArray(r.stays) ? (r.stays as Record<string, unknown>[]) : [])
        .filter((s) => s && typeof s.id === 'string' && isDate(s.checkIn) && isDate(s.checkOut) && nightsBetween(s.checkIn as string, s.checkOut as string) > 0)
        .map((s) => ({ id: s.id as string, name: str(s.name, 'Stay'), checkIn: s.checkIn as string, checkOut: s.checkOut as string, price: optNum(s.price), note: str(s.note) || undefined })),
      costs: (Array.isArray(r.costs) ? (r.costs as Record<string, unknown>[]) : [])
        .filter((c) => c && typeof c.id === 'string' && typeof c.amount === 'number')
        .map((c) => ({ id: c.id as string, label: str(c.label, 'Cost'), amount: c.amount as number, perPerson: c.perPerson === true })),
      checklist: (Array.isArray(r.checklist) ? (r.checklist as Record<string, unknown>[]) : [])
        .filter((c) => c && typeof c.id === 'string' && typeof c.text === 'string')
        .map((c) => ({ id: c.id as string, text: c.text as string, done: c.done === true })),
      notes: str(r.notes),
    });
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}
