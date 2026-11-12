// The map's maths: one projection that is a round globe when zoomed out and a flat map when zoomed in.
//
// Both ends are "azimuthal" projections around the point in the middle of the screen, so they differ only
// in how far from the centre a point lands: the globe (orthographic) uses sin(c), the flat map
// (stereographic, which keeps shapes true like every conformal map) uses 2·tan(c/2), where c is the angle
// between the point and the screen centre. Blending the two with a factor t gives the morph, and the centre
// of the screen stays put for free.
//
// Every function here is a worklet (it can run on the UI thread during gestures) and is plain maths, so the
// same code is unit tested in Node.

export const DEG = Math.PI / 180;

/** Below this zoom the map is a round globe (t = 0)… */
export const MORPH_START = 2;
/** …above this one it is flat (t = 1). */
export const MORPH_END = 3.5;
export const MIN_ZOOM = 0.9;
export const MAX_ZOOM = 14;
/** The centre can't go past these latitudes, so north always stays up. */
export const MAX_LAT = 85;
/** Globe radius at zoom 1, as a share of the shorter screen side. */
export const BASE_RADIUS = 0.42;

/** 0 = round, 1 = flat, eased in between. */
export function morphT(zoom: number): number {
  'worklet';
  const u = Math.min(1, Math.max(0, (zoom - MORPH_START) / (MORPH_END - MORPH_START)));
  return u * u * (3 - 2 * u);
}

/** Everything needed to draw one frame. Vectors are on the unit sphere: f = screen centre, e = east, n = north. */
export type View = {
  cx: number;
  cy: number;
  /** Globe radius in pixels. */
  R: number;
  t: number;
  zoom: number;
  ex: number; ey: number; ez: number;
  nx: number; ny: number; nz: number;
  fx: number; fy: number; fz: number;
  /** Angle (radians) from the centre to the farthest thing that can be on screen. */
  cVis: number;
};

/** Distance from the centre (in globe radii) of a point at angle c from the centre. */
export function radial(c: number, t: number): number {
  'worklet';
  return (1 - t) * Math.sin(c) + t * 2 * Math.tan(c / 2);
}

/** The angle whose distance from the centre is rho, or -1 when rho is off the map. */
export function radialInverse(rho: number, t: number): number {
  'worklet';
  if (rho > 1 + t) return -1;
  let lo = 0;
  let hi = Math.PI / 2;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (radial(mid, t) < rho) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function makeView(lon0: number, lat0: number, zoom: number, width: number, height: number): View {
  'worklet';
  const l = lon0 * DEG;
  const p = lat0 * DEG;
  const cl = Math.cos(l);
  const sl = Math.sin(l);
  const cp = Math.cos(p);
  const sp = Math.sin(p);
  const R = Math.min(width, height) * BASE_RADIUS * zoom;
  const t = morphT(zoom);
  const corner = Math.sqrt(width * width + height * height) / 2 / R;
  const c = radialInverse(corner, t);
  return {
    cx: width / 2,
    cy: height / 2,
    R,
    t,
    zoom,
    ex: -sl, ey: cl, ez: 0,
    nx: -sp * cl, ny: -sp * sl, nz: cp,
    fx: cp * cl, fy: cp * sl, fz: sp,
    cVis: c < 0 ? Math.PI / 2 : c,
  };
}

/** Screen position of a longitude/latitude, or null when it is on the far side of the globe. */
export function project(v: View, lon: number, lat: number): { x: number; y: number } | null {
  'worklet';
  const l = lon * DEG;
  const p = lat * DEG;
  const cp = Math.cos(p);
  const px = cp * Math.cos(l);
  const py = cp * Math.sin(l);
  const pz = Math.sin(p);
  const Z = px * v.fx + py * v.fy + pz * v.fz;
  if (Z <= 0) return null;
  const s = v.R * (1 - v.t + (2 * v.t) / (1 + Z));
  return {
    x: v.cx + s * (px * v.ex + py * v.ey + pz * v.ez),
    y: v.cy - s * (px * v.nx + py * v.ny + pz * v.nz),
  };
}

/** Longitude/latitude under a screen point, or null when the point is outside the globe. */
export function invert(v: View, x: number, y: number): { lon: number; lat: number } | null {
  'worklet';
  const dx = (x - v.cx) / v.R;
  const dy = -(y - v.cy) / v.R;
  const rho = Math.sqrt(dx * dx + dy * dy);
  const c = radialInverse(rho, v.t);
  if (c < 0) return null;
  const sc = Math.sin(c);
  const cc = Math.cos(c);
  const ux = rho > 1e-9 ? dx / rho : 0;
  const uy = rho > 1e-9 ? dy / rho : 0;
  const px = v.fx * cc + (v.ex * ux + v.nx * uy) * sc;
  const py = v.fy * cc + (v.ey * ux + v.ny * uy) * sc;
  const pz = v.fz * cc + (v.ez * ux + v.nz * uy) * sc;
  return { lon: Math.atan2(py, px) / DEG, lat: Math.asin(Math.max(-1, Math.min(1, pz))) / DEG };
}

export function clampLat(lat: number): number {
  'worklet';
  return Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
}

export function clampZoom(zoom: number): number {
  'worklet';
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

/** Keeps a longitude between -180 and 180. */
export function wrapLon(lon: number): number {
  'worklet';
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** The new centre after dragging the map by (dx, dy) pixels: the map follows the finger. */
export function dragCenter(lon0: number, lat0: number, R: number, dx: number, dy: number): { lon: number; lat: number } {
  'worklet';
  const cosLat = Math.max(0.2, Math.cos(lat0 * DEG));
  return { lon: wrapLon(lon0 - dx / (R * cosLat) / DEG), lat: clampLat(lat0 + dy / R / DEG) };
}

/**
 * The centre that puts a place (lon, lat) under the screen point (x, y) at the given zoom.
 * Used while pinching, so the place under the fingers stays under them as the globe flattens.
 */
export function centerToPin(
  lon0: number, lat0: number, zoom: number, width: number, height: number,
  lon: number, lat: number, x: number, y: number,
): { lon: number; lat: number } {
  'worklet';
  let cl = lon0;
  let ca = lat0;
  for (let i = 0; i < 4; i++) {
    const v = makeView(cl, ca, zoom, width, height);
    const p = project(v, lon, lat);
    if (!p) break;
    const next = dragCenter(cl, ca, v.R, x - p.x, y - p.y);
    cl = next.lon;
    ca = next.lat;
  }
  return { lon: cl, lat: ca };
}
