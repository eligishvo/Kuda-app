// Turns the raw answers of SerpApi and Travelpayouts into the app's own types (shared/types.ts).
// Pure functions with no network calls, so they're tested against small saved answers in tests/fixtures.
import { isDate, nightsBetween } from './dates';
import { Destination, Itinerary, Layover, Leg, OneWay, Seller } from './types';

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

/** How many date options are kept per airport from one Travelpayouts answer (enough for a month of trips). */
export const OPTIONS_PER_AIRPORT = 60;

const clockOf = (stamp: string) => (/T\d{2}:\d{2}/.test(stamp) ? stamp.slice(11, 16) : undefined);

/**
 * Travelpayouts (Aviasales) prices_for_dates → destinations. Each airport keeps up to eight options on
 * different dates (nonstop before connecting, then the cheapest), so the results list can offer a choice of
 * dates. Nonstop fares become "estimate" (+10%), connecting ones "rough".
 */
export function normalizeTravelpayouts(raw: unknown): Destination[] {
  const list = (raw as Raw)?.data;
  if (!Array.isArray(list)) return [];
  const byAirport = new Map<string, Map<string, Destination>>();
  for (const r of list as Raw[]) {
    const airport = isIata(r?.destination_airport) ? r.destination_airport : r?.destination;
    const price = num(r?.price);
    const outDate = text(r?.departure_at).slice(0, 10);
    const retDate = text(r?.return_at).slice(0, 10);
    if (!isIata(airport) || price == null || price <= 0 || !isDate(outDate) || !isDate(retDate)) continue;
    if (HIDDEN_AIRPORTS.has(airport) || HIDDEN_AIRLINES.has(text(r.airline))) continue;
    const nonstop = r.transfers === 0 && r.return_transfers === 0;
    const adjusted = Math.round(nonstop ? price * TRAVELPAYOUTS_ADJUST : price);
    const options = byAirport.get(airport) ?? new Map<string, Destination>();
    byAirport.set(airport, options);
    // One option per pair of dates: a nonstop fare beats a connecting one, then the cheaper wins
    const key = `${outDate}_${retDate}`;
    const prev = options.get(key);
    const prevNonstop = prev?.estimate.confidence === 'estimate';
    if (prev && (prevNonstop !== nonstop ? prevNonstop : prev.estimate.price <= adjusted)) continue;
    options.set(key, {
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
        outTime: clockOf(text(r.departure_at)),
        retTime: clockOf(text(r.return_at)),
      },
    });
  }
  const rank = (d: Destination) => (d.estimate.confidence === 'estimate' ? 0 : 1);
  const out: Destination[] = [];
  for (const options of byAirport.values()) {
    out.push(...[...options.values()].sort((a, b) => rank(a) - rank(b) || a.estimate.price - b.estimate.price).slice(0, OPTIONS_PER_AIRPORT));
  }
  return out.sort((a, b) => a.estimate.price - b.estimate.price || a.airport.localeCompare(b.airport));
}

/** How many dates are kept per airport from one answer of one-way fares (one a day for a month). */
export const ONE_WAYS_PER_AIRPORT = 31;

/**
 * Travelpayouts one-way fares → OneWay[]. `dir` says which way they go: 'out' = from the departure airport
 * (the other end is where you land), 'back' = to the departure airport (the other end is where you leave from).
 */
export function normalizeOneWays(raw: unknown, dir: 'out' | 'back'): OneWay[] {
  const list = (raw as Raw)?.data;
  if (!Array.isArray(list)) return [];
  const byAirport = new Map<string, Map<string, OneWay>>();
  for (const r of list as Raw[]) {
    const airport = dir === 'out' ? (isIata(r?.destination_airport) ? r.destination_airport : r?.destination) : isIata(r?.origin_airport) ? r.origin_airport : r?.origin;
    const price = num(r?.price);
    const date = text(r?.departure_at).slice(0, 10);
    if (!isIata(airport) || price == null || price <= 0 || !isDate(date)) continue;
    if (HIDDEN_AIRPORTS.has(airport) || HIDDEN_AIRLINES.has(text(r.airline))) continue;
    const nonstop = r.transfers === 0;
    const adjusted = Math.round(nonstop ? price * TRAVELPAYOUTS_ADJUST : price);
    const dates = byAirport.get(airport) ?? new Map<string, OneWay>();
    byAirport.set(airport, dates);
    const prev = dates.get(date);
    const prevNonstop = prev?.confidence === 'estimate';
    if (prev && (prevNonstop !== nonstop ? prevNonstop : prev.price <= adjusted)) continue;
    dates.set(date, {
      airport, date, time: clockOf(text(r.departure_at)), price: adjusted, stops: num(r.transfers),
      airline: text(r.airline) || undefined, confidence: nonstop ? 'estimate' : 'rough',
    });
  }
  const rank = (o: OneWay) => (o.confidence === 'estimate' ? 0 : 1);
  const out: OneWay[] = [];
  for (const dates of byAirport.values()) {
    out.push(...[...dates.values()].sort((a, b) => rank(a) - rank(b) || a.price - b.price).slice(0, ONE_WAYS_PER_AIRPORT));
  }
  return out.sort((a, b) => a.price - b.price || a.airport.localeCompare(b.airport) || a.date.localeCompare(b.date));
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

/**
 * SerpApi Google Flights booking options → who sells the chosen trip and for how much, cheapest first.
 * Each option is either one ticket ("together") or two separate tickets ("departing" + "returning").
 */
export function normalizeSellers(raw: unknown): Seller[] {
  const list = (raw as Raw)?.booking_options;
  if (!Array.isArray(list)) return [];
  const out: Seller[] = [];
  for (const o of list as Raw[]) {
    if (o?.together && text(o.together.book_with)) {
      const t = o.together;
      out.push({ name: text(t.book_with), airline: t.airline === true, price: num(t.price), fare: text(t.option_title) || undefined, separate: false });
    } else if (o?.departing && o?.returning && text(o.departing.book_with) && text(o.returning.book_with)) {
      const a = o.departing;
      const b = o.returning;
      const pa = num(a.price);
      const pb = num(b.price);
      out.push({
        name: text(a.book_with) === text(b.book_with) ? text(a.book_with) : `${text(a.book_with)} + ${text(b.book_with)}`,
        airline: a.airline === true && b.airline === true,
        price: pa != null && pb != null ? pa + pb : null,
        separate: true,
      });
    }
  }
  // Priced sellers first, cheapest first; the ones without a price last
  return out.sort((x, y) => (x.price ?? Infinity) - (y.price ?? Infinity) || x.name.localeCompare(y.name));
}
