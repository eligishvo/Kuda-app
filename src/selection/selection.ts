// Which destinations are selected: whole countries or only some of their airports.
// Plain functions that return a new selection each time, so they're easy to test and to save.

/** Country code → 'all' (every airport there) or the list of chosen airport codes. */
export type Selection = Record<string, 'all' | string[]>;

export const EMPTY: Selection = {};

/** 0 = not selected, 1 = whole country, 2 = only some airports. */
export function countryState(sel: Selection, cc: string): 0 | 1 | 2 {
  const s = sel[cc];
  return !s ? 0 : s === 'all' ? 1 : 2;
}

export function toggleCountry(sel: Selection, cc: string): Selection {
  const next = { ...sel };
  if (next[cc]) delete next[cc];
  else next[cc] = 'all';
  return next;
}

export function removeCountry(sel: Selection, cc: string): Selection {
  const next = { ...sel };
  delete next[cc];
  return next;
}

export function selectAll(sel: Selection, cc: string): Selection {
  return { ...sel, [cc]: 'all' };
}

/**
 * Tapping one airport. `allCodes` are every airport in that country:
 * in a whole-country selection the tap takes that airport out; otherwise it adds or removes it.
 */
export function toggleAirport(sel: Selection, cc: string, code: string, allCodes: string[]): Selection {
  const cur = sel[cc];
  let list: string[];
  if (!cur) list = [code];
  else if (cur === 'all') list = allCodes.filter((c) => c !== code);
  else list = cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code];
  const next = { ...sel };
  if (list.length === 0) delete next[cc];
  else if (allCodes.length > 0 && allCodes.every((c) => list.includes(c))) next[cc] = 'all';
  else next[cc] = [...list].sort();
  return next;
}

export function isAirportSelected(sel: Selection, cc: string, code: string): boolean {
  const s = sel[cc];
  return s === 'all' || (Array.isArray(s) && s.includes(code));
}

export type Chip = { cc: string; label: string };

/** The removable chips in the selection sheet, e.g. "Greece · all 25", "Italy · FCO, NAP". */
export function chips(
  sel: Selection,
  nameOf: (cc: string) => string,
  airportsOf: (cc: string) => string[],
): Chip[] {
  return Object.keys(sel)
    .map((cc) => {
      const s = sel[cc];
      const all = airportsOf(cc);
      let detail: string;
      if (s === 'all') detail = all.length === 0 ? 'no airports' : `all ${all.length}`;
      else if (s.length <= 3) detail = s.join(', ');
      else detail = `${s.slice(0, 3).join(', ')} +${s.length - 3}`;
      return { cc, label: `${nameOf(cc)} · ${detail}` };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Every selected airport code (whole countries expanded). */
export function selectedAirports(sel: Selection, airportsOf: (cc: string) => string[]): string[] {
  return Object.keys(sel).flatMap((cc) => (sel[cc] === 'all' ? airportsOf(cc) : (sel[cc] as string[])));
}

/** Cleans a selection read from storage (drops anything that isn't the expected shape). */
export function sanitize(raw: unknown): Selection {
  const out: Selection = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [cc, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === 'all') out[cc] = 'all';
    else if (Array.isArray(v) && v.length > 0 && v.every((c) => typeof c === 'string')) out[cc] = v as string[];
  }
  return out;
}
