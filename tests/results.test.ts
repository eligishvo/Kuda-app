import { describe, expect, it } from 'vitest';
import { hitPin } from '../src/map/hitTest';
import { airportByCode, airportLabel } from '../src/map/mapData';
import { labelLimit, Pin, PIN_H, PIN_LIFT, PIN_W, pinShows } from '../src/map/pins';
import { makeView, project } from '../src/map/projection';
import {
  asDestinations, buildMixed, buildOptions, buildResults, buildSameAirport, defaultFilters, filterOptions, mergeOptions, missingDestinations, originOf, planCalls,
  priceText, stopsText, totalCost,
} from '../src/results/results';
import { defaultSearch, lengthNote, lengthRange, Search } from '../src/search/search';
import { normalizeExplore, normalizeOneWays, normalizeTravelpayouts } from '../shared/normalize';
import { Destination } from '../shared/types';
import exploreRaw from './fixtures/explore.json';
import onewaysBackRaw from './fixtures/oneways-back.json';
import onewaysOutRaw from './fixtures/oneways-out.json';
import travelpayoutsRaw from './fixtures/travelpayouts.json';

// 5–9 nights between 5 and 20 December, up to $400
// Exact trip length (no flexibility) unless a test says otherwise
const search: Search = { ...defaultSearch('2026-11-12'), earliestOut: '2026-12-05', latestRet: '2026-12-20', budget: 400, flexDays: 0 };
const explore = [normalizeExplore(exploreRaw)]; // FCO $97 (10–16), ATH $142 (7–14), LGW $268 (2–9: too early)
const estimates = [normalizeTravelpayouts(travelpayoutsRaw)]; // LCA ~$61 (3 nights), BUD ~$110 (8–14), LIS $310 rough (11–20)
const build = (s: Search, selected: string[], ex = explore, es = estimates) => buildResults(s, selected, ex, es, airportByCode);

