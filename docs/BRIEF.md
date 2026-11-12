# Kuda — project brief

**Kuda** is a new Expo / React Native / TypeScript app in the High Command ecosystem (repo `eligishvo/Kuda-app`, app id `kuda`): discover flights from TLV on a map, compare real itineraries, and hand the chosen flights to a trip planner (planner itself comes later). Android first. Built for me (Eli); I have basic coding knowledge, so keep the code simple and explain decisions in plain words. I'm limited on Claude tokens and Expo updates: work in the phases below, batch changes, and stop at the end of each phase.

## Stack and conventions
- **Expo all the way**: a managed Expo project (no ejecting, no `android/` or `ios/` folders committed), so it runs in **Expo Go** during development. Ship with EAS Update (over the air) and EAS Build for Android preview builds. Only add libraries that work in Expo Go; if one ever needs a dev build, ask me first.
- Same setup as Mechanoplanner (`eligishvo/mechanoplanner`): Expo SDK 58, React Native 0.88, Expo Router, TypeScript, vitest. Copy its GitHub Action for EAS updates and its `[build]` commit convention for Android preview builds. Expo updates are limited, so batch changes and publish only at the end of a phase.
- Map: a **globe that flattens as you zoom in**, drawn with `@shopify/react-native-skia` and `d3-geo`, with gestures from `react-native-gesture-handler` and `react-native-reanimated`. No MapLibre, no tile provider, no map API key; it must run in **Expo Go**.
  - **Round when zoomed out, flat when zoomed in.** Zoomed out it's a round globe (orthographic) you spin. As you pinch in, it smoothly morphs into a flat regional map (conic conformal, centred on whatever is in the middle of the screen). Build this as one interpolated projection: blend the two raw projections with a factor `t` driven by zoom (`t = 0` below about 2× zoom, `t = 1` above about 3.5×, eased in between), using `d3.geoProjectionMutator`. Dragging spins the globe while it's round and pans the map once it's flat. Zooming back out turns it round again. Keep the point under the user's fingers stable during the morph.
  - Gestures: drag (with momentum), pinch to zoom, and tap to select or deselect a country (hit-test with `d3.geoContains` on the inverted tap point; ignore taps on the far side of the globe). Tap an airport dot to select just that airport. When zoomed in, tapping a selected country shows its airports so you can narrow the selection. Starts centred on Israel.
  - Data, bundled offline: Natural Earth countries at 110m for zoomed out and 50m when zoomed in (TopoJSON → GeoJSON), plus an airports file built once from OurAirports (large and medium airports with scheduled service: IATA code, name, city, country code, lat/lon). Show large airports at every zoom and medium ones only when zoomed in.
  - Performance: aim for smooth 60fps on a mid-range Android phone. Precompute and simplify paths, re-project on the UI thread, and draw only what's visible.
  - The same map later shows routes from the departure airport, price pins (results) and the departure airport itself.
- **Themes**: three themes, switchable in a small settings screen and saved locally, defined as one token object each in `theme/` so every screen and the map use them. Concept screens: https://claude.ai/artifact/RkuxbqGqsyWgrK4iMyDCuP (private to me; the colours below are the source of truth).

  | Token | Monochrome (default) | Ocean | Dusk |
  |---|---|---|---|
  | background | #050505 | #071526 | #1A0F24 |
  | panel (sheets, cards) | #111111 | #0C2036 | #24152F |
  | chip / border | #1B1B1B / #2E2E2E | #12304D / #1E4468 | #2E1C3B / #45305A |
  | text / muted text | #F2F2F2 / #A3A3A3 | #EEF4FA / #9FB3C8 | #FBEFF5 / #C3A9C0 |
  | sea (globe shading light → dark; flat map) | #161616 → #060606; #050505 | #14406B → #071E36; #0A2441 | #3B2257 → #160C22; #231433 |
  | land / borders | #3A3A3A / #141414 | #2E6E72 / #0D3A4A | #5E4270 / #2A1838 |
  | graticule / globe rim / rim glow | #1C1C1C / #3A3A3A / #FFFFFF at 10% | #0F2C4B / #2B5C8A / #4FA3FF at 16% | #2A1A3A / #6B4A7A / #FF5E8A at 14% |
  | selected country fill / stroke | #F5F5F5 / #FFFFFF | #FF7A59 / #FFC2B0 | #FF5E8A / #FFC1D3 |
  | partly selected country (dashed outline) | #F5F5F5 | #FF7A59 | #FFB347 |
  | accent: routes, price pins, prices, main button | #FFFFFF (button text #0A0A0A) | #FF7A59; routes #FFB199; prices #FF9A7F (button text #1A0A05) | #FFB347 (button text #2A1300) |
  | selected airport dot / other airport dots | #FFFFFF / #8A8A8A | #FFD2C4 / #8FB8C9 | #FFD166 / #B497BD |
  | departure airport and home country | #FFFFFF ring; country #8A8A8A | #FFFFFF ring; country #8FB8C9 | #FFFFFF ring; country #B497BD |

  Type: Space Grotesk for headings, Inter for everything else. Touch targets at least 44px. The selection panel is a bottom sheet with removable chips (e.g. "Greece · all 8", "Italy · FCO, NAP"); the results sheet lists the cheapest destinations with prices in the accent colour.
