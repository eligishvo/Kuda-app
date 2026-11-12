import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { drawAirports, drawCountries, drawGraticule, Sink } from '../src/map/draw';
import { hitAirport, hitCountry, hitTest } from '../src/map/hitTest';
import { AIRPORT_GEO, AIRPORTS, airportsIn, COUNTRIES_HIGH, COUNTRIES_LOW, countryName, GEO_HIGH, GEO_LOW, GRATICULE } from '../src/map/mapData';
import { makeView, project } from '../src/map/projection';

const W = 400;
const H = 800;

/** A stand-in for Skia's path builder that records the path as SVG. */
function svgSink() {
  const d: string[] = [];
  let points = 0;
  let circles = 0;
  let maxJump = 0;
  let last: [number, number] | null = null;
  const sink: Sink = {
    moveTo(x, y) { d.push(`M${x.toFixed(1)},${y.toFixed(1)}`); last = [x, y]; points++; },
    lineTo(x, y) {
      d.push(`L${x.toFixed(1)},${y.toFixed(1)}`);
      if (last) maxJump = Math.max(maxJump, Math.hypot(x - last[0], y - last[1]));
      last = [x, y];
      points++;
    },
    close() { d.push('Z'); last = null; },
    addCircle(x, y, r) { d.push(`M${(x - r).toFixed(1)},${y.toFixed(1)}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`); circles++; },
  };
  return { sink, d, stats: () => ({ points, circles, maxJump }) };
}

