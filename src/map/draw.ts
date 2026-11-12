// Draws the map for one frame: walks the country outlines, places each point on screen and feeds the
// result to path builders (Skia's on the phone, a fake one in the tests).
// The far side of the globe is cut off at the rim: where an outline crosses the rim it follows the rim
// until the outline comes back, so countries half over the edge still fill correctly.
// Everything here is a worklet, so it runs on the UI thread while you drag and pinch.

import { CAP, RING } from './geometry';
import { MORPH_END, View } from './projection';

/** The part of Skia's path builder that the map uses. */
export type Sink = {
  moveTo(x: number, y: number): unknown;
  lineTo(x: number, y: number): unknown;
  close(): unknown;
  addCircle(x: number, y: number, r: number): unknown;
};

/** Follows the rim from angle a to angle b the short way round. */
function rimArc(sink: Sink, v: View, a: number, b: number) {
  'worklet';
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const steps = Math.ceil(Math.abs(d) / 0.12);
  const r = v.R * (1 + v.t);
  for (let i = 1; i <= steps; i++) {
    const ang = a + (d * i) / steps;
    sink.lineTo(v.cx + r * Math.cos(ang), v.cy - r * Math.sin(ang));
  }
}

/** One closed outline (a ring of `count` points starting at point `start`). */
export function drawRing(pts: number[], start: number, count: number, v: View, sink: Sink) {
  'worklet';
  // Look for a point on the far side to start from; if there is none the whole ring is visible
  let hidden = -1;
  for (let i = 0; i < count; i++) {
    const o = (start + i) * 3;
    if (pts[o] * v.fx + pts[o + 1] * v.fy + pts[o + 2] * v.fz <= 0) {
      hidden = i;
      break;
    }
  }
  const rimR = v.R * (1 + v.t);
  if (hidden < 0) {
    for (let i = 0; i < count; i++) {
      const o = (start + i) * 3;
      const x = pts[o];
      const y = pts[o + 1];
      const z = pts[o + 2];
      const s = v.R * (1 - v.t + (2 * v.t) / (1 + x * v.fx + y * v.fy + z * v.fz));
      const sx = v.cx + s * (x * v.ex + y * v.ey + z * v.ez);
      const sy = v.cy - s * (x * v.nx + y * v.ny + z * v.nz);
      if (i === 0) sink.moveTo(sx, sy);
      else sink.lineTo(sx, sy);
    }
    sink.close();
    return;
  }
  // Walk the ring once, starting from the hidden point
  let o = (start + hidden) * 3;
  let pX = pts[o] * v.ex + pts[o + 1] * v.ey + pts[o + 2] * v.ez;
  let pY = pts[o] * v.nx + pts[o + 1] * v.ny + pts[o + 2] * v.nz;
  let pZ = pts[o] * v.fx + pts[o + 1] * v.fy + pts[o + 2] * v.fz;
  let started = false;
  let firstAngle = 0;
  let exitAngle = 0;
  for (let j = 1; j <= count; j++) {
    o = (start + ((hidden + j) % count)) * 3;
    const x = pts[o];
    const y = pts[o + 1];
    const z = pts[o + 2];
    const X = x * v.ex + y * v.ey + z * v.ez;
    const Y = x * v.nx + y * v.ny + z * v.nz;
    const Z = x * v.fx + y * v.fy + z * v.fz;
    const wasVisible = pZ > 0;
    const visible = Z > 0;
    if (visible !== wasVisible) {
      // Where the edge between the two points meets the rim
      const f = pZ / (pZ - Z);
      const angle = Math.atan2(pY + f * (Y - pY), pX + f * (X - pX));
      const rx = v.cx + rimR * Math.cos(angle);
      const ry = v.cy - rimR * Math.sin(angle);
      if (visible) {
        if (!started) {
          sink.moveTo(rx, ry);
          firstAngle = angle;
          started = true;
        } else {
          rimArc(sink, v, exitAngle, angle);
        }
      } else {
        sink.lineTo(rx, ry);
        exitAngle = angle;
      }
    }
    if (visible) {
      const s = v.R * (1 - v.t + (2 * v.t) / (1 + Z));
      sink.lineTo(v.cx + s * X, v.cy - s * Y);
    }
    pX = X;
    pY = Y;
    pZ = Z;
  }
  if (started) {
    rimArc(sink, v, exitAngle, firstAngle);
    sink.close();
  }
}

