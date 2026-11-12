// Turns the raw answers of SerpApi and Travelpayouts into the app's own types (shared/types.ts).
// Pure functions with no network calls, so they're tested against small saved answers in tests/fixtures.
import { isDate, nightsBetween } from './dates';
import { Destination, Itinerary, Layover, Leg } from './types';

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const isIata = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]{3}$/.test(v);
type Raw = Record<string, any>;

/**
 * SerpApi Google Travel Explore → destinations. Entries without a price, an airport code or dates are
 * skipped (Google returns some like that). Prices are per person for the number of adults asked for.
 */
export function normalizeExplore(raw: unknown): Destination[] {
  const list = (raw as Raw)?.destinations;
  if (!Array.isArray(list)) return [];
  const out: Destination[] = [];
  const seen = new Set<string>();
  for (const d of list as Raw[]) {
    const airport = d?.destination_airport?.code;
    const price = num(d?.flight_price);
    if (!isIata(airport) || price == null || price <= 0) continue;
    if (!isDate(d.start_date) || !isDate(d.end_date) || seen.has(airport)) continue;
    seen.add(airport);
    out.push({
      airport,
      city: text(d.name) || airport,
      country: text(d.country) || undefined,
      lat: num(d?.gps_coordinates?.latitude) ?? undefined,
      lon: num(d?.gps_coordinates?.longitude) ?? undefined,
      estimate: {
        source: 'explore',
        confidence: 'live',
        price: Math.round(price),
        outDate: d.start_date,
        retDate: d.end_date,
        nights: nightsBetween(d.start_date, d.end_date),
        stops: num(d.number_of_stops),
        airline: text(d.airline) || undefined,
      },
    });
  }
  return out.sort((a, b) => a.estimate.price - b.estimate.price);
}

/** Travelpayouts nonstop fares run 6–16% below live prices, so they are raised by this much. */
export const TRAVELPAYOUTS_ADJUST = 1.1;

/** Russian airports: Google can't price these routes, so they are hidden. */
export const HIDDEN_AIRPORTS = new Set([
  'AER', 'KRR', 'VKO', 'SVO', 'DME', 'ZIA', 'LED', 'MRV', 'KZN', 'SVX', 'OVB', 'UFA', 'ROV', 'KUF', 'GOJ', 'MCX',
  'VOG', 'STW', 'KGD', 'CEK', 'PEE', 'OMS', 'TJM', 'KJA', 'IKT', 'VVO', 'KHV', 'AAQ', 'GRV', 'NAL', 'OGZ', 'ASF',
  'SIP', 'MMK', 'ARH', 'NBC', 'SGC', 'NJC', 'UUS', 'PKC', 'YKS', 'GDZ', 'ESL', 'IGT',
]);
/** Airlines whose routes Google doesn't sell (A4 = Azimuth). */
export const HIDDEN_AIRLINES = new Set(['A4']);

/**
 * Travelpayouts (Aviasales) prices_for_dates → destinations: the cheapest fare per destination airport.
 * Nonstop fares become "estimate" (+10%), connecting ones "rough".
 */
export function normalizeTravelpayouts(raw: unknown): Destination[] {
  const list = (raw as Raw)?.data;
  if (!Array.isArray(list)) return [];
  const best = new Map<string, Destination>();
  for (const r of list as Raw[]) {
    const airport = isIata(r?.destination_airport) ? r.destination_airport : r?.destination;
    const price = num(r?.price);
    const outDate = text(r?.departure_at).slice(0, 10);
    const retDate = text(r?.return_at).slice(0, 10);
    if (!isIata(airport) || price == null || price <= 0 || !isDate(outDate) || !isDate(retDate)) continue;
    if (HIDDEN_AIRPORTS.has(airport) || HIDDEN_AIRLINES.has(text(r.airline))) continue;
    const nonstop = r.transfers === 0 && r.return_transfers === 0;
    const adjusted = Math.round(nonstop ? price * TRAVELPAYOUTS_ADJUST : price);
    const prev = best.get(airport);
    // Prefer a nonstop fare over a connecting one, then the cheaper
    const prevNonstop = prev?.estimate.confidence === 'estimate';
    if (prev && (prevNonstop !== nonstop ? prevNonstop : prev.estimate.price <= adjusted)) continue;
    best.set(airport, {
      airport,
      city: airport,
      estimate: {
        source: 'travelpayouts',
        confidence: nonstop ? 'estimate' : 'rough',
        price: adjusted,
        outDate,
        retDate,
        nights: nightsBetween(outDate, retDate),
        stops: num(r.transfers),
        airline: text(r.airline) || undefined,
      },
    });
  }
  return [...best.values()].sort((a, b) => a.estimate.price - b.estimate.price);
}

function toLeg(f: Raw): Leg | null {
  const from = f?.departure_airport?.id;
  const to = f?.arrival_airport?.id;
  if (!isIata(from) || !isIata(to)) return null;
  return {
    airline: text(f.airline),
    flightNumber: text(f.flight_number),
    from,
    to,
    departs: text(f.departure_airport.time),
    arrives: text(f.arrival_airport.time),
    durationMin: num(f.duration) ?? 0,
  };
}

/**
 * SerpApi Google Flights → itineraries, best options first. Works for both the outbound list
 * (each option carries a departure_token) and the return list (each carries a booking_token).
 */
export function normalizeFlights(raw: unknown): Itinerary[] {
  const r = raw as Raw;
  const options = [...(Array.isArray(r?.best_flights) ? r.best_flights : []), ...(Array.isArray(r?.other_flights) ? r.other_flights : [])];
  const out: Itinerary[] = [];
  for (const o of options as Raw[]) {
    if (!Array.isArray(o?.flights)) continue;
    const legs = (o.flights as Raw[]).map(toLeg);
    if (legs.length === 0 || legs.some((l) => l == null)) continue;
    const layovers: Layover[] = (Array.isArray(o.layovers) ? (o.layovers as Raw[]) : []).map((l) => ({
      airport: text(l?.id),
      durationMin: num(l?.duration) ?? 0,
      overnight: l?.overnight === true,
    }));
    out.push({
      legs: legs as Leg[],
      layovers,
      stops: legs.length - 1,
      durationMin: num(o.total_duration) ?? (legs as Leg[]).reduce((n, l) => n + l.durationMin, 0),
      price: num(o.price),
      departureToken: text(o.departure_token) || undefined,
      bookingToken: text(o.booking_token) || undefined,
    });
  }
  return out;
}