function render(lon: number, lat: number, zoom: number, file?: string) {
  const v = makeView(lon, lat, zoom, W, H);
  const geo = zoom >= 2.6 ? GEO_HIGH : GEO_LOW;
  const flags = geo.codes.map((cc) => (cc === 'GR' ? 1 : cc === 'IT' ? 2 : cc === 'IL' ? 3 : 0));
  const land = svgSink();
  const sel = svgSink();
  const part = svgSink();
  const home = svgSink();
  const grat = svgSink();
  const dots = svgSink();
  const chosen = svgSink();
  const used = drawCountries(geo, v, flags, [land.sink, sel.sink, part.sink, home.sink]);
  drawGraticule(GRATICULE, v, grat.sink);
  drawAirports(AIRPORT_GEO, v, AIRPORTS.map((a) => (a.cc === 'GR' ? 1 : 0)), dots.sink, chosen.sink);
  if (file) {
    const rim = v.R * (1 + v.t);
    fs.writeFileSync(
      file,
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#071526"/>
<circle cx="${v.cx}" cy="${v.cy}" r="${rim}" fill="#0f355a" stroke="#2B5C8A"/>
<path d="${grat.d.join('')}" fill="none" stroke="#1c4a78" stroke-width="0.6"/>
<path d="${land.d.join('')}" fill="#2E6E72" stroke="#0D3A4A" stroke-width="0.6"/>
<path d="${home.d.join('')}" fill="#8FB8C9" stroke="#0D3A4A" stroke-width="0.6"/>
<path d="${part.d.join('')}" fill="#2E6E72" stroke="#FF7A59" stroke-width="1.2" stroke-dasharray="4 3"/>
<path d="${sel.d.join('')}" fill="#FF7A59" stroke="#FFC2B0" stroke-width="0.8"/>
<path d="${dots.d.join('')}" fill="#8FB8C9"/>
<path d="${chosen.d.join('')}" fill="#FFD2C4"/>
</svg>`,
    );
  }
  return { v, used, land: land.stats(), sel: sel.stats(), grat: grat.stats(), dots: dots.stats(), chosen: chosen.stats() };
}

describe('drawing the map', () => {
  const out = process.env.KUDA_PREVIEW_DIR;

  it('draws the round globe without lines cutting across it', () => {
    const r = render(34.8, 31.5, 1, out && `${out}/globe.svg`);
    expect(r.land.points).toBeGreaterThan(2000);
    // No single line may be longer than a third of the globe: that would be a stroke across the disc
    expect(r.land.maxJump).toBeLessThan(r.v.R * 0.7);
    expect(r.grat.maxJump).toBeLessThan(r.v.R * 0.3);
    expect(r.dots.circles).toBeGreaterThan(100);
  });

  it('draws views that cut countries at the rim (poles, Pacific)', () => {
    for (const [lon, lat, name] of [[0, 85, 'north'], [0, -85, 'south'], [180, 0, 'pacific'], [-100, 40, 'america']] as const) {
      const r = render(lon, lat, 1, out && `${out}/globe-${name}.svg`);
      expect(r.land.maxJump).toBeLessThan(r.v.R * 0.9);
    }
  });

  it('draws the half-morphed and the flat map, skipping what is off screen', () => {
    const half = render(23, 39, 2.75, out && `${out}/morph.svg`);
    const flat = render(23, 39, 5, out && `${out}/flat.svg`);
    expect(flat.sel.points).toBeGreaterThan(200); // Greece, selected
    expect(flat.chosen.circles).toBe(airportsIn('GR').length);
    expect(flat.used).toBeLessThan(GEO_HIGH.pts.length / 3 / 2);
    expect(half.used).toBeLessThan(GEO_HIGH.pts.length / 3);
  });
});

describe('map data', () => {
  it('has the countries and airports the app relies on', () => {
    expect(COUNTRIES_LOW.length).toBeGreaterThan(170);
    expect(COUNTRIES_HIGH.length).toBeGreaterThan(220);
    expect(countryName('GR')).toBe('Greece');
    expect(AIRPORTS.find((a) => a.code === 'TLV')?.cc).toBe('IL');
    expect(airportsIn('IT').map((a) => a.code)).toEqual(expect.arrayContaining(['FCO', 'NAP']));
    expect(airportsIn('IT')[0].large).toBe(true);
    expect(new Set(AIRPORTS.map((a) => a.code)).size).toBe(AIRPORTS.length);
  });
});

describe('tapping the map', () => {
  it('finds the country under a point', () => {
    expect(hitCountry(23.7, 38, COUNTRIES_LOW, GEO_LOW.caps)).toBe('GR');
    expect(hitCountry(12.5, 41.9, COUNTRIES_HIGH, GEO_HIGH.caps)).toBe('IT');
    expect(hitCountry(2.3, 48.9, COUNTRIES_LOW, GEO_LOW.caps)).toBe('FR');
    expect(hitCountry(-30, 30, COUNTRIES_LOW, GEO_LOW.caps)).toBeNull(); // mid-Atlantic
  });

  it('on the globe a tap picks the country, not an airport', () => {
    const v = makeView(34.8, 31.5, 1, W, H);
    const ath = project(v, 23.94, 37.94)!;
    expect(hitAirport(v, ath.x, ath.y, AIRPORTS)).toBeNull();
    expect(hitTest(v, ath.x, ath.y, AIRPORTS, COUNTRIES_LOW, GEO_LOW.caps)).toEqual({ kind: 'country', cc: 'GR' });
  });

  it('on the flat map a tap near a dot picks that airport, elsewhere the country', () => {
    const v = makeView(23, 39, 6, W, H);
    const ath = AIRPORTS.find((a) => a.code === 'ATH')!;
    const p = project(v, ath.lon, ath.lat)!;
    expect(hitTest(v, p.x + 5, p.y - 5, AIRPORTS, COUNTRIES_HIGH, GEO_HIGH.caps)).toEqual({ kind: 'airport', code: 'ATH', cc: 'GR' });
    // Further in, a spot in the middle of the country is far from every dot
    const close = makeView(2.5, 47, 10, W, H);
    const inland = project(close, 2.5, 47)!;
    expect(hitTest(close, inland.x, inland.y, AIRPORTS, COUNTRIES_HIGH, GEO_HIGH.caps)).toEqual({ kind: 'country', cc: 'FR' });
  });

  it('ignores taps outside the globe', () => {
    const v = makeView(0, 0, 1, W, H);
    expect(hitTest(v, 5, 5, AIRPORTS, COUNTRIES_LOW, GEO_LOW.caps)).toBeNull();
  });
});
