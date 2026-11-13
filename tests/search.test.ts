import { describe, expect, it } from 'vitest';
import { airportCodesIn, countriesWithAirports } from '../src/map/mapData';
import { defaultSearch, DEFAULT_BUDGET, LIMITS, monthGrid, sanitizeSearch, shortDate, slackDays, summary } from '../src/search/search';
import { addDays, nightsBetween } from '../shared/dates';

const TODAY = '2026-11-12';
const clean = (raw: unknown) => sanitizeSearch(raw, TODAY, airportCodesIn);

describe('search: defaults', () => {
  it('starts from TLV, two weeks out, 5–9 nights, one traveler, the default budget', () => {
    expect(defaultSearch(TODAY)).toEqual({
      departureCc: 'IL', departureAirport: 'TLV', earliestOut: '2026-11-26', latestRet: '2027-01-11',
      minNights: 5, maxNights: 9, adults: 1, budget: DEFAULT_BUDGET, nonstopOnly: false, mixAirports: true, flexDays: 2,
    });
    expect(clean(null)).toEqual(defaultSearch(TODAY));
    expect(clean('nonsense')).toEqual(defaultSearch(TODAY));
  });

  it('writes the one-line summary', () => {
    expect(summary(defaultSearch(TODAY))).toBe('From TLV · 26 Nov – 11 Jan · 5–9 days (±2) · 1 adult · up to $400');
    expect(summary({ ...defaultSearch(TODAY), minNights: 7, maxNights: 7, adults: 2, departureAirport: 'ETM', flexDays: 0 })).toBe(
      'From ETM · 26 Nov – 11 Jan · 7 days · 2 adults · up to $400',
    );
    expect(shortDate('2026-12-07')).toBe('7 Dec');
  });
});

describe('search: departure', () => {
  it('an old saved search with TLV and Ramon keeps TLV (it used to search ETM silently)', () => {
    expect(clean({ departureCc: 'IL', departureAirports: ['TLV', 'ETM'] }).departureAirport).toBe('TLV');
    expect(clean({ departureCc: 'IL', departureAirports: ['ETM', 'TLV'] }).departureAirport).toBe('TLV');
    // Without TLV: the first valid saved airport, shown as it is
    expect(clean({ departureCc: 'IL', departureAirports: ['ATH', 'ETM'] }).departureAirport).toBe('ETM');
    expect(clean({ departureCc: 'IL', departureAirports: [] }).departureAirport).toBe('TLV');
    expect('departureAirports' in clean({ departureCc: 'IL', departureAirports: ['TLV', 'ETM'] })).toBe(false);
  });

  it('keeps an explicit choice of Ramon (ETM), and refuses an airport outside the country', () => {
    expect(clean({ departureCc: 'IL', departureAirport: 'ETM' }).departureAirport).toBe('ETM');
    expect(clean({ departureCc: 'IL', departureAirport: 'ATH' }).departureAirport).toBe('TLV');
  });

  it('picks an airport when the country changes', () => {
    const s = clean({ departureCc: 'GR', departureAirport: '' });
    expect(s.departureCc).toBe('GR');
    expect(airportCodesIn('GR')).toContain(s.departureAirport);
  });

  it('falls back to Israel for a country without airports', () => {
    expect(clean({ departureCc: 'ZZ', departureAirport: 'XXX' })).toMatchObject({ departureCc: 'IL', departureAirport: 'TLV' });
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
    expect([clean({ flexDays: -1 }).flexDays, clean({ flexDays: 9 }).flexDays, clean({ flexDays: 'x' }).flexDays]).toEqual([0, 5, 2]);
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