- Backend: a **Cloudflare Worker** (separate folder `worker/`, same pattern as High Command's relay). It holds `SERPAPI_KEY` and `TRAVELPAYOUTS_TOKEN` as secrets, caches responses in KV, and enforces a **daily SerpApi search cap** (default 40, configurable). The app sends a shared `APP_TOKEN` header; the Worker rejects requests without it. The keys never go in the app.
- **High Command compatibility** (app id `kuda`). Look at how Mechanoplanner is wired into High Command (`eligishvo/High-Command`, `eligishvo/mechanoplanner`) and copy that exactly:
  - Add Kuda's entry to High Command's app config, as its own small commit in the High Command repo, following that repo's CLAUDE.md.
  - Add a "Report a problem" button in Kuda's settings that posts to the relay (`POST /report`), so tickets land as GitHub issues labelled `app:kuda`.
  - Use the same `CLAUDE.md` shipping rule as the other apps (typecheck and tests, then merge to main and push without asking) and the same EAS update Action and `[build]` convention.
  - Add Kuda's robot specs in the same format High Command uses for Mechanoplanner's robots, so High Command's Bots tab can run them.
  - Keep features small enough that a High Command ticket or roadmap item maps to one piece of work.
- **Handoff files for other AI agents**, kept in the repo and updated at the end of every phase, so any agent (Claude Code, ChatGPT, Codex, Cursor) can pick up the work:
  - `CLAUDE.md`: Claude Code's working rules for this repo, plus pointers to the files below.
  - `AGENTS.md`: the same rules written tool-neutrally for other agents: stack, how to run and test, folder map, conventions, what not to touch (keys, the Worker's secrets).
  - `docs/BRIEF.md`: this file, the spec. Change it only when I change a decision, and log the change in HANDOFF.md.
  - `docs/HANDOFF.md`: the living status: what's built, what's next (the current phase), open questions and decisions, known issues, how to test on a phone, and a dated changelog of each session. Keep it short and current, not a diary.
  - `docs/START_PROMPT.md`: a ready-to-paste prompt for starting a fresh session with any AI ("Read AGENTS.md and docs/HANDOFF.md, then continue with …").

## The flow
1. Choose a departure country and one or more departure airports (default TLV).
2. On the map, select whole destination countries and/or individual airports (e.g. all of Greece, only FCO + NAP in Italy).
3. Set earliest departure, latest return, and trip length range (e.g. 5–9 days).
4. Set number of travelers and max round-trip budget **per person** (one constant, easy to change).
5. Results: price pins on the map plus a ranked list. Open a destination to compare real flight times, stops and prices.
6. Pick an outbound and a return itinerary → save a typed `TripSelection` and open a placeholder Planner screen that displays it.

## Data sources (tested Nov 2026, from TLV for December)
**SerpApi Google Travel Explore** (`engine=google_travel_explore`) is the main source for map prices.
- One call with `departure_id=TLV, month=<1-12>, travel_duration=<1 weekend | 2 one week | 3 two weeks>, adults=1, currency=USD, gl=il, hl=en` returned 53 destinations with `destination_airport.code`, `flight_price`, `start_date`, `end_date`, `number_of_stops`, `airline`, `gps_coordinates`. Took about 2 seconds.
- `arrival_area_id=<country kgmid>` worked for Greece (`/m/035qy`): 20 priced airports, about 9 seconds. It returned **"Empty results"** for Europe (`/m/02j9z`) and Germany (`/m/0345h`). Treat country searches as best-effort and fall back to the "anywhere" call filtered by country.
- Prices matched live Google Flights exactly (3 of 3 checks).
- Google chooses the dates: the cheapest trip of about a week in that month. Keep a result only if its dates fit the user's window and trip length. Otherwise mark the destination "no estimate for your dates". Map the trip-length range to `travel_duration`; for a window spanning two months, call each month.
- It returns one airport per city (London came back as LGW, not LHR). Some entries have no price or airport code: skip those.
- Only the next 6 months are available.

**Travelpayouts Aviasales Data API** is a free extra layer, used only for airports Explore didn't return.
- `GET /aviasales/v3/prices_for_dates?origin=TLV&departure_at=YYYY-MM&return_at=YYYY-MM&one_way=false&unique=false&sorting=price&limit=1000&currency=usd&token=…` with no destination returns cached round trips to every destination. Filter by window and trip length.
- 27 destinations in the test, mostly Wizz Air routes; prices averaged 1.7 days old.
- Nonstop fares were 6–16% **below** live prices, so show them as "from ~$X" with a +10% adjustment and a lower-confidence style.
- Connecting fares were unreliable (16–28% off, on itineraries Google doesn't sell): show them as "rough" or hide them.
- Hide Russian domestic routes (the A4 airline, AER, KRR, VKO and similar): Google can't price them.

**SerpApi Google Flights** (`engine=google_flights`, `type=1`) provides live prices on the destination screen.
- Returns `best_flights` and `other_flights`. Each option has `flights[]` (airline, flight_number, departure and arrival times and airports, duration), `layovers`, `total_duration`, `price` (round-trip total) and `departure_token`.
- Return-leg options need a **second call** with `departure_token`, so each chosen outbound costs one more search.
- Took 1–3 seconds, up to 9.
- Check in phase 1 whether `price` with `adults>1` is per person or the total; I don't know yet.

**Search budget:** free plan is 250 searches/month; $25/month buys 1,000. Typical planning session: 1–4 Explore calls (cached 12h), about 3 live date checks per opened destination (cached 1h), plus 1 return-leg call. Show the remaining daily cap in a debug screen.

## Worker endpoints (all GET, JSON, cached in KV)
- `/explore?origin&month&duration&adults&area?` → normalized destinations
- `/estimates?origin&from&to` → normalized Travelpayouts round trips
- `/flights?origin&dest&out&ret&adults` → normalized outbound options (with departure_token)
- `/returns?…&departure_token` → normalized return options
- `/usage` → today's SerpApi count and cap

Normalize everything into shared TypeScript types (`Destination`, `PriceEstimate {source: 'explore' | 'travelpayouts', confidence}`, `Itinerary`, `Leg`, `TripSelection`) in a `shared/` folder used by both the app and the Worker.

## Phases (stop after each one, summarize, and tell me what to test)
1. **Project, globe and handoff files.**
   - Set up the Expo project (`kuda`).
   - Write the handoff files (CLAUDE.md, AGENTS.md, docs/HANDOFF.md, docs/START_PROMPT.md).
   - Add the three themes and the settings screen.
   - Build the map described under Stack: a round globe that flattens when you zoom in; spin, pan and zoom; select countries and airports; a bottom sheet listing the current selection with remove and clear buttons. Persist the selection and theme locally. No flight data yet. Must run in Expo Go.
   - Do the High Command wiring: config entry, report button, CLAUDE.md rule.
2. **Worker + types + debug screen.** Build the Worker with all endpoints, caching and the cap; deploy instructions for me (wrangler secrets). Add one debug screen in the app that calls each endpoint for TLV and shows the raw normalized results. Unit tests for the normalizers and the date-window filter, using small JSON fixtures.
2b. **Search setup.** Departure picker (country, then airports), dates, trip length, travelers and budget, alongside the globe selection. Persist the last search locally.
3. **Results.** Price pins on the globe (Explore first, Travelpayouts to fill gaps, confidence styling, "no estimate — tap to check" for the rest) and a ranked list, both filtered by budget.
4. **Destination screen.** Run live checks on the best 3 date pairs (from the estimates, or spread across the window if there's no estimate), list outbound options, load returns on demand, and compare time, stops and price.
5. **Handoff + polish.** Save `TripSelection` and show it on the placeholder Planner screen; add High Command registration and the problem-report button; produce an Android preview build (`[build]`).

Start with phase 1 only.
