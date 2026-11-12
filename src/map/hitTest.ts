// What did the user tap? An airport dot (only on the flat map, where dots are big enough to hit)
// or a country. Runs on the normal JS thread after a tap.
import { geoContains } from 'd3-geo';
import { CountryData, toXyz } from './geometry';
import { invert, MORPH_END, project, View } from './projection';

export type Hit = { kind: 'airport'; code: string; cc: string } | { kind: 'country'; cc: string } | null;

/** How close (pixels) a tap must be to an airport dot. 22 gives each dot a 44-pixel target. */
export const AIRPORT_REACH = 22;

type AirportLike = { code: string; cc: string; lat: number; lon: number; large: boolean };

export function hitAirport(v: View, x: number, y: number, airports: AirportLike[]): AirportLike | null {
  if (v.zoom < MORPH_END) return null;
  let best: AirportLike | null = null;
  let bestD = AIRPORT_REACH * AIRPORT_REACH;
  for (const a of airports) {
    const p = project(v, a.lon, a.lat);
    if (!p) continue;
    const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

/** GeoJSON for one country, rebuilt from the compact file (the last point of each ring repeats the first). */
function toGeoJson(c: CountryData) {
  return {
    type: 'MultiPolygon' as const,
    coordinates: c.polys.map((rings) =>
      rings.map((ring) => {
        const out: [number, number][] = [];
        for (let i = 0; i < ring.length; i += 2) out.push([ring[i] / 100, ring[i + 1] / 100]);
        out.push(out[0]);
        return out;
      }),
    ),
  };
}

export function hitCountry(
  lon: number,
  lat: number,
  countries: CountryData[],
  caps: number[],
): string | null {
  const [x, y, z] = toXyz(lon, lat);
  for (let i = 0; i < countries.length; i++) {
    const c = i * 6;
    // Quick reject: the point is outside the circle around the country
    if (caps[c] * x + caps[c + 1] * y + caps[c + 2] * z < Math.cos(caps[c + 3]) - 1e-6) continue;
    if (geoContains(toGeoJson(countries[i]), [lon, lat])) return countries[i].cc;
  }
  return null;
}

export function hitTest(
  v: View,
  x: number,
  y: number,
  airports: AirportLike[],
  countries: CountryData[],
  caps: number[],
): Hit {
  const a = hitAirport(v, x, y, airports);
  if (a) return { kind: 'airport', code: a.code, cc: a.cc };
  // A tap outside the globe, or on its far side, hits nothing
  const where = invert(v, x, y);
  if (!where) return null;
  const cc = hitCountry(where.lon, where.lat, countries, caps);
  return cc ? { kind: 'country', cc } : null;
}
