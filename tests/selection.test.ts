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

  it('writes the chips the way the brief shows them', () => {
    const list = chips(
      { GR: 'all', IT: ['FCO', 'NAP'], US: ['ATL', 'BOS', 'JFK', 'LAX', 'ORD'], EH: 'all' },
      (cc) => ({ GR: 'Greece', IT: 'Italy', US: 'United States', EH: 'W. Sahara' })[cc] ?? cc,
      (cc) => (cc === 'GR' ? ['ATH', 'SKG', 'HER'] : cc === 'IT' ? IT : []),
    );
    expect(list.map((c) => c.label)).toEqual([
      'Greece · all 3',
      'Italy · FCO, NAP',
      'United States · ATL, BOS, JFK +2',
      'W. Sahara · no airports',
    ]);
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
