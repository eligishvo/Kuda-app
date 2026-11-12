import { describe, expect, it } from 'vitest';
import { addDays, durationBucket, fitsWindow, isDate, monthsInWindow, nightsBetween } from '../shared/dates';
import { normalizeExplore, normalizeFlights, normalizeTravelpayouts } from '../shared/normalize';
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

  it('keeps the best fare per airport and hides Russian routes and broken rows', () => {
    expect(list.map((d) => d.airport)).toEqual(['LCA', 'BUD', 'LIS']);
  });

  it('raises nonstop fares by 10% and marks them as estimates', () => {
    expect(list[0].estimate).toMatchObject({ source: 'travelpayouts', confidence: 'estimate', price: 61, outDate: '2026-12-17', retDate: '2026-12-20', nights: 3, stops: 0 });
    // 55 × 1.1 = 60.5 → 61; the cheaper of the two Larnaca fares won
  });

  it('prefers a nonstop fare over a cheaper connecting one', () => {
    expect(list[1].estimate).toMatchObject({ confidence: 'estimate', price: 110, airline: 'W6' });
  });

  it('marks connecting fares as rough and leaves their price alone', () => {
    expect(list[2].estimate).toMatchObject({ confidence: 'rough', price: 310, stops: 1 });
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
