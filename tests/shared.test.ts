import { describe, expect, it } from 'vitest';
import { addDays, durationBucket, fitsWindow, isDate, monthsInWindow, nightsBetween } from '../shared/dates';
import { normalizeExplore, normalizeFlights, normalizeSellers, normalizeTravelpayouts } from '../shared/normalize';
import booking from './fixtures/booking.json';
import explore from './fixtures/explore.json';
import flights from './fixtures/flights.json';
import travelpayouts from './fixtures/travelpayouts.json';

describe('dates', () => {
  it('recognises real dates only', () => {
    expect(isDate('2026-12-07')).toBe(true);
    expect(isDate('2026-13-07')).toBe(false);
    expect(isDate('7/12/2026')).toBe(false);
    expect(isDate(null)).toBe(false);
  });

  it('counts nights and adds days across months and years', () => {
    expect(nightsBetween('2026-12-07', '2026-12-14')).toBe(7);
    expect(nightsBetween('2026-12-28', '2027-01-03')).toBe(6);
    expect(addDays('2026-12-28', 6)).toBe('2027-01-03');
  });

  it('lists the months a window touches', () => {
    expect(monthsInWindow('2026-12-20', '2027-01-10')).toEqual([{ year: 2026, month: 12 }, { year: 2027, month: 1 }]);
    expect(monthsInWindow('2026-12-01', '2026-12-31')).toEqual([{ year: 2026, month: 12 }]);
  });

  it('maps a trip-length range to Google Explore’s three lengths', () => {
    expect(durationBucket(2, 4)).toBe(1);
    expect(durationBucket(5, 9)).toBe(2);
    expect(durationBucket(10, 16)).toBe(3);
  });
});

describe('date window filter', () => {
  const w = { earliestOut: '2026-12-05', latestRet: '2026-12-20', minNights: 5, maxNights: 9 };

  it('keeps a trip inside the window with the right length', () => {
    expect(fitsWindow('2026-12-07', '2026-12-14', w)).toBe(true);
    expect(fitsWindow('2026-12-05', '2026-12-10', w)).toBe(true); // both edges count
    expect(fitsWindow('2026-12-11', '2026-12-20', w)).toBe(true);
  });

  it('drops trips that leave too early, return too late, or are too short or long', () => {
    expect(fitsWindow('2026-12-04', '2026-12-10', w)).toBe(false);
    expect(fitsWindow('2026-12-14', '2026-12-21', w)).toBe(false);
    expect(fitsWindow('2026-12-07', '2026-12-10', w)).toBe(false); // 3 nights
    expect(fitsWindow('2026-12-06', '2026-12-18', w)).toBe(false); // 12 nights
    expect(fitsWindow('bad', '2026-12-10', w)).toBe(false);
  });
});

describe('SerpApi Explore', () => {
  const list = normalizeExplore(explore);

  it('keeps priced destinations with an airport, cheapest first, one per airport', () => {
    expect(list.map((d) => d.airport)).toEqual(['FCO', 'ATH', 'LGW']);
  });

  it('fills in every field of a destination', () => {
    expect(list[1]).toEqual({
      airport: 'ATH',
      city: 'Athens',
      country: 'Greece',
      lat: 37.9838,
      lon: 23.7275,
      estimate: { source: 'explore', confidence: 'live', price: 142, outDate: '2026-12-07', retDate: '2026-12-14', nights: 7, stops: 0, airline: 'Aegean' },
    });
    expect(list[2].estimate.price).toBe(268); // rounded
  });

  it('copes with an empty or unexpected answer', () => {
    expect(normalizeExplore({})).toEqual([]);
    expect(normalizeExplore({ error: 'Empty results' })).toEqual([]);
    expect(normalizeExplore(null)).toEqual([]);
  });

  it('can then be filtered by the date window', () => {
    const w = { earliestOut: '2026-12-05', latestRet: '2026-12-20', minNights: 5, maxNights: 9 };
    const fits = list.filter((d) => fitsWindow(d.estimate.outDate, d.estimate.retDate, w));
    expect(fits.map((d) => d.airport)).toEqual(['FCO', 'ATH']); // London leaves on the 2nd
  });
});

