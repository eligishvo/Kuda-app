import { describe, expect, it } from 'vitest';
import { hitPin } from '../src/map/hitTest';
import { airportByCode, airportLabel } from '../src/map/mapData';
import { labelLimit, Pin, PIN_H, PIN_LIFT, PIN_W, pinShows } from '../src/map/pins';
import { makeView, project } from '../src/map/projection';
import { buildResults, planCalls, priceText, stopsText } from '../src/results/results';
import { defaultSearch, Search } from '../src/search/search';
import { normalizeExplore, normalizeTravelpayouts } from '../shared/normalize';
import { Destination } from '../shared/types';
import exploreRaw from './fixtures/explore.json';
import travelpayoutsRaw from './fixtures/travelpayouts.json';

// 5–9 nights between 5 and 20 December, up to $400
const search: Search = { ...defaultSearch('2026-11-12'), earliestOut: '2026-12-05', latestRet: '2026-12-20', budget: 400 };
const explore = [normalizeExplore(exploreRaw)]; // FCO $97 (10–16), ATH $142 (7–14), LGW $268 (2–9: too early)
const estimates = [normalizeTravelpayouts(travelpayoutsRaw)]; // LCA ~$61 (3 nights), BUD ~$110 (8–14), LIS $310 rough (11–20)
const build = (s: Search, selected: string[], ex = explore, es = estimates) => buildResults(s, selected, ex, es, airportByCode);

describe('planning the calls', () => {
  it('asks Google once per month you could leave in, with the matching trip length', () => {
    expect(planCalls(search)).toEqual({ explore: [{ month: 12, duration: 2 }], estimates: [{ from: '2026-12', to: '2026-12' }] });
  });

  it('covers a window that runs into the next month', () => {
    const p = planCalls({ ...search, earliestOut: '2026-12-20', latestRet: '2027-01-25' });
    expect(p.explore).toEqual([{ month: 12, duration: 2 }, { month: 1, duration: 2 }]);
    expect(p.estimates).toEqual([{ from: '2026-12', to: '2026-12' }, { from: '2026-12', to: '2027-01' }, { from: '2027-01', to: '2027-01' }]);
  });

  it('leaving in December and returning in early January needs the cross-month estimate too', () => {
    const p = planCalls({ ...search, earliestOut: '2026-12-26', latestRet: '2027-01-04' });
    expect(p.explore).toEqual([{ month: 12, duration: 2 }]);
    expect(p.estimates).toEqual([{ from: '2026-12', to: '2026-12' }, { from: '2026-12', to: '2027-01' }]);
  });

  it('never plans more than four Google searches', () => {
    const p = planCalls({ ...search, earliestOut: '2026-12-01', latestRet: '2027-05-30', minNights: 10, maxNights: 16 });
    expect(p.explore).toHaveLength(4);
    expect(p.explore[0]).toEqual({ month: 12, duration: 3 });
    expect(p.estimates.length).toBeLessThanOrEqual(8);
  });
});

