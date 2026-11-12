import { describe, expect, it } from 'vitest';
import { buildTrip, sanitizeTrip } from '../src/flights/flights';
import {
  addCheck, budgetOf, dayLabel, daysOf, newTrip, nightsWithoutStay, parseAmount, parseTime, removeCheck, removeCost, removeItem,
  removeStay, sanitizeTrips, saveCost, saveItem, saveStay, toggleCheck, tripDates,
} from '../src/planner/trip';
import { normalizeFlights } from '../shared/normalize';
import { Itinerary } from '../shared/types';
import flightsRaw from './fixtures/flights.json';

const [direct, viaLarnaca] = normalizeFlights(flightsRaw);
// Fly out on the 7th (the connecting option lands on the 8th), fly home on the 14th
const home: Itinerary = { ...direct, legs: [{ ...direct.legs[0], from: 'ATH', to: 'TLV', departs: '2026-12-14 20:00', arrives: '2026-12-14 22:05' }], price: 284 };
const flights = buildTrip('TLV', 'ATH', 'ATH', 2, direct, home);
let n = 0;
const ids = () => `id${++n}`;
const fresh = () => {
  n = 0;
  return newTrip(flights, 'Athens', 1000, ids);
};

describe('starting a trip', () => {
  it('names it after the place and dates and starts the budget from the flights', () => {
    const t = fresh();
    expect(t).toMatchObject({ id: 'id1', createdAt: 1000, name: 'Athens · 7 Dec – 14 Dec', flightsCost: 284, days: {}, stays: [], costs: [], notes: '' });
    expect(t.checklist.length).toBeGreaterThan(3);
    expect(t.checklist.every((c) => !c.done)).toBe(true);
  });

  it('covers every day from landing to flying home', () => {
    expect(tripDates(flights)).toEqual({ depart: '2026-12-07', arrive: '2026-12-07', leave: '2026-12-14' });
    expect(daysOf(fresh())).toHaveLength(8);
    expect(daysOf(fresh())[0]).toBe('2026-12-07');
    expect(dayLabel('2026-12-07')).toBe('Mon 7 Dec');
  });

  it('starts on the landing day when the flight out arrives the next day', () => {
    const late = newTrip(buildTrip('TLV', 'ATH', 'ATH', 1, viaLarnaca, home), 'Athens', 1, ids);
    expect(tripDates(late.flights)).toMatchObject({ depart: '2026-12-07', arrive: '2026-12-08' });
    expect(daysOf(late)[0]).toBe('2026-12-08');
    expect(late.name).toBe('Athens · 8 Dec – 14 Dec');
  });
});

describe('typing times and amounts', () => {
  it('reads times however they are typed', () => {
    expect([parseTime('9'), parseTime('930'), parseTime('9:5'), parseTime('09:30'), parseTime('18.45'), parseTime('1730')]).toEqual([
      '09:00', '09:30', '09:05', '09:30', '18:45', '17:30',
    ]);
    expect([parseTime(''), parseTime('25:00'), parseTime('9:75'), parseTime('noon')]).toEqual([undefined, undefined, undefined, undefined]);
  });

  it('reads amounts with or without a dollar sign', () => {
    expect([parseAmount('120'), parseAmount('$120'), parseAmount('1,200.5'), parseAmount(' 45.999 ')]).toEqual([120, 120, 1200.5, 46]);
    expect([parseAmount(''), parseAmount('abc'), parseAmount('-5')]).toEqual([undefined, undefined, undefined]);
  });
});

describe('the day-by-day plan', () => {
  it('keeps a day in time order, untimed items last', () => {
    let t = fresh();
    t = saveItem(t, '2026-12-08', { id: 'a', title: 'Acropolis', time: '10:00', cost: 40 });
    t = saveItem(t, '2026-12-08', { id: 'b', title: 'Wander Plaka' });
    t = saveItem(t, '2026-12-08', { id: 'c', title: 'Breakfast', time: '08:30' });
    expect(t.days['2026-12-08'].map((i) => i.title)).toEqual(['Breakfast', 'Acropolis', 'Wander Plaka']);
  });

  it('edits an item in place and removes items, dropping empty days', () => {
    let t = saveItem(fresh(), '2026-12-08', { id: 'a', title: 'Acropolis', time: '10:00' });
    t = saveItem(t, '2026-12-08', { id: 'a', title: 'Acropolis Museum', time: '15:00', note: 'Book ahead' });
    expect(t.days['2026-12-08']).toEqual([{ id: 'a', title: 'Acropolis Museum', time: '15:00', note: 'Book ahead' }]);
    expect(removeItem(t, '2026-12-08', 'a').days).toEqual({});
  });

  it('never changes the trip it was given', () => {
    const t = fresh();
    saveItem(t, '2026-12-08', { id: 'a', title: 'x' });
    saveStay(t, { id: 's', name: 'Hotel', checkIn: '2026-12-07', checkOut: '2026-12-10' });
    toggleCheck(t, t.checklist[0].id);
    expect(t.days).toEqual({});
    expect(t.stays).toEqual([]);
    expect(t.checklist[0].done).toBe(false);
  });
});

