// Tries Duffel on the trips the real March search found on Google, so the two can be compared.
// Used by the "Test Duffel" workflow (needs DUFFEL_TOKEN). Each route is one Duffel search; Duffel
// charges nothing for searches up to 1,500 a month, so this test costs nothing.
const { DUFFEL_TOKEN = '' } = process.env;

// Google's prices for these exact dates (per person, round trip, from the 13 Nov diagnosis)
const TRIPS = [
  { to: 'FCO', out: '2027-03-05', back: '2027-03-18', google: 124 },
  { to: 'BUD', out: '2027-03-05', back: '2027-03-18', google: 133 },
  { to: 'ATH', out: '2027-03-01', back: '2027-03-14', google: 127 },
  { to: 'VIE', out: '2027-03-21', back: '2027-04-06', google: 294 },
  { to: 'BRU', out: '2027-03-17', back: '2027-03-29', google: null },
];

if (!DUFFEL_TOKEN) {
  console.log('No DUFFEL_TOKEN secret yet. Add it in the repo: Settings → Secrets and variables → Actions.');
  process.exit(1);
}
if (DUFFEL_TOKEN.startsWith('duffel_test_')) {
  console.log('WARNING: this is a TEST token. Duffel only shows its fake "Duffel Airways" in test mode, so the');
  console.log('prices below are not real. Activate the account and use a live token (duffel_live_…).\n');
}

const minutes = (iso) => {
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(iso ?? '');
  return m ? Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
};
const hm = (n) => `${Math.floor(n / 60)}h${String(n % 60).padStart(2, '0')}`;

for (const t of TRIPS) {
  const started = Date.now();
  const res = await fetch('https://api.duffel.com/air/offer_requests?return_offers=true&supplier_timeout=20000', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DUFFEL_TOKEN}`,
      'Duffel-Version': 'v2',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      data: {
        slices: [
          { origin: 'TLV', destination: t.to, departure_date: t.out },
          { origin: t.to, destination: 'TLV', departure_date: t.back },
        ],
        passengers: [{ type: 'adult' }],
        cabin_class: 'economy',
      },
    }),
  });
  const body = await res.json().catch(() => null);
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\nTLV ⇄ ${t.to}  ${t.out} → ${t.back}  (Google: ${t.google ? `$${t.google}` : 'no price'})  · ${secs}s`);
  if (!res.ok || !body?.data) {
    const err = body?.errors?.[0];
    console.log(`  FAILED (${res.status}): ${err?.title ?? ''} ${err?.message ?? ''}`.trim());
    continue;
  }
  const offers = body.data.offers ?? [];
  const airlines = [...new Set(offers.map((o) => o.owner?.name).filter(Boolean))];
  console.log(`  ${offers.length} offers from ${airlines.length} airlines: ${airlines.join(', ') || '(none)'}`);
  const cheapest = [...offers].sort((a, b) => Number(a.total_amount) - Number(b.total_amount)).slice(0, 5);
  for (const o of cheapest) {
    const legs = (o.slices ?? []).map((s) => {
      const segs = s.segments ?? [];
      const first = segs[0];
      const last = segs[segs.length - 1];
      return `${first?.departing_at?.slice(11, 16)} ${first?.origin?.iata_code}→${last?.destination?.iata_code} ${last?.arriving_at?.slice(11, 16)} (${segs.length - 1} stop${segs.length === 2 ? '' : 's'}, ${hm(minutes(s.duration))})`;
    });
    console.log(`  ${o.total_amount} ${o.total_currency}  ${o.owner?.name ?? '?'}  |  ${legs.join('  |  ')}`);
  }
}