describe('building results', () => {
  it('for selected airports: Google first, Travelpayouts to fill gaps, the rest "no estimate"', () => {
    const r = build(search, ['ATH', 'FCO', 'BUD', 'LIS', 'LGW', 'SOF']);
    expect(r.list.map((x) => [x.airport, x.kind, x.estimate?.price])).toEqual([
      ['FCO', 'live', 97],
      ['BUD', 'estimate', 110],
      ['ATH', 'live', 142],
      ['LIS', 'rough', 310],
      ['LGW', 'none', undefined], // Google's London dates start on the 2nd: outside the window
      ['SOF', 'none', undefined],
    ]);
    expect(r.overBudget).toBe(0);
  });

  it('gives each result its city and full airport name', () => {
    const sof = build(search, ['SOF']).list[0];
    expect(sof).toMatchObject({ airport: 'SOF', cc: 'BG', city: 'Sofia', kind: 'none' });
    expect(sof.name).toMatch(/Sofia/);
    expect(airportLabel('SOF')).toBe('Sofia (SOF)');
    expect(airportLabel('ZZZ')).toBe('ZZZ');
  });

  it('with nothing selected, shows everywhere that has a price', () => {
    expect(build(search, []).list.map((x) => x.airport)).toEqual(['FCO', 'BUD', 'ATH', 'LIS']);
  });

  it('leaves out what costs more than the budget, and counts it', () => {
    const r = build({ ...search, budget: 120 }, []);
    expect(r.list.map((x) => x.airport)).toEqual(['FCO', 'BUD']);
    expect(r.overBudget).toBe(2);
    expect(build({ ...search, budget: 142 }, ['ATH']).list).toHaveLength(1); // exactly the budget still counts
  });

  it('drops prices whose trip is the wrong length or outside the window', () => {
    // Larnaca's fare is a 3-night trip; with 5–9 nights it has no estimate
    expect(build(search, ['LCA']).list[0]).toMatchObject({ airport: 'LCA', kind: 'none' });
    expect(build({ ...search, minNights: 2, maxNights: 4 }, ['LCA']).list[0]).toMatchObject({ kind: 'estimate', estimate: { price: 61 } });
  });

  it('prefers Google’s price to a cheaper Travelpayouts one, and the cheapest across months', () => {
    const tp: Destination = { airport: 'ATH', city: 'ATH', estimate: { source: 'travelpayouts', confidence: 'estimate', price: 90, outDate: '2026-12-08', retDate: '2026-12-14', nights: 6, stops: 0 } };
    expect(build(search, ['ATH'], explore, [[tp]]).list[0]).toMatchObject({ kind: 'live', estimate: { price: 142 } });
    const cheaper: Destination = { airport: 'ATH', city: 'Athens', estimate: { source: 'explore', confidence: 'live', price: 120, outDate: '2026-12-09', retDate: '2026-12-15', nights: 6, stops: 0 } };
    expect(build(search, ['ATH'], [...explore, [cheaper]], []).list[0].estimate?.price).toBe(120);
  });

  it('never lists airports in the departure country', () => {
    const tlv: Destination = { airport: 'ETM', city: 'Eilat', estimate: { source: 'explore', confidence: 'live', price: 50, outDate: '2026-12-08', retDate: '2026-12-14', nights: 6, stops: 0 } };
    expect(build(search, [], [[tlv]], []).list).toEqual([]);
  });

  it('writes prices by how much they can be trusted', () => {
    const [fco, bud, , lis, lgw] = build(search, ['ATH', 'FCO', 'BUD', 'LIS', 'LGW']).list;
    expect([priceText(fco), priceText(bud), priceText(lis), priceText(lgw)]).toEqual(['$97', 'from ~$110', 'rough ~$310', 'No estimate']);
    expect([priceText(fco, true), priceText(bud, true), priceText(lis, true), priceText(lgw, true)]).toEqual(['$97', '~$110', '~$310?', '?']);
    expect([stopsText(0), stopsText(1), stopsText(2), stopsText(null)]).toEqual(['nonstop', '1 stop', '2 stops', '']);
  });
});

describe('price pins', () => {
  const W = 400;
  const H = 800;
  const pins: Pin[] = [
    { code: 'ATH', lon: 23.94, lat: 37.94, label: '$142', kind: 'live', rank: 0 },
    { code: 'SKG', lon: 22.97, lat: 40.52, label: '~$160', kind: 'estimate', rank: 30 },
    { code: 'SOF', lon: 23.41, lat: 42.7, label: '?', kind: 'none', rank: 31 },
  ];
  const box = { w: PIN_W, h: PIN_H, lift: PIN_LIFT };

  it('shows a few labels on the globe, more while flattening, all when flat', () => {
    expect([labelLimit(1), labelLimit(2.5), labelLimit(4)]).toEqual([10, 25, 9999]);
    expect(pinShows('live', 0, 1)).toBe(true);
    expect(pinShows('estimate', 30, 1)).toBe(false);
    expect(pinShows('estimate', 30, 4)).toBe(true);
    expect(pinShows('none', 0, 2)).toBe(false);
    expect(pinShows('none', 31, 4)).toBe(true);
  });

  it('a tap on a label picks that pin; the label floats above the airport', () => {
    const v = makeView(23, 39, 5, W, H);
    const ath = project(v, 23.94, 37.94)!;
    expect(hitPin(v, ath.x, ath.y - PIN_LIFT - PIN_H / 2, pins, box, pinShows)?.code).toBe('ATH');
    expect(hitPin(v, ath.x, ath.y + 40, pins, box, pinShows)).toBeNull();
    expect(hitPin(v, ath.x + PIN_W, ath.y - 20, pins, box, pinShows)).toBeNull();
  });

  it('a hidden label can’t be tapped', () => {
    const globe = makeView(23, 39, 1, W, H);
    const skg = project(globe, 22.97, 40.52)!;
    expect(hitPin(globe, skg.x, skg.y - 20, pins.slice(1), box, pinShows)).toBeNull();
  });
});