describe('where to stay', () => {
  it('lists the nights that still have nowhere to sleep', () => {
    let t = fresh();
    expect(nightsWithoutStay(t)).toHaveLength(7);
    t = saveStay(t, { id: 's1', name: 'Hotel Plaka', checkIn: '2026-12-07', checkOut: '2026-12-11', price: 400 });
    expect(nightsWithoutStay(t)).toEqual(['2026-12-11', '2026-12-12', '2026-12-13']);
    t = saveStay(t, { id: 's2', name: 'Island room', checkIn: '2026-12-11', checkOut: '2026-12-14', price: 210 });
    expect(nightsWithoutStay(t)).toEqual([]);
    expect(t.stays.map((s) => s.name)).toEqual(['Hotel Plaka', 'Island room']);
    expect(nightsWithoutStay(removeStay(t, 's1'))).toHaveLength(4);
  });
});

describe('the budget', () => {
  it('adds flights, stays, activities and other costs, per person and in total', () => {
    let t = fresh(); // 2 adults, flights 284
    t = saveStay(t, { id: 's1', name: 'Hotel', checkIn: '2026-12-07', checkOut: '2026-12-14', price: 700 });
    t = saveItem(t, '2026-12-08', { id: 'a', title: 'Acropolis', cost: 40 });
    t = saveItem(t, '2026-12-09', { id: 'b', title: 'Boat trip', cost: 120 });
    t = saveCost(t, { id: 'c1', label: 'Food per day × 7', amount: 210, perPerson: true });
    t = saveCost(t, { id: 'c2', label: 'Car rental', amount: 150, perPerson: false });
    expect(budgetOf(t)).toEqual({ flights: 284, stays: 700, activities: 160, other: 570, total: 1714, perPerson: 857 });
    expect(budgetOf(removeCost(t, 'c1')).other).toBe(150);
    expect(budgetOf({ ...t, flightsCost: 300 }).total).toBe(1730);
  });

  it('is just the flights for a new trip', () => {
    expect(budgetOf(fresh())).toEqual({ flights: 284, stays: 0, activities: 0, other: 0, total: 284, perPerson: 142 });
  });
});

describe('the checklist', () => {
  it('adds, ticks and removes items, ignoring empty text', () => {
    let t = fresh();
    const before = t.checklist.length;
    t = addCheck(t, '  Adapter plug ', ids);
    expect(t.checklist[before]).toMatchObject({ text: 'Adapter plug', done: false });
    expect(addCheck(t, '   ', ids).checklist).toHaveLength(before + 1);
    const id = t.checklist[before].id;
    expect(toggleCheck(t, id).checklist[before].done).toBe(true);
    expect(removeCheck(t, id).checklist).toHaveLength(before);
  });
});

describe('trips saved on the phone', () => {
  it('reads trips back as they were saved, newest first', () => {
    let a = fresh();
    a = saveItem(a, '2026-12-08', { id: 'a', title: 'Acropolis', time: '10:00', cost: 40 });
    a = saveStay(a, { id: 's1', name: 'Hotel', checkIn: '2026-12-07', checkOut: '2026-12-14', price: 700 });
    const b = { ...newTrip(flights, 'Rome', 2000, ids), notes: 'Ask about late check-out' };
    const back = sanitizeTrips(JSON.parse(JSON.stringify([a, b])), sanitizeTrip);
    expect(back.map((t) => t.name)).toEqual([b.name, a.name]);
    expect(back[1]).toEqual(a);
    expect(back[0].notes).toBe('Ask about late check-out');
  });

  it('drops what isn’t a trip and repairs what is incomplete', () => {
    const t = fresh();
    const back = sanitizeTrips(
      [
        null,
        { id: 'x' },
        { id: 'old', flights: t.flights },
        { ...t, id: 'messy', days: { 'not-a-date': [{ id: 'a', title: 'x' }], '2026-12-08': [{ id: 'a', title: 'Ok', time: '99:99' }, { title: 'no id' }] }, stays: [{ id: 's', checkIn: '2026-12-10', checkOut: '2026-12-09' }] },
      ],
      sanitizeTrip,
    );
    expect(back.map((x) => x.id).sort()).toEqual(['messy', 'old']);
    const old = back.find((x) => x.id === 'old')!;
    expect(old).toMatchObject({ name: 'Trip', flightsCost: 284, days: {}, stays: [], checklist: [], notes: '' });
    const messy = back.find((x) => x.id === 'messy')!;
    expect(messy.days).toEqual({ '2026-12-08': [{ id: 'a', title: 'Ok', time: undefined, note: undefined, cost: undefined }] });
    expect(messy.stays).toEqual([]);
    expect(sanitizeTrips('nonsense', sanitizeTrip)).toEqual([]);
  });
});
