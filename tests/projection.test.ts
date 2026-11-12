import { describe, expect, it } from 'vitest';
import {
  centerToPin, clampZoom, dragCenter, invert, makeView, MAX_ZOOM, MIN_ZOOM, MORPH_END, MORPH_START, morphT,
  project, radial, radialInverse, wrapLon,
} from '../src/map/projection';

const W = 400;
const H = 800;

describe('morph factor', () => {
  it('is round below the start zoom, flat above the end zoom, and rises in between', () => {
    expect(morphT(1)).toBe(0);
    expect(morphT(MORPH_START)).toBe(0);
    expect(morphT(MORPH_END)).toBe(1);
    expect(morphT(10)).toBe(1);
    const mid = morphT((MORPH_START + MORPH_END) / 2);
    expect(mid).toBeCloseTo(0.5, 5);
    expect(morphT(2.3)).toBeLessThan(morphT(2.6));
  });
});

describe('projection', () => {
  it('puts the centre of the view in the middle of the screen at every zoom', () => {
    for (const zoom of [1, 2.5, 3, 5]) {
      const p = project(makeView(34.8, 31.5, zoom, W, H), 34.8, 31.5)!;
      expect(p.x).toBeCloseTo(W / 2, 6);
      expect(p.y).toBeCloseTo(H / 2, 6);
    }
  });

  it('keeps north up and east to the right', () => {
    const v = makeView(10, 40, 1, W, H);
    expect(project(v, 10, 50)!.y).toBeLessThan(H / 2);
    expect(project(v, 20, 40)!.x).toBeGreaterThan(W / 2);
  });

  it('hides the far side of the globe', () => {
    const v = makeView(0, 0, 1, W, H);
    expect(project(v, 180, 0)).toBeNull();
    expect(project(v, 100, 0)).toBeNull();
    expect(project(v, 80, 0)).not.toBeNull();
  });

  it('is a true globe when zoomed out: a point 90° away sits on the rim', () => {
    const v = makeView(0, 0, 1, W, H);
    const p = project(v, 89.999, 0)!;
    expect(p.x - v.cx).toBeCloseTo(v.R, 1);
  });

  it('is conformal when flat: one degree north and one degree east are the same length on screen', () => {
    const v = makeView(15, 45, 6, W, H);
    for (const [lon, lat] of [[15, 45], [22, 50], [8, 41]]) {
      const a = project(v, lon, lat)!;
      const n = project(v, lon, lat + 0.01)!;
      const e = project(v, lon + 0.01 / Math.cos((lat * Math.PI) / 180), lat)!;
      const dn = Math.hypot(n.x - a.x, n.y - a.y);
      const de = Math.hypot(e.x - a.x, e.y - a.y);
      expect(de / dn).toBeCloseTo(1, 3);
    }
  });

  it('inverts what it projects, at every stage of the morph', () => {
    for (const zoom of [1, 2.4, 3, 3.5, 8]) {
      const v = makeView(34.8, 31.5, zoom, W, H);
      for (const [lon, lat] of [[34.8, 31.5], [23.7, 38], [12.5, 41.9], [40, 25]]) {
        const p = project(v, lon, lat)!;
        const back = invert(v, p.x, p.y)!;
        expect(back.lon).toBeCloseTo(lon, 4);
        expect(back.lat).toBeCloseTo(lat, 4);
      }
    }
  });

  it('returns nothing for a tap outside the globe', () => {
    const v = makeView(0, 0, 1, W, H);
    expect(invert(v, W / 2, H / 2 - v.R - 5)).toBeNull();
    expect(invert(v, W / 2, H / 2 - v.R + 5)).not.toBeNull();
  });

  it('radialInverse undoes radial', () => {
    for (const t of [0, 0.3, 1]) {
      for (const c of [0.1, 0.7, 1.4]) expect(radialInverse(radial(c, t), t)).toBeCloseTo(c, 6);
    }
    expect(radialInverse(1.2, 0)).toBe(-1);
  });
});

describe('moving the map', () => {
  it('dragging right moves the centre west, dragging down moves it north', () => {
    const v = makeView(0, 0, 1, W, H);
    const c = dragCenter(0, 0, v.R, 20, 10);
    expect(c.lon).toBeLessThan(0);
    expect(c.lat).toBeGreaterThan(0);
  });

  it('the place under the finger follows the finger', () => {
    const v = makeView(34.8, 31.5, 5, W, H);
    const before = invert(v, 150, 300)!;
    const c = dragCenter(34.8, 31.5, v.R, 30, -40);
    const after = project(makeView(c.lon, c.lat, 5, W, H), before.lon, before.lat)!;
    // Exact in the middle of the screen, within a few pixels away from it
    expect(Math.abs(after.x - 180)).toBeLessThan(4);
    expect(Math.abs(after.y - 260)).toBeLessThan(4);
  });

  it('wraps longitude and clamps zoom', () => {
    expect(wrapLon(190)).toBeCloseTo(-170);
    expect(wrapLon(-190)).toBeCloseTo(170);
    expect(clampZoom(0.1)).toBe(MIN_ZOOM);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
  });

  it('keeps the pinched place under the fingers while the globe flattens', () => {
    // Athens under a finger at (120, 500) on the round globe…
    const start = makeView(34.8, 31.5, 1.8, W, H);
    const athens = project(start, 23.7, 38)!;
    for (const zoom of [2.2, 2.8, 3.5, 6]) {
      const c = centerToPin(34.8, 31.5, zoom, W, H, 23.7, 38, athens.x, athens.y);
      const p = project(makeView(c.lon, c.lat, zoom, W, H), 23.7, 38)!;
      // …is still there (within a pixel) at every zoom on the way in
      expect(Math.hypot(p.x - athens.x, p.y - athens.y)).toBeLessThan(1);
    }
  });
});
