import { describe, expect, it } from 'vitest';
import {
  airlinesText, arrivalDayShift, buildTrip, clock, compare, datePairs, decodePairs, distanceKm, durationText, encodePairs,
  findAirports, nearest, returnsRange, returnsText, routeText, sanitizeTrip, stopsLine, suggestedPairs,
} from '../src/flights/flights';
import { airportByCode, AIRPORTS, airportsIn } from '../src/map/mapData';
import { fitsWindow } from '../shared/dates';
import { normalizeExplore, normalizeFlights, normalizeTravelpayouts } from '../shared/normalize';
import exploreRaw from './fixtures/explore.json';
import flightsRaw from './fixtures/flights.json';
import travelpayoutsRaw from './fixtures/travelpayouts.json';

const w = { earliestOut: '2026-12-05', latestRet: '2026-12-20', minNights: 5, maxNights: 9 };
const lists = [normalizeExplore(exploreRaw), normalizeTravelpayouts(travelpayoutsRaw)];
const [direct, viaLarnaca] = normalizeFlights(flightsRaw);

describe('dates to check live', () => {
  it('starts with the dates the price lists suggest', () => {
    expect(suggestedPairs('ATH', lists, w)).toEqual([{ out: '2026-12-07', ret: '2026-12-14' }]);
    expect(suggestedPairs('LGW', lists, w)).toEqual([]); // Google's London dates are outside the window
  });

  it('fills up to three with trips spread across the window, all of them valid', () => {
    const pairs = datePairs(w, suggestedPairs('ATH', lists, w));
    expect(pairs).toHaveLength(3);
    expect(pairs[0]).toEqual({ out: '2026-12-07', ret: '2026-12-14' });
    expect(new Set(pairs.map((p) => `${p.out}_${p.ret}`)).size).toBe(3);
    for (const p of pairs) expect(fitsWindow(p.out, p.ret, w)).toBe(true);
  });

  it('with no suggestion, checks the middle, the start and the end of the window', () => {
    expect(datePairs(w, [])).toEqual([
      { out: '2026-12-09', ret: '2026-12-16' },
      { out: '2026-12-06', ret: '2026-12-13' },
      { out: '2026-12-12', ret: '2026-12-19' },
    ]);
  });

  it('gives one pair when the window fits exactly one trip', () => {
    expect(datePairs({ earliestOut: '2026-12-05', latestRet: '2026-12-10', minNights: 5, maxNights: 9 }, [])).toEqual([{ out: '2026-12-05', ret: '2026-12-10' }]);
  });

  it('survives the trip between screens as text', () => {
    const pairs = datePairs(w, []);
    expect(decodePairs(encodePairs(pairs))).toEqual(pairs);
    expect(decodePairs('2026-12-07_2026-12-14,rubbish,2026-12-14_2026-12-07')).toEqual([{ out: '2026-12-07', ret: '2026-12-14' }]);
    expect(decodePairs(undefined)).toEqual([]);
  });
});

describe('describing flights', () => {
  it('writes times, durations, routes and airlines', () => {
    expect(clock('2026-12-07 06:30')).toBe('06:30');
    expect([durationText(135), durationText(120), durationText(45)]).toEqual(['2h 15m', '2h', '45m']);
    expect(routeText(direct)).toBe('TLV → ATH');
    expect(routeText(viaLarnaca)).toBe('TLV → LCA → ATH');
    expect(airlinesText(viaLarnaca)).toBe('Cyprus Airways');
  });

  it('describes stops and overnight layovers', () => {
    expect(stopsLine(direct)).toBe('Nonstop');
    expect(stopsLine(viaLarnaca)).toBe('1 stop · 12h 45m in LCA (overnight)');
    expect(arrivalDayShift(direct)).toBe(0);
    expect(arrivalDayShift(viaLarnaca)).toBe(1);
  });

  it('compares a list by price, time and stops', () => {
    expect(compare([direct, viaLarnaca])).toEqual({ count: 2, cheapest: 118, fastestMin: 135, fewestStops: 0 });
    expect(compare([])).toEqual({ count: 0, cheapest: null, fastestMin: null, fewestStops: null });
  });
});

describe('counting return flights', () => {
  it('says how many go with one outbound flight', () => {
    expect([returnsText(0), returnsText(1), returnsText(7)]).toEqual(['No return flights', '1 return flight', '7 return flights']);
  });

  it('sums up a date option from the outbound flights counted so far', () => {
    expect(returnsRange([])).toBe('');
    expect(returnsRange([6])).toBe('6 return flights');
    expect(returnsRange([6, 6, 6])).toBe('6 return flights');
    expect(returnsRange([7, 3, 5])).toBe('3–7 return flights');
    expect(returnsRange([0, 4])).toBe('0–4 return flights');
  });
});

describe('the chosen trip', () => {
  it('takes the price from the return option, else from the outbound one', () => {
    expect(buildTrip('TLV', 'ATH', 'ATH', 2, direct, { ...viaLarnaca, price: 301 })).toMatchObject({ origin: 'TLV', destination: 'ATH', returnFrom: 'ATH', adults: 2, price: 301 });
    expect(buildTrip('TLV', 'ATH', 'SKG', 1, direct, { ...viaLarnaca, price: null })).toMatchObject({ returnFrom: 'SKG', price: 142 });
  });

  it('reads a saved trip back, or nothing if it is damaged', () => {
    const trip = buildTrip('TLV', 'ATH', 'SKG', 1, direct, viaLarnaca);
    expect(sanitizeTrip(JSON.parse(JSON.stringify(trip)))).toEqual(trip);
    // A trip saved before "fly back from" existed returns from where it arrived
    const { returnFrom: _old, ...older } = trip;
    expect(sanitizeTrip(older)?.returnFrom).toBe('ATH');
    expect(sanitizeTrip(null)).toBeNull();
    expect(sanitizeTrip({ origin: 'TLV' })).toBeNull();
    expect(sanitizeTrip({ ...trip, outbound: { legs: [] } })).toBeNull();
  });
});

describe('choosing where to fly back from', () => {
  const ath = airportByCode('ATH')!;

  it('measures distance over the globe', () => {
    const skg = airportByCode('SKG')!;
    expect(distanceKm(ath, skg)).toBeGreaterThan(280);
    expect(distanceKm(ath, skg)).toBeLessThan(320);
    expect(distanceKm(ath, ath)).toBe(0);
  });

  it('offers the nearest of the selected airports first, never the arrival airport itself', () => {
    const picks = nearest(ath, [...airportsIn('GR'), ...airportsIn('IT')], 4);
    expect(picks).toHaveLength(4);
    expect(picks.map((a) => a.code)).not.toContain('ATH');
    expect(picks.every((a) => a.cc === 'GR')).toBe(true);
    const d = picks.map((a) => distanceKm(ath, a));
    expect([...d].sort((x, y) => x - y)).toEqual(d);
  });

  it('finds an airport by code, city or name', () => {
    expect(findAirports('skg', AIRPORTS)[0].code).toBe('SKG');
    expect(findAirports('Sof', AIRPORTS).map((a) => a.code)).toContain('SOF');
    expect(findAirports('thessal', AIRPORTS).map((a) => a.code)).toContain('SKG');
    expect(findAirports('s', AIRPORTS)).toEqual([]);
    expect(findAirports('zzzzzz', AIRPORTS)).toEqual([]);
    expect(findAirports('lon', AIRPORTS, 5).length).toBeLessThanOrEqual(5);
  });
});
