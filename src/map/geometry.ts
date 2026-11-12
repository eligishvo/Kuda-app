// Turns the bundled map files into flat lists of numbers that the drawing code can walk quickly.
// Points are stored as x, y, z on a unit sphere, so projecting one needs no trigonometry.

import { DEG } from './projection';

export type CountryData = { cc: string; name: string; polys: number[][][] };
/** [IATA, name, city, country, lat, lon, 1 = large / 0 = medium] */
export type AirportRow = [string, string, string, string, number, number, number];

export type Geometry = {
  /** x, y, z for every point, one ring after another. */
  pts: number[];
  /** Per ring: index of its first point, number of points. */
  rings: number[];
  /** Per country: centre x, y, z; radius (radians) of the circle that contains it; first ring; ring count. */
  caps: number[];
  /** Country codes, in the same order as caps. */
  codes: string[];
};

export const CAP = 6;
export const RING = 2;

export function toXyz(lon: number, lat: number): [number, number, number] {
  const l = lon * DEG;
  const p = lat * DEG;
  const cp = Math.cos(p);
  return [cp * Math.cos(l), cp * Math.sin(l), Math.sin(p)];
}

export function buildGeometry(countries: CountryData[]): Geometry {
  const pts: number[] = [];
  const rings: number[] = [];
  const caps: number[] = [];
  const codes: string[] = [];
  for (const c of countries) {
    const firstRing = rings.length / RING;
    const firstPoint = pts.length / 3;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (const poly of c.polys) {
      for (const ring of poly) {
        rings.push(pts.length / 3, ring.length / 2);
        for (let i = 0; i < ring.length; i += 2) {
          const [x, y, z] = toXyz(ring[i] / 100, ring[i + 1] / 100);
          pts.push(x, y, z);
          sx += x;
          sy += y;
          sz += z;
        }
      }
    }
    const len = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
    const cx = sx / len;
    const cy = sy / len;
    const cz = sz / len;
    let minDot = 1;
    for (let i = firstPoint; i < pts.length / 3; i++) {
      const d = pts[i * 3] * cx + pts[i * 3 + 1] * cy + pts[i * 3 + 2] * cz;
      if (d < minDot) minDot = d;
    }
    caps.push(cx, cy, cz, Math.acos(Math.max(-1, Math.min(1, minDot))), firstRing, rings.length / RING - firstRing);
    codes.push(c.cc);
  }
  return { pts, rings, caps, codes };
}

/** Latitude and longitude lines every `step` degrees, as open lines (same layout as Geometry.pts / rings). */
export function buildGraticule(step = 15, detail = 3): { pts: number[]; rings: number[] } {
  const pts: number[] = [];
  const rings: number[] = [];
  for (let lon = -180; lon < 180; lon += step) {
    rings.push(pts.length / 3, Math.floor(160 / detail) + 1);
    for (let lat = -80; lat <= 80; lat += detail) pts.push(...toXyz(lon, lat));
  }
  for (let lat = -75; lat <= 75; lat += step) {
    rings.push(pts.length / 3, Math.floor(360 / detail) + 1);
    for (let lon = -180; lon <= 180; lon += detail) pts.push(...toXyz(lon, lat));
  }
  return { pts, rings };
}

export type AirportGeometry = {
  /** x, y, z per airport. */
  pts: number[];
  /** 1 = large, 0 = medium. */
  large: number[];
};

export function buildAirports(rows: AirportRow[]): AirportGeometry {
  const pts: number[] = [];
  const large: number[] = [];
  for (const r of rows) {
    pts.push(...toXyz(r[5], r[4]));
    large.push(r[6]);
  }
  return { pts, large };
}
