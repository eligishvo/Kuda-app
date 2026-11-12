// Builds the offline map data bundled with the app. Run once with `npm run data`
// (only needed again to refresh airports or borders).
//   - countries: Natural Earth (via the world-atlas package), 110m for the globe and 50m for zoomed-in
//   - airports: OurAirports airports.csv (large and medium airports with scheduled service and an IATA code)
// Coordinates are stored as whole numbers of 0.01° to keep the files small.
// Usage: node scripts/build-map-data.mjs [path/to/airports.csv]   (downloads the CSV when no path is given)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';
import { presimplify, simplify, quantile } from 'topojson-simplify';

const require = createRequire(import.meta.url);
const iso = require('i18n-iso-countries');
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'src', 'map', 'data');
const AIRPORTS_URL = 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv';

// Places Natural Earth draws without an ISO number
const BY_NAME = { Kosovo: 'XK', 'N. Cyprus': 'CY-N', Somaliland: 'SO-S' };
const r2 = (v) => Math.round(v * 100);

function countries(file, keep) {
  let topo = JSON.parse(fs.readFileSync(require.resolve(`world-atlas/${file}`), 'utf8'));
  if (keep < 1) {
    topo = presimplify(topo);
    topo = simplify(topo, quantile(topo, 1 - keep));
  }
  const list = [];
  let points = 0;
  for (const f of feature(topo, topo.objects.countries).features) {
    const name = f.properties.name;
    const cc = (f.id && iso.numericToAlpha2(String(f.id).padStart(3, '0'))) || BY_NAME[name];
    if (!cc || !f.geometry) continue;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const flat = polys
      .map((rings) =>
        rings
          .map((ring) => {
            const a = [];
            // GeoJSON repeats the first point at the end; drop it, and drop points that round to the same spot
            for (let i = 0; i < ring.length - 1; i++) {
              const x = r2(ring[i][0]);
              const y = r2(ring[i][1]);
              if (a.length >= 2 && a[a.length - 2] === x && a[a.length - 1] === y) continue;
              a.push(x, y);
            }
            return a;
          })
          .filter((a) => a.length >= 6),
      )
      .filter((rings) => rings.length > 0);
    if (flat.length === 0) continue;
    points += flat.reduce((n, rings) => n + rings.reduce((m, a) => m + a.length / 2, 0), 0);
    list.push({ cc, name, polys: flat });
  }
  list.sort((a, b) => a.cc.localeCompare(b.cc));
  return { list, points };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

async function airports(file) {
  const text = file ? fs.readFileSync(file, 'utf8') : await (await fetch(AIRPORTS_URL)).text();
  const [head, ...rows] = parseCsv(text);
  const col = Object.fromEntries(head.map((h, i) => [h, i]));
  const seen = new Set();
  const list = [];
  for (const r of rows) {
    const type = r[col.type];
    const code = r[col.iata_code];
    if (type !== 'large_airport' && type !== 'medium_airport') continue;
    if (r[col.scheduled_service] !== 'yes' || !/^[A-Z]{3}$/.test(code) || seen.has(code)) continue;
    seen.add(code);
    // [IATA, name, city, country, lat, lon, 1 = large / 0 = medium]
    list.push([
      code,
      r[col.name],
      r[col.municipality],
      r[col.iso_country],
      Math.round(Number(r[col.latitude_deg]) * 1000) / 1000,
      Math.round(Number(r[col.longitude_deg]) * 1000) / 1000,
      type === 'large_airport' ? 1 : 0,
    ]);
  }
  list.sort((a, b) => a[0].localeCompare(b[0]));
  return list;
}

fs.mkdirSync(out, { recursive: true });
const low = countries('countries-110m.json', 1);
const high = countries('countries-50m.json', Number(process.env.KEEP_50M ?? 0.5));
fs.writeFileSync(path.join(out, 'countries110.json'), JSON.stringify(low.list));
fs.writeFileSync(path.join(out, 'countries50.json'), JSON.stringify(high.list));
const ap = await airports(process.argv[2]);
fs.writeFileSync(path.join(out, 'airports.json'), JSON.stringify(ap));
console.log(`110m: ${low.list.length} countries, ${low.points} points`);
console.log(`50m: ${high.list.length} countries, ${high.points} points`);
console.log(`airports: ${ap.length} (${ap.filter((a) => a[6]).length} large)`);
