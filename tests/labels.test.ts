import { describe, expect, it } from 'vitest';
import { HUBS, LABEL_H, LABEL_W, labelBudget, pickLabels } from '../src/map/labels';
import { airportByCode, AIRPORTS } from '../src/map/mapData';
import { makeView, project } from '../src/map/projection';

const W = 400;
const H = 800;
const none = new Set<string>();

describe('city names on the map', () => {
  it('knows the hubs it names (every code is a real airport in the data)', () => {
    const missing = [...HUBS].filter((c) => !airportByCode(c));
    // A few hubs may be absent from the bundled airports (closed or renamed); most must be there
    expect(missing.length).toBeLessThan(8);
    expect(HUBS.has('ATH') && HUBS.has('TLV') && HUBS.has('LHR')).toBe(true);
  });

  it('shows a few major cities on the globe, by city name only', () => {
    const labels = pickLabels(makeView(20, 42, 1, W, H), W, H, AIRPORTS, none);
    expect(labels.length).toBeGreaterThan(5);
    expect(labels.length).toBeLessThanOrEqual(labelBudget(1).max);
    expect(labels.every((l) => HUBS.has(l.code))).toBe(true);
    expect(labels.every((l) => !/ [A-Z]{3}$/.test(l.text))).toBe(true);
    // One name per city: London has several airports
    expect(new Set(labels.map((l) => l.text)).size).toBe(labels.length);
  });

  it('shows more names, with airport codes, on the flat map', () => {
    const labels = pickLabels(makeView(23, 39, 6, W, H), W, H, AIRPORTS, none);
    expect(labels.length).toBeGreaterThan(8);
    expect(labels.map((l) => l.text)).toContain('Athens ATH');
    expect(labels.some((l) => !HUBS.has(l.code))).toBe(true);
  });

  it('never lets two names overlap', () => {
    for (const zoom of [1, 2.7, 6]) {
      const v = makeView(12, 46, zoom, W, H);
      const at = pickLabels(v, W, H, AIRPORTS, none).map((l) => project(v, l.lon, l.lat)!);
      for (let i = 0; i < at.length; i++) {
        for (let j = i + 1; j < at.length; j++) {
          expect(Math.abs(at[i].x - at[j].x) >= LABEL_W || Math.abs(at[i].y - at[j].y) >= LABEL_H + 2).toBe(true);
        }
      }
    }
  });

  it('always names the chosen airports first, even small ones on the globe', () => {
    const v = makeView(23, 39, 1, W, H);
    expect(pickLabels(v, W, H, AIRPORTS, none).some((l) => l.code === 'JTR')).toBe(false);
    expect(pickLabels(v, W, H, AIRPORTS, new Set(['JTR'])).some((l) => l.code === 'JTR')).toBe(true);
  });

  it('keeps names out from under the panels and off the far side', () => {
    const v = makeView(23, 39, 6, W, H);
    const labels = pickLabels(v, W, H, AIRPORTS, none, { top: 150, bottom: 300 });
    for (const l of labels) {
      const p = project(v, l.lon, l.lat)!;
      expect(p.y).toBeGreaterThanOrEqual(150);
      expect(p.y).toBeLessThanOrEqual(H - 300);
    }
    expect(pickLabels(makeView(-100, 40, 1, W, H), W, H, AIRPORTS, none).some((l) => l.code === 'ATH')).toBe(false);
  });
});
