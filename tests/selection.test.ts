import { describe, expect, it } from 'vitest';
import {
  chips, countryState, EMPTY, isAirportSelected, removeCountry, sanitize, selectAll, selectedAirports,
  toggleAirport, toggleCountry,
} from '../src/selection/selection';

const IT = ['BLQ', 'FCO', 'MXP', 'NAP'];

describe('selection', () => {
  it('tapping a country selects all of it, tapping again clears it', () => {
    const a = toggleCountry(EMPTY, 'GR');
    expect(a).toEqual({ GR: 'all' });
    expect(countryState(a, 'GR')).toBe(1);
    expect(toggleCountry(a, 'GR')).toEqual({});
  });

  it('tapping airports in an unselected country picks just those', () => {
    let s = toggleAirport(EMPTY, 'IT', 'FCO', IT);
    s = toggleAirport(s, 'IT', 'NAP', IT);
    expect(s).toEqual({ IT: ['FCO', 'NAP'] });
    expect(countryState(s, 'IT')).toBe(2);
    expect(isAirportSelected(s, 'IT', 'FCO')).toBe(true);
    expect(isAirportSelected(s, 'IT', 'MXP')).toBe(false);
  });

  it('tapping an airport in a whole-country selection takes that one out', () => {
    const s = toggleAirport({ IT: 'all' }, 'IT', 'MXP', IT);
    expect(s).toEqual({ IT: ['BLQ', 'FCO', 'NAP'] });
  });

  it('picking every airport becomes the whole country; removing the last clears it', () => {
    let s = toggleAirport({ IT: ['BLQ', 'FCO', 'NAP'] }, 'IT', 'MXP', IT);
    expect(s).toEqual({ IT: 'all' });
    s = toggleAirport({ IT: ['FCO'] }, 'IT', 'FCO', IT);
    expect(s).toEqual({});
  });

  it('does not change the selection it was given', () => {
    const s = { GR: 'all' as const };
    toggleCountry(s, 'IT');
    removeCountry(s, 'GR');
    selectAll(s, 'IT');
    expect(s).toEqual({ GR: 'all' });
  });

  it('writes the chips with each airport’s city and code', () => {
    const names: Record<string, string> = { GR: 'Greece', IT: 'Italy', US: 'United States', EH: 'W. Sahara', BG: 'Bulgaria' };
    const cities: Record<string, string> = { FCO: 'Rome', NAP: 'Naples', SOF: 'Sofia', ATL: 'Atlanta', BOS: 'Boston' };
    const list = chips(
      { GR: 'all', IT: ['FCO', 'NAP'], US: ['ATL', 'BOS', 'JFK', 'LAX', 'ORD'], EH: 'all', BG: ['SOF'] },
      (cc) => names[cc] ?? cc,
      (cc) => (cc === 'GR' ? ['ATH', 'SKG', 'HER'] : cc === 'IT' ? IT : []),
      (code) => (cities[code] ? `${cities[code]} (${code})` : code),
    );
    expect(list.map((c) => c.label)).toEqual([
      'Bulgaria · Sofia (SOF)',
      'Greece · all 3',
      'Italy · Rome (FCO), Naples (NAP)',
      'United States · Atlanta (ATL), Boston (BOS) +3',
      'W. Sahara · no airports',
    ]);
    // Without a label function the bare codes are used
    expect(chips({ IT: ['FCO', 'NAP'] }, (cc) => cc, () => IT)[0].label).toBe('IT · FCO, NAP');
  });

  it('lists every selected airport', () => {
    expect(selectedAirports({ GR: 'all', IT: ['FCO'] }, (cc) => (cc === 'GR' ? ['ATH', 'SKG'] : IT)).sort()).toEqual([
      'ATH', 'FCO', 'SKG',
    ]);
  });

  it('cleans up whatever was saved on the phone', () => {
    expect(sanitize(null)).toEqual({});
    expect(sanitize('x')).toEqual({});
    expect(sanitize({ GR: 'all', IT: ['FCO'], XX: 5, YY: [], ZZ: [1] })).toEqual({ GR: 'all', IT: ['FCO'] });
  });
});
