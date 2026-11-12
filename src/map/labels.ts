// Which city names to write on the map. There are thousands of airports, so only a few names fit: the
// ones that matter most are placed first, and a name is skipped when it would overlap one already placed.
// Recalculated whenever the map has moved a little (not every frame); see GlobeMap.tsx.
import { MORPH_END, MORPH_START, project, View } from './projection';

export type MapLabel = { code: string; lon: number; lat: number; text: string };

type AirportLike = { code: string; city: string; name: string; lat: number; lon: number; large: boolean };

/** The world's main hubs: their names show even on the round globe. */
export const HUBS = new Set(
  ('LHR CDG FRA AMS MAD BCN FCO MXP ATH IST DXB DOH AUH CAI TLV AMM BEY LCA VIE ZRH GVA MUC BER HAM DUS BRU CPH OSL ARN HEL DUB ' +
    'EDI MAN LIS OPO PRG WAW BUD OTP SOF BEG ZAG KBP IEV TBS EVN BAK GYD RIX VNO TLL KEF NCE MRS LYS NAP VCE PMO CTA MLA TUN ALG ' +
    'CMN RAK DKR LOS ACC ADD NBO JNB CPT DAR RUH JED KWI BAH MCT THR KHI DEL BOM BLR MAA CCU CMB DAC KTM BKK SIN KUL CGK MNL HAN ' +
    'SGN HKG TPE ICN NRT HND KIX PEK PVG CAN SZX CTU SYD MEL BNE PER AKL JFK EWR BOS IAD ATL MIA MCO ORD DFW IAH DEN LAX SFO SEA ' +
    'LAS PHX YYZ YUL YVR MEX CUN HAV PTY BOG LIM SCL EZE GRU GIG TAS ALA NQZ SKG HER RHO LED SVO').split(' '),
);

/** Room one name takes on screen, in pixels. */
export const LABEL_W = 92;
export const LABEL_H = 16;
/** How far below the airport's dot the name sits. */
export const LABEL_DROP = 5;

/** How many names show at a zoom, and which airports may get one (0 chosen, 1 hubs, 2 large, 3 medium). */
export function labelBudget(zoom: number): { max: number; upTo: number } {
  if (zoom < MORPH_START) return { max: 16, upTo: 1 };
  if (zoom < MORPH_END) return { max: 26, upTo: 2 };
  return { max: 44, upTo: 3 };
}

/**
 * Picks the names for the current view.
 *   first — airports that always get a name when on screen (selected, departure, priced)
 *   keepOut — parts of the screen covered by panels, where names would be hidden anyway
 */
export function pickLabels(
  v: View,
  width: number,
  height: number,
  airports: AirportLike[],
  first: Set<string>,
  keepOut: { top: number; bottom: number } = { top: 0, bottom: 0 },
): MapLabel[] {
  const { max, upTo } = labelBudget(v.zoom);
  const flat = v.zoom >= MORPH_END;
  const found: { a: AirportLike; x: number; y: number; rank: number }[] = [];
  for (const a of airports) {
    const rank = first.has(a.code) ? 0 : HUBS.has(a.code) ? 1 : a.large ? 2 : 3;
    if (rank > upTo) continue;
    const p = project(v, a.lon, a.lat);
    if (!p || p.x < 0 || p.x > width || p.y < keepOut.top || p.y > height - keepOut.bottom) continue;
    found.push({ a, x: p.x, y: p.y, rank });
  }
  found.sort((p, q) => p.rank - q.rank || p.a.code.localeCompare(q.a.code));
  const placed: { x: number; y: number }[] = [];
  const texts = new Set<string>();
  const out: MapLabel[] = [];
  for (const f of found) {
    if (out.length >= max) break;
    const city = f.a.city || f.a.name;
    // On the flat map the code tells a city's airports apart; zoomed out, one name per city is enough
    const text = flat ? `${city} ${f.a.code}` : city;
    if (!flat && texts.has(text)) continue;
    const y = f.y + LABEL_DROP + LABEL_H / 2;
    if (placed.some((p) => Math.abs(p.x - f.x) < LABEL_W && Math.abs(p.y - y) < LABEL_H + 2)) continue;
    placed.push({ x: f.x, y });
    texts.add(text);
    out.push({ code: f.a.code, lon: f.a.lon, lat: f.a.lat, text });
  }
  return out;
}
