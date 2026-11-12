import { describe, expect, it } from 'vitest';
import { airportCodesIn, countriesWithAirports } from '../src/map/mapData';
import { defaultSearch, DEFAULT_BUDGET, LIMITS, monthGrid, sanitizeSearch, shortDate, slackDays, summary } from '../src/search/search';
import { addDays, nightsBetween } from '../shared/dates';

const TODAY = '2026-11-12';
const clean = (raw: unknown) => sanitizeSearch(raw, TODAY, airportCodesIn);

describe('search: defaults', () => {
  it('starts from TLV, two weeks out, 5–9 nights, one traveler, the default budget', () => {
    expect(defaultSearch(TODAY)).toEqual({
      departureCc: 'IL', departureAirports: ['TLV'], earliestOut: '2026-11-26', latestRet: '2027-01-11',
      minNights: 5, maxNights: 9, adults: 1, budget: DEFAULT_BUDGET, nonstopOnly: false, mixAirports: true,
    });
    expect(clean(null)).toEqual(defaultSearch(TODAY));
    expect(clean('nonsense')).toEqual(defaultSearch(TODAY));
  });

  it('writes the one-line summary', () => {
    expect(summary(defaultSearch(TODAY))).toBe('TLV · 26 Nov – 11 Jan · 5–9 days · 1 adult · up to $400');
    expect(summary({ ...defaultSearch(TODAY), minNights: 7, maxNights: 7, adults: 2, departureAirports: ['ETM', 'TLV'] })).toBe(
      'ETM, TLV · 26 Nov – 11 Jan · 7 days · 2 adults · up to $400',
    );
    expect(shortDate('2026-12-07')).toBe('7 Dec');
  });
});

describe('search: departure', () => {
  it('keeps only airports that are in the chosen country, at least one', () => {
    expect(clean({ departureCc: 'IL', departureAirports: ['TLV', 'ATH', 'ETM', 'ETM'] }).departureAirports).toEqual(['ETM', 'TLV']);
    expect(clean({ departureCc: 'IL', departureAirports: [] }).departureAirports).toEqual(['TLV']);
  });

  it('picks an airport when the country changes', () => {
    const s = clean({ departureCc: 'GR', departureAirports: [] });
    expect(s.departureCc).toBe('GR');
    expect(s.departureAirports).toHaveLength(1);
    expect(airportCodesIn('GR')).toContain(s.departureAirports[0]);
  });

  it('falls back to Israel for a country without airports', () => {
    expect(clean({ departureCc: 'ZZ', departureAirports: ['XXX'] })).toMatchObject({ departureCc: 'IL', departureAirports: ['TLV'] });
  });

  it('offers named countries with airports, A to Z', () => {
    const list = countriesWithAirports();
    expect(list.length).toBeGreaterThan(150);
    expect(list.find((c) => c.cc === 'IL')).toMatchObject({ name: 'Israel' });
    expect(list.map((c) => c.name)).toEqual([...list.map((c) => c.name)].sort((a, b) => a.localeCompare(b)));
  });
});

describe('search: dates and numbers', () => {
  it('moves dates in the past forward (a search saved weeks ago)', () => {
    const s = clean({ earliestOut: '2026-10-01', latestRet: '2026-10-20' });
    expect(s.earliestOut).toBe(TODAY);
    expect(s.latestRet).toBe(addDays(TODAY, 5)); // long enough for the shortest trip
  });

  it('always leaves room for the shortest trip', () => {
    const s = clean({ earliestOut: '2026-12-10', latestRet: '2026-12-12', minNights: 7, maxNights: 10 });
    expect(nightsBetween(s.earliestOut, s.latestRet)).toBe(7);
    expect(slackDays(s)).toBe(0);
  });

  it('stays inside the six months that have prices', () => {
    const last = addDays(TODAY, LIMITS.horizonDays);
    const s = clean({ earliestOut: '2027-09-01', latestRet: '2027-12-01' });
    expect(s.latestRet).toBe(last);
    expect(s.earliestOut).toBe(addDays(last, -5));
  });

  it('swaps shortest and longest when they are the wrong way round, and clamps everything', () => {
    expect(clean({ minNights: 12, maxNights: 4 })).toMatchObject({ minNights: 4, maxNights: 12 });
    expect(clean({ minNights: 0, maxNights: 99, adults: 0, budget: 5 })).toMatchObject({ minNights: 1, maxNights: 30, adults: 1, budget: 50 });
    expect(clean({ adults: 20, budget: 99999 })).toMatchObject({ adults: 9, budget: 5000 });
    expect(clean({ adults: 2.4, budget: 'lots' })).toMatchObject({ adults: 2, budget: DEFAULT_BUDGET });
  });

  it('cleaning twice changes nothing', () => {
    const once = clean({ departureCc: 'GR', earliestOut: '2026-10-01', minNights: 12, maxNights: 4 });
    expect(clean(once)).toEqual(once);
  });
});

describe('calendar', () => {
  it('lays a month out in weeks starting on Sunday', () => {
    const dec = monthGrid(2026, 12); // 1 December 2026 is a Tuesday
    expect(dec.slice(0, 3)).toEqual([null, null, '2026-12-01']);
    expect(dec.filter(Boolean)).toHaveLength(31);
    expect(dec[dec.length - 1]).toBe('2026-12-31');
    expect(monthGrid(2027, 2).filter(Boolean)).toHaveLength(28);
    expect(monthGrid(2028, 2).filter(Boolean)).toHaveLength(29);
  });
});
