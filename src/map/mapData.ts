// Loads the bundled map files once and offers the lookups the rest of the app needs.
import airportsJson from './data/airports.json';
import countries110Json from './data/countries110.json';
import countries50Json from './data/countries50.json';
import { AirportRow, buildAirports, buildGeometry, buildGraticule, CountryData } from './geometry';

export type Airport = { code: string; name: string; city: string; cc: string; lat: number; lon: number; large: boolean };

export const COUNTRIES_LOW = countries110Json as CountryData[];
export const COUNTRIES_HIGH = countries50Json as CountryData[];
export const AIRPORT_ROWS = airportsJson as AirportRow[];

export const AIRPORTS: Airport[] = AIRPORT_ROWS.map((r) => ({
  code: r[0], name: r[1], city: r[2], cc: r[3], lat: r[4], lon: r[5], large: r[6] === 1,
}));

export const GEO_LOW = buildGeometry(COUNTRIES_LOW);
export const GEO_HIGH = buildGeometry(COUNTRIES_HIGH);
export const GRATICULE = buildGraticule();
export const AIRPORT_GEO = buildAirports(AIRPORT_ROWS);

const names = new Map<string, string>();
for (const c of COUNTRIES_HIGH) names.set(c.cc, c.name);
for (const c of COUNTRIES_LOW) if (!names.has(c.cc)) names.set(c.cc, c.name);

const byCountry = new Map<string, Airport[]>();
for (const a of AIRPORTS) {
  const list = byCountry.get(a.cc);
  if (list) list.push(a);
  else byCountry.set(a.cc, [a]);
}
// Large airports first, then by code
for (const list of byCountry.values()) list.sort((a, b) => Number(b.large) - Number(a.large) || a.code.localeCompare(b.code));

const byCode = new Map(AIRPORTS.map((a) => [a.code, a]));

export const countryName = (cc: string) => names.get(cc) ?? cc;
export const airportsIn = (cc: string): Airport[] => byCountry.get(cc) ?? [];
export const airportCodesIn = (cc: string): string[] => airportsIn(cc).map((a) => a.code);
export const airportByCode = (code: string) => byCode.get(code);

/** Countries you can fly from: those with at least one airport and a name, A to Z. */
let withAirports: { cc: string; name: string; count: number }[] | null = null;
export function countriesWithAirports() {
  if (!withAirports) {
    withAirports = [...byCountry.entries()]
      .filter(([cc]) => names.has(cc))
      .map(([cc, list]) => ({ cc, name: names.get(cc) as string, count: list.length }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  return withAirports;
}
