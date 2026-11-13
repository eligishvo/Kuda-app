// Replays a search's Worker calls and prints what came back and why each price was kept or dropped.
// Used by the "Diagnose search" workflow (needs WORKER_URL and APP_TOKEN in the environment).
// Explore answers are cached by the Worker for 12 hours, so replaying a recent search costs no searches.
const { WORKER_URL, APP_TOKEN, ORIGIN = 'TLV', FROM, TO, MIN, MAX, BUDGET = '9999', DEST = '' } = process.env;
const minN = Number(MIN);
const maxN = Number(MAX);
const wanted = new Set(DEST.split(/[\s,]+/).filter(Boolean));

async function get(path) {
  const res = await fetch(`${WORKER_URL.replace(/\/+$/, '')}${path}`, { headers: { 'X-App-Token': APP_TOKEN } });
  const body = await res.json().catch(() => null);
  if (!body?.ok) {
    console.log(`  ${path} → FAILED: ${body?.error ?? res.status}`);
    return [];
  }
  console.log(`  ${path} → ${body.data.length} items${body.cached ? ' (cached, free)' : ' (fresh)'} · searches used today ${body.usage.used}/${body.usage.cap}`);
  return body.data;
}

const nights = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
function why(out, ret, price) {
  const n = nights(out, ret);
  const r = [];
  if (out < FROM) r.push(`leaves ${out} before ${FROM}`);
  if (ret > TO) r.push(`returns ${ret} after ${TO}`);
  if (n < minN) r.push(`${n} days < ${minN}`);
  if (n > maxN) r.push(`${n} days > ${maxN}`);
  if (price > Number(BUDGET)) r.push(`$${price} > budget $${BUDGET}`);
  return r.length ? `DROPPED: ${r.join(', ')}` : 'KEPT';
}

const month = (d) => d.slice(0, 7);
const months = [];
for (let y = Number(FROM.slice(0, 4)), m = Number(FROM.slice(5, 7)); `${y}-${String(m).padStart(2, '0')}` <= month(TO); m === 12 ? (y++, (m = 1)) : m++) {
  months.push(`${y}-${String(m).padStart(2, '0')}`);
}
const mid = (minN + maxN) / 2;
const duration = mid <= 4 ? 1 : mid <= 10 ? 2 : 3;

console.log(`Search: ${ORIGIN}, ${FROM} → ${TO}, ${MIN}–${MAX} days, budget $${BUDGET}, Explore length bucket ${duration}`);
console.log(`Destinations of interest: ${wanted.size ? [...wanted].join(' ') : '(all)'}\n`);

const rows = [];
console.log('Calls:');
for (const m of months) {
  for (const d of await get(`/explore?origin=${ORIGIN}&month=${Number(m.slice(5))}&duration=${duration}`)) rows.push({ src: 'google', ...d });
  for (const d of await get(`/estimates?origin=${ORIGIN}&from=${m}&to=${m}`)) rows.push({ src: 'tp', ...d });
}
const outs = [];
const backs = [];
for (const m of months) {
  outs.push(...(await get(`/oneways?origin=${ORIGIN}&month=${m}&dir=out`)));
  backs.push(...(await get(`/oneways?origin=${ORIGIN}&month=${m}&dir=back`)));
}

const show = (code) => !wanted.size || wanted.has(code);
console.log('\nRound-trip prices (Google Explore = one trip per destination per month; Travelpayouts = cached fares):');
const sorted = rows.filter((r) => show(r.airport)).sort((a, b) => a.airport.localeCompare(b.airport) || a.estimate.price - b.estimate.price);
for (const r of sorted) {
  const e = r.estimate;
  console.log(`  ${r.airport} ${r.src.padEnd(6)} ${e.outDate} → ${e.retDate} ${String(nights(e.outDate, e.retDate)).padStart(2)} days  $${String(e.price).padStart(4)}  ${e.confidence.padEnd(8)} ${why(e.outDate, e.retDate, e.price)}`);
}
if (wanted.size) {
  const none = [...wanted].filter((c) => !rows.some((r) => r.airport === c));
  console.log(`\nSelected airports with no round-trip price at all: ${none.join(' ') || '(none)'}`);
}
console.log(`\nAll Google Explore destinations this month: ${[...new Set(rows.filter((r) => r.src === 'google').map((r) => r.airport))].sort().join(' ')}`);
console.log(`\nOne-way fares out (to selected): ${outs.filter((o) => show(o.airport)).map((o) => `${o.airport} ${o.date} $${o.price}`).join(' | ') || '(none)'}`);
console.log(`One-way fares back (from selected): ${backs.filter((o) => show(o.airport)).map((o) => `${o.airport} ${o.date} $${o.price}`).join(' | ') || '(none)'}`);
console.log(`One-way totals: ${outs.length} out, ${backs.length} back (all destinations)`);

// Each selected airport on its own (what the app does since 2026-11-13): round trips and two one-way tickets
if (wanted.size) {
  console.log('\nPer airport (single-route calls): round trips that fit, and one-way pairs that fit');
  for (const code of [...wanted].sort()) {
    const rt = [];
    const o = [];
    const b = [];
    for (const m of months) {
      rt.push(...(await get(`/estimates?origin=${ORIGIN}&from=${m}&to=${m}&dest=${code}`)));
      o.push(...(await get(`/oneways?origin=${ORIGIN}&month=${m}&dir=out&dest=${code}`)));
      b.push(...(await get(`/oneways?origin=${ORIGIN}&month=${m}&dir=back&dest=${code}`)));
    }
    const fitRt = rt.filter((r) => why(r.estimate.outDate, r.estimate.retDate, r.estimate.price) === 'KEPT');
    const pairs = [];
    for (const x of o) for (const y of b) if (why(x.date, y.date, x.price + y.price) === 'KEPT') pairs.push({ out: x.date, ret: y.date, price: x.price + y.price });
    pairs.sort((p, q) => p.price - q.price);
    console.log(`  ${code}: ${rt.length} round trips (${fitRt.length} fit) · ${o.length} fares out, ${b.length} back → ${pairs.length} pairs fit${pairs.length ? `, cheapest ${pairs[0].out} → ${pairs[0].ret} $${pairs[0].price}` : ''}`);
  }
}