describe('planning the calls', () => {
  it('asks Google once per month you could leave in, with the matching trip length', () => {
    expect(planCalls(search)).toEqual({
      explore: [{ month: 12, duration: 2 }],
      estimates: [{ from: '2026-12', to: '2026-12' }],
      // One-way fares are always asked for (free): two tickets often make a trip the round-trip lists miss
      oneWays: [{ month: '2026-12', dir: 'out' }, { month: '2026-12', dir: 'back' }],
      routes: [],
    });
    expect(planCalls({ ...search, mixAirports: false }).oneWays).toHaveLength(2);
  });

  it('covers a window that runs into the next month', () => {
    const p = planCalls({ ...search, earliestOut: '2026-12-20', latestRet: '2027-01-25' });
    expect(p.explore).toEqual([{ month: 12, duration: 2 }, { month: 1, duration: 2 }]);
    expect(p.estimates).toEqual([{ from: '2026-12', to: '2026-12' }, { from: '2026-12', to: '2027-01' }, { from: '2027-01', to: '2027-01' }]);
    expect(p.oneWays).toEqual([
      { month: '2026-12', dir: 'out' }, { month: '2027-01', dir: 'out' }, { month: '2026-12', dir: 'back' }, { month: '2027-01', dir: 'back' },
    ]);
  });

  it('leaving in December and returning in early January needs the cross-month estimate too', () => {
    const p = planCalls({ ...search, earliestOut: '2026-12-26', latestRet: '2027-01-04' });
    expect(p.explore).toEqual([{ month: 12, duration: 2 }]);
    expect(p.estimates).toEqual([{ from: '2026-12', to: '2026-12' }, { from: '2026-12', to: '2027-01' }]);
  });

  it('asks the free sources again for each selected airport on its own, up to fifteen', () => {
    const p = planCalls(search, ['VIE', 'ATH', 'VIE']);
    expect(p.routes).toEqual([
      { dest: 'ATH', estimates: [{ from: '2026-12', to: '2026-12' }], oneWays: [{ month: '2026-12', dir: 'out' }, { month: '2026-12', dir: 'back' }] },
      { dest: 'VIE', estimates: [{ from: '2026-12', to: '2026-12' }], oneWays: [{ month: '2026-12', dir: 'out' }, { month: '2026-12', dir: 'back' }] },
    ]);
    expect(p.explore).toEqual(planCalls(search).explore); // no extra Google searches
    const many = Array.from({ length: 30 }, (_, i) => `A${String.fromCharCode(65 + (i % 26))}${i < 26 ? 'A' : 'B'}`);
    expect(planCalls(search, many).routes).toHaveLength(15);
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

describe('the results list', () => {
  const options = buildOptions(search, [], explore, estimates, airportByCode);
  const key = (o: { airport: string; estimate: { price: number } }) => `${o.airport} ${o.estimate.price}`;

  it('lists every priced option that fits the dates, with the airport’s city and name', () => {
    expect(options.map(key).sort()).toEqual(['ATH 142', 'BUD 110', 'BUD 90', 'FCO 97', 'LIS 310']);
    expect(options.find((o) => o.airport === 'BUD' && o.estimate.price === 110)).toMatchObject({
      city: 'Budapest', kind: 'estimate', estimate: { outDate: '2026-12-08', retDate: '2026-12-14', nights: 6, outTime: '05:15', retTime: '21:30' },
    });
  });

  it('keeps only the selected airports when some are selected', () => {
    expect(buildOptions(search, ['ATH', 'SOF'], explore, estimates, airportByCode).map(key)).toEqual(['ATH 142']);
  });

  it('starts from the search’s budget, trip length and options, cheapest first', () => {
    const f = defaultFilters(search);
    expect(f).toEqual({ maxPrice: 400, minDays: 5, maxDays: 9, nonstopOnly: false, liveOnly: false, mixed: true, sort: 'price' });
    expect(filterOptions(options, f).map(key)).toEqual(['BUD 90', 'FCO 97', 'BUD 110', 'ATH 142', 'LIS 310']);
  });

  it('filters by price, length, stops and source', () => {
    const f = defaultFilters(search);
    expect(filterOptions(options, { ...f, maxPrice: 120 }).map(key)).toEqual(['BUD 90', 'FCO 97', 'BUD 110']);
    expect(filterOptions(options, { ...f, minDays: 7, maxDays: 7 }).map(key)).toEqual(['ATH 142']);
    expect(filterOptions(options, { ...f, nonstopOnly: true }).map(key)).toEqual(['BUD 110', 'ATH 142']);
    expect(filterOptions(options, { ...f, liveOnly: true }).map(key)).toEqual(['FCO 97', 'ATH 142']);
  });

  it('sorts by departure date or by length', () => {
    const f = defaultFilters(search);
    expect(filterOptions(options, { ...f, sort: 'date' }).map((o) => o.estimate.outDate)).toEqual(['2026-12-07', '2026-12-08', '2026-12-09', '2026-12-10', '2026-12-11']);
    expect(filterOptions(options, { ...f, sort: 'length' }).map((o) => o.estimate.nights)).toEqual([6, 6, 6, 7, 9]);
  });

  it('multiplies the per-person price by the number of adults', () => {
    expect(totalCost(options.find((o) => o.airport === 'ATH')!, 3)).toBe(426);
  });
});

describe('flying home from a different airport', () => {
  const outs = [normalizeOneWays(onewaysOutRaw, 'out')];
  const backs = [normalizeOneWays(onewaysBackRaw, 'back')];
  const line = (o: { airport: string; back?: { airport: string }; estimate: { price: number; outDate: string; retDate: string } }) =>
    `${o.airport}>${o.back?.airport} ${o.estimate.price} ${o.estimate.outDate.slice(8)}-${o.estimate.retDate.slice(8)}`;

  it('reads one-way fares in both directions, hiding Russian routes', () => {
    expect(outs[0].map((o) => `${o.airport} ${o.price} ${o.confidence}`)).toEqual(['ATH 55 estimate', 'ATH 66 estimate', 'SKG 70 rough', 'FCO 88 estimate']);
    expect(outs[0][0]).toMatchObject({ date: '2026-12-07', time: '06:30', stops: 0, airline: 'A3' });
    expect(backs[0].map((o) => `${o.airport} ${o.price}`)).toEqual(['SKG 33', 'SKG 44', 'ATH 61', 'NAP 72']);
  });

  it('pairs an outbound fare to one selected airport with a return fare from another', () => {
    const mixed = buildMixed(search, ['ATH', 'SKG', 'FCO', 'NAP'], outs, backs, airportByCode);
    // Into Athens on the 7th (55) or 9th (66), home from Thessaloniki on the 14th (44): 7 and 5 days
    expect(mixed.map(line)).toContain('ATH>SKG 99 07-14');
    expect(mixed.map(line)).toContain('ATH>SKG 110 09-14');
    expect(mixed.map(line)).toContain('FCO>NAP 160 10-16');
    // Never the same airport both ways, never dates outside the window (the cheap return on the 30th)
    expect(mixed.every((o) => o.back && o.back.airport !== o.airport)).toBe(true);
    expect(mixed.every((o) => o.estimate.retDate <= '2026-12-20')).toBe(true);
    // Cheapest first
    expect(mixed.map((o) => o.estimate.price)).toEqual([...mixed.map((o) => o.estimate.price)].sort((a, b) => a - b));
  });

  it('describes the combined trip: both times, the worse number of stops, how far to trust it', () => {
    const o = buildMixed(search, ['ATH', 'SKG'], outs, backs, airportByCode).find((x) => line(x) === 'ATH>SKG 99 07-14')!;
    expect(o).toMatchObject({
      city: 'Athens', kind: 'estimate', back: { airport: 'SKG', city: 'Thessaloniki' },
      estimate: { nights: 7, stops: 0, outTime: '06:30', retTime: '18:00', confidence: 'estimate' },
    });
    // Out to Thessaloniki is a connecting fare, so that combination is only rough
    const rough = buildMixed(search, ['ATH', 'SKG'], outs, backs, airportByCode).find((x) => x.airport === 'SKG')!;
    expect(rough).toMatchObject({ kind: 'rough', back: { airport: 'ATH' }, estimate: { stops: 1 } });
  });

  it('with nothing selected, only pairs airports that are near each other', () => {
    const mixed = buildMixed(search, [], outs, backs, airportByCode);
    expect(mixed.map(line)).toContain('ATH>SKG 99 07-14'); // about 300 km apart
    expect(mixed.map(line)).toContain('FCO>NAP 160 10-16'); // about 200 km apart
    expect(mixed.some((o) => o.airport === 'ATH' && o.back?.airport === 'NAP')).toBe(false); // about 900 km
  });

  it('can be switched off in the list', () => {
    const all = [...buildOptions(search, [], explore, estimates, airportByCode), ...buildMixed(search, [], outs, backs, airportByCode)];
    const f = defaultFilters(search);
    expect(filterOptions(all, f).some((o) => o.back)).toBe(true);
    expect(filterOptions(all, { ...f, mixed: false }).some((o) => o.back)).toBe(false);
  });
});

describe('trips made of two one-way tickets to the same airport', () => {
  // The March search that found too little: 10–14 days in March
  const march = { ...search, earliestOut: '2027-03-01', latestRet: '2027-03-31', minNights: 10, maxNights: 14, budget: 450 };
  const ow = (airport: string, date: string, price: number, stops = 0) => ({ airport, date, price, stops, confidence: (stops === 0 ? 'estimate' : 'rough') as 'estimate' | 'rough', time: '06:00' });
  const outs = [[ow('FCO', '2027-03-01', 69), ow('FCO', '2027-03-07', 66), ow('FCO', '2027-03-10', 69), ow('VIE', '2027-03-02', 90)]];
  const backs = [[ow('FCO', '2027-03-17', 68), ow('FCO', '2027-03-09', 67), ow('VIE', '2027-03-30', 95, 1)]];

  it('pairs a fare out with a fare back from the same airport when the length fits', () => {
    const same = buildSameAirport(march, [], outs, backs, airportByCode);
    // Only out on the 7th and back on the 17th is 10–14 days; the others are 2, 7, 8, 16 or 28 days
    expect(same.map((o) => `${o.airport} ${o.estimate.outDate.slice(8)}-${o.estimate.retDate.slice(8)} ${o.estimate.nights} $${o.estimate.price}`)).toEqual(['FCO 07-17 10 $134']);
    expect(same[0]).toMatchObject({ split: true, kind: 'estimate', estimate: { source: 'travelpayouts', stops: 0, outTime: '06:00', retTime: '06:00' } });
    expect(same.every((o) => !o.back)).toBe(true);
  });

  it('marks a trip rough when either ticket has a connection, and respects the selection', () => {
    const wide = { ...march, minNights: 5, maxNights: 30 };
    expect(buildSameAirport(wide, ['VIE'], outs, backs, airportByCode).map((o) => [o.airport, o.kind])).toEqual([['VIE', 'rough']]);
    expect(buildSameAirport(wide, ['ATH'], outs, backs, airportByCode)).toEqual([]);
  });

  it('feeds the map too, and merges with round trips without duplicates', () => {
    const same = buildSameAirport(march, [], outs, backs, airportByCode);
    expect(asDestinations(same)[0]).toMatchObject({ airport: 'FCO', estimate: { price: 134 } });
    const twice = mergeOptions([same, same]);
    expect(twice).toHaveLength(same.length);
    const live = { ...same[0], kind: 'live' as const, estimate: { ...same[0].estimate, price: 120, confidence: 'live' as const, source: 'explore' as const } };
    expect(mergeOptions([same, [live]]).find((o) => o.estimate.outDate === '2027-03-07')?.kind).toBe('live');
  });
});

describe('selected airports with nothing that fits', () => {
  const march = { ...search, earliestOut: '2027-03-01', latestRet: '2027-03-31', minNights: 10, maxNights: 14, budget: 450 };
  const est = (airport: string, outDate: string, retDate: string, price: number, confidence: 'live' | 'estimate' = 'live') => ({
    airport, city: airport, estimate: { source: (confidence === 'live' ? 'explore' : 'travelpayouts') as 'explore' | 'travelpayouts', confidence, price, outDate, retDate, nights: Math.round((Date.parse(retDate) - Date.parse(outDate)) / 86400000), stops: 0 },
  });
  // What the real search returned for Vienna and Amsterdam, and a fitting Rome trip
  const lists = [[est('VIE', '2027-03-21', '2027-04-06', 294), est('AMS', '2027-03-29', '2027-04-13', 411), est('FCO', '2027-03-05', '2027-03-18', 124)], [est('VIE', '2027-03-15', '2027-03-19', 351, 'estimate')]];

  it('names each one with the closest price and why it doesn’t fit, closest first', () => {
    const options = buildOptions(march, ['VIE', 'AMS', 'FCO', 'GRZ'], lists, [], airportByCode);
    const missing = missingDestinations(march, ['VIE', 'AMS', 'FCO', 'GRZ'], lists, options, airportByCode);
    expect(missing.map((m) => m.airport)).toEqual(['VIE', 'AMS', 'GRZ']);
    expect(missing[0]).toMatchObject({ city: 'Vienna', near: { kind: 'estimate', why: '4 days', estimate: { price: 351 } } });
    expect(missing[1].near?.why).toBe('15 days, back 13 Apr');
    expect(missing[2].near).toBeUndefined();
  });

  it('is empty when nothing was selected', () => {
    expect(missingDestinations(march, [], lists, [], airportByCode)).toEqual([]);
  });
});

describe('flexible trip length', () => {
  // The real March search: Google's Vienna trip is 16 days, Amsterdam 15, Rome 13
  const march = { ...search, earliestOut: '2027-03-01', latestRet: '2027-04-10', minNights: 10, maxNights: 14 };
  const est = (airport: string, outDate: string, retDate: string, price: number) => ({
    airport, city: airport, estimate: { source: 'explore' as const, confidence: 'live' as const, price, outDate, retDate, nights: Math.round((Date.parse(retDate) - Date.parse(outDate)) / 86400000), stops: 0 },
  });
  const lists = [[est('VIE', '2027-03-21', '2027-04-06', 294), est('AMS', '2027-03-20', '2027-04-04', 411), est('FCO', '2027-03-05', '2027-03-18', 124), est('ATH', '2027-03-01', '2027-03-08', 99)]];
  const codes = (s: Search) => buildOptions(s, [], lists, [], airportByCode).map((o) => o.airport).sort();

  it('exact: only trips of 10–14 days', () => {
    expect(codes(march)).toEqual(['FCO']);
  });

  it('±2 days also lets in the 15- and 16-day trips; ±3 the 7-day one', () => {
    expect(codes({ ...march, flexDays: 2 })).toEqual(['AMS', 'FCO', 'VIE']);
    expect(codes({ ...march, flexDays: 3 })).toEqual(['AMS', 'ATH', 'FCO', 'VIE']);
  });

  it('starts the list’s length filter from the widened range', () => {
    expect(defaultFilters({ ...march, flexDays: 2 })).toMatchObject({ minDays: 8, maxDays: 16 });
  });

  it('says how far a trip is from the asked length', () => {
    expect([lengthNote(16, march), lengthNote(15, march), lengthNote(12, march), lengthNote(8, march)]).toEqual([
      '2 days longer than asked', '1 day longer than asked', '', '2 days shorter than asked',
    ]);
  });

  it('counts the flexibility when explaining what didn’t fit', () => {
    const m = missingDestinations({ ...march, flexDays: 1 }, ['VIE'], lists, [], airportByCode);
    expect(m[0].near?.why).toBe('16 days');
    expect(missingDestinations({ ...march, flexDays: 2 }, ['VIE'], lists, buildOptions({ ...march, flexDays: 2 }, ['VIE'], lists, [], airportByCode), airportByCode)).toEqual([]);
  });

  it('never goes below one day', () => {
    expect(lengthRange({ ...march, minNights: 2, maxNights: 3, flexDays: 5 })).toEqual({ min: 1, max: 8 });
  });
});

describe('where a price comes from', () => {
  it('names the source and whether it was checked', () => {
    expect(originOf('live')).toMatchObject({ source: 'Google Flights', status: 'Checked' });
    expect(originOf('estimate')).toMatchObject({ source: 'Aviasales', status: 'Estimate' });
    expect(originOf('rough')).toMatchObject({ source: 'Aviasales', status: 'Rough estimate' });
    expect(originOf('none').status).toBe('No price');
    expect(originOf('estimate', true).detail).toMatch(/one-way/);
    expect(originOf('estimate').detail).toMatch(/Not checked live/);
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