describe('Travelpayouts', () => {
  const list = normalizeTravelpayouts(travelpayouts);
  const of = (airport: string) => list.filter((d) => d.airport === airport);

  it('keeps one option per pair of dates, cheapest first, and hides Russian routes and broken rows', () => {
    expect(list.map((d) => `${d.airport} ${d.estimate.price}`)).toEqual(['LCA 61', 'LCA 67', 'BUD 90', 'BUD 110', 'LIS 310']);
  });

  it('raises nonstop fares by 10%, marks them as estimates and keeps their take-off times', () => {
    expect(of('LCA')[0].estimate).toEqual({
      source: 'travelpayouts', confidence: 'estimate', price: 61, outDate: '2026-12-17', retDate: '2026-12-20', nights: 3, stops: 0,
      airline: 'W6', outTime: '10:00', retTime: '12:00',
    });
    // 55 × 1.1 = 60.5 → 61, and the other Larnaca dates: 61 × 1.1 → 67
    expect(of('LCA')[1].estimate).toMatchObject({ price: 67, outDate: '2026-12-03' });
  });

  it('marks connecting fares as rough and leaves their price alone', () => {
    expect(of('BUD').map((d) => d.estimate.confidence)).toEqual(['rough', 'estimate']);
    expect(of('LIS')[0].estimate).toMatchObject({ confidence: 'rough', price: 310, stops: 1, outTime: '08:00' });
  });

  it('on the same dates a nonstop fare replaces a cheaper connecting one', () => {
    const same = normalizeTravelpayouts({ data: [
      { destination_airport: 'BUD', price: 90, departure_at: '2026-12-08T05:15:00+02:00', return_at: '2026-12-14T21:30:00+01:00', transfers: 1, return_transfers: 1 },
      { destination_airport: 'BUD', price: 100, departure_at: '2026-12-08T07:00:00+02:00', return_at: '2026-12-14T20:00:00+01:00', transfers: 0, return_transfers: 0 },
    ] });
    expect(same).toHaveLength(1);
    expect(same[0].estimate).toMatchObject({ confidence: 'estimate', price: 110, outTime: '07:00' });
  });

  it('keeps at most eight options per airport', () => {
    const data = Array.from({ length: 20 }, (_, i) => ({
      destination_airport: 'ATH', price: 100 + i, departure_at: `2026-12-${String(i + 1).padStart(2, '0')}T06:00:00+02:00`,
      return_at: `2026-12-${String(i + 6).padStart(2, '0')}T20:00:00+02:00`, transfers: 0, return_transfers: 0,
    }));
    expect(normalizeTravelpayouts({ data })).toHaveLength(8);
  });

  it('copes with an empty or failed answer', () => {
    expect(normalizeTravelpayouts({ success: false })).toEqual([]);
    expect(normalizeTravelpayouts(undefined)).toEqual([]);
  });
});

describe('SerpApi Google Flights', () => {
  const list = normalizeFlights(flights);

  it('lists best flights first and skips broken options', () => {
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ stops: 0, durationMin: 135, price: 142, departureToken: 'TOKEN-DIRECT', layovers: [] });
    expect(list[0].legs[0]).toEqual({ airline: 'Aegean', flightNumber: 'A3 929', from: 'TLV', to: 'ATH', departs: '2026-12-07 06:30', arrives: '2026-12-07 08:45', durationMin: 135 });
  });

  it('describes connections and layovers', () => {
    expect(list[1]).toMatchObject({ stops: 1, durationMin: 935, price: 118, departureToken: 'TOKEN-VIA-LCA' });
    expect(list[1].layovers).toEqual([{ airport: 'LCA', durationMin: 765, overnight: true }]);
    expect(list[1].legs.map((l) => `${l.from}-${l.to}`)).toEqual(['TLV-LCA', 'LCA-ATH']);
  });

  it('copes with an empty answer', () => {
    expect(normalizeFlights({})).toEqual([]);
  });
});

describe('who sells a trip', () => {
  const sellers = normalizeSellers(booking);

  it('lists airlines and agencies, cheapest first, unpriced last', () => {
    expect(sellers.map((x) => `${x.name} ${x.price}`)).toEqual(['Wizz Air + Ryanair 115', 'Kiwi.com 131', 'Gotogate 138', 'Aegean 142', 'Call to book null']);
  });

  it('says who is the airline and who is a third party', () => {
    expect(sellers.find((x) => x.name === 'Aegean')).toEqual({ name: 'Aegean', airline: true, price: 142, fare: 'Economy Light', separate: false });
    expect(sellers.find((x) => x.name === 'Kiwi.com')).toMatchObject({ airline: false, separate: false });
    expect(sellers.find((x) => x.name === 'Gotogate')).toMatchObject({ airline: false });
  });

  it('adds up two separate tickets', () => {
    expect(sellers[0]).toEqual({ name: 'Wizz Air + Ryanair', airline: true, price: 115, fare: undefined, separate: true });
  });

  it('never passes on booking links or form data, and copes with an empty answer', () => {
    expect(JSON.stringify(sellers)).not.toContain('secret');
    expect(JSON.stringify(sellers)).not.toContain('google.com');
    expect(normalizeSellers({})).toEqual([]);
    expect(normalizeSellers(null)).toEqual([]);
  });
});
