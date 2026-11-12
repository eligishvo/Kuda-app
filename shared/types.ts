// The shapes shared by the app and the Worker. The Worker turns whatever SerpApi and Travelpayouts
// return into these, so the app only ever sees one format.

/** A date as text, e.g. "2026-12-07". */
export type DateText = string;

/** Where a price came from. */
export type PriceSource = 'explore' | 'travelpayouts';

/**
 * How much to trust a price:
 *   live     — matches Google Flights (SerpApi Explore)
 *   estimate — Travelpayouts nonstop fare, a little old; shown as "from ~$X"
 *   rough    — Travelpayouts connecting fare; often off by 16–28%
 */
export type Confidence = 'live' | 'estimate' | 'rough';

/** A round-trip price for one person on specific dates. */
export type PriceEstimate = {
  source: PriceSource;
  confidence: Confidence;
  /** US dollars per person, round trip. Travelpayouts nonstop fares already include the +10% adjustment. */
  price: number;
  outDate: DateText;
  retDate: DateText;
  nights: number;
  /** Stops on the way out (null when unknown). */
  stops: number | null;
  /** Airline name or code, when known. */
  airline?: string;
};

/** A place you can fly to, with the best price found for it. */
export type Destination = {
  /** IATA code of the airport the price is for. */
  airport: string;
  city: string;
  country?: string;
  lat?: number;
  lon?: number;
  estimate: PriceEstimate;
};

/** One flight (take-off to landing). */
export type Leg = {
  airline: string;
  flightNumber: string;
  from: string;
  to: string;
  /** Local times as Google shows them, e.g. "2026-12-07 06:30". */
  departs: string;
  arrives: string;
  durationMin: number;
};

export type Layover = { airport: string; durationMin: number; overnight: boolean };

/** One way of getting there (or back): one or more flights. */
export type Itinerary = {
  legs: Leg[];
  layovers: Layover[];
  stops: number;
  durationMin: number;
  /** Round-trip price as Google reports it, in US dollars (null when it shows none). */
  price: number | null;
  /** Pass to /returns to list the flights back that go with this outbound flight. */
  departureToken?: string;
  /** Present on return options: identifies the complete round trip for booking. */
  bookingToken?: string;
};

/** What the user picked: handed to the trip planner. */
export type TripSelection = {
  origin: string;
  destination: string;
  adults: number;
  outbound: Itinerary;
  inbound: Itinerary;
  /** Round-trip price in US dollars for the whole selection, as shown with the return flight. */
  price: number | null;
};

/** Today's SerpApi searches and the daily limit. */
export type Usage = { date: DateText; used: number; cap: number };

/** Every Worker answer has this envelope. */
export type ApiResult<T> =
  | { ok: true; data: T; cached: boolean; usage: Usage }
  | { ok: false; error: string; usage?: Usage };