/** One open line (graticule): the pen simply lifts on the far side. */
export function drawLine(pts: number[], start: number, count: number, v: View, sink: Sink) {
  'worklet';
  const rimR = v.R * (1 + v.t);
  let pX = 0;
  let pY = 0;
  let pZ = 0;
  for (let i = 0; i < count; i++) {
    const o = (start + i) * 3;
    const x = pts[o];
    const y = pts[o + 1];
    const z = pts[o + 2];
    const X = x * v.ex + y * v.ey + z * v.ez;
    const Y = x * v.nx + y * v.ny + z * v.nz;
    const Z = x * v.fx + y * v.fy + z * v.fz;
    const visible = Z > 0;
    if (i > 0 && visible !== pZ > 0) {
      const f = pZ / (pZ - Z);
      const angle = Math.atan2(pY + f * (Y - pY), pX + f * (X - pX));
      const rx = v.cx + rimR * Math.cos(angle);
      const ry = v.cy - rimR * Math.sin(angle);
      if (visible) sink.moveTo(rx, ry);
      else sink.lineTo(rx, ry);
    }
    if (visible) {
      const s = v.R * (1 - v.t + (2 * v.t) / (1 + Z));
      if (i === 0) sink.moveTo(v.cx + s * X, v.cy - s * Y);
      else sink.lineTo(v.cx + s * X, v.cy - s * Y);
    }
    pX = X;
    pY = Y;
    pZ = Z;
  }
}

/**
 * Draws every country that can be on screen into the sink chosen by its flag
 * (flags[i] is an index into sinks: 0 = plain land, 1 = selected, 2 = partly selected, 3 = home).
 * Returns how many points were considered (handy for checking performance).
 */
export function drawCountries(
  geo: { pts: number[]; rings: number[]; caps: number[] },
  v: View,
  flags: number[],
  sinks: Sink[],
): number {
  'worklet';
  let used = 0;
  const n = geo.caps.length / CAP;
  for (let i = 0; i < n; i++) {
    const c = i * CAP;
    // Skip countries that are entirely off screen or behind the globe
    const reach = Math.min(Math.PI, v.cVis + geo.caps[c + 3]);
    const dot = geo.caps[c] * v.fx + geo.caps[c + 1] * v.fy + geo.caps[c + 2] * v.fz;
    if (dot < Math.cos(reach)) continue;
    const sink = sinks[flags[i] ?? 0] ?? sinks[0];
    const first = geo.caps[c + 4];
    const count = geo.caps[c + 5];
    for (let r = first; r < first + count; r++) {
      drawRing(geo.pts, geo.rings[r * RING], geo.rings[r * RING + 1], v, sink);
      used += geo.rings[r * RING + 1];
    }
  }
  return used;
}

export function drawGraticule(grat: { pts: number[]; rings: number[] }, v: View, sink: Sink) {
  'worklet';
  const n = grat.rings.length / RING;
  for (let r = 0; r < n; r++) drawLine(grat.pts, grat.rings[r * RING], grat.rings[r * RING + 1], v, sink);
}

/**
 * Airport dots. Large airports show at every zoom (tiny on the globe); medium ones only on the flat map.
 * Selected airports (selected[i] = 1) always show and go to their own sink.
 */
export function drawAirports(
  ap: { pts: number[]; large: number[] },
  v: View,
  selected: number[],
  other: Sink,
  chosen: Sink,
) {
  'worklet';
  const flat = v.zoom >= MORPH_END;
  const minZ = Math.max(0.02, Math.cos(v.cVis));
  // Dots grow a little as you zoom in, so a crowded region stays readable
  const grow = Math.min(1.2, Math.max(0, (v.zoom - MORPH_END) * 0.3));
  const rLarge = 1.2 + 1.6 * v.t + grow;
  const rMedium = 1.8 + grow;
  const n = ap.large.length;
  for (let i = 0; i < n; i++) {
    const isSelected = selected[i] === 1;
    const large = ap.large[i] === 1;
    if (!isSelected && !large && !flat) continue;
    const o = i * 3;
    const x = ap.pts[o];
    const y = ap.pts[o + 1];
    const z = ap.pts[o + 2];
    const Z = x * v.fx + y * v.fy + z * v.fz;
    if (Z < minZ) continue;
    const s = v.R * (1 - v.t + (2 * v.t) / (1 + Z));
    const sx = v.cx + s * (x * v.ex + y * v.ey + z * v.ez);
    const sy = v.cy - s * (x * v.nx + y * v.ny + z * v.nz);
    const r = large ? rLarge : rMedium;
    if (isSelected) chosen.addCircle(sx, sy, Math.max(r, 2.5) + 0.8);
    else other.addCircle(sx, sy, r);
  }
}
