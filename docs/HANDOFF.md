# Kuda — handoff

Living status for whoever works on this next (person or AI). Keep it short and current.
Spec: `docs/BRIEF.md`. Rules: `AGENTS.md`.

## Status (2026-11-12)

**All phases of the brief are written, plus the owner's requests of 2026-11-12** (Adults setting, flying back
from another airport, city names on the map, a search form with a Search button, a results list with filters,
mixed-airport options in the list). Phases 1 and 2 were run by the owner on his phone and against the deployed
Worker and worked; he has since used later versions enough to ask for changes, but gave no pass/fail report.
The newest round (this section's last block) passes the checks (typecheck, 129 tests, Android bundle, Worker
dry-run build) and has **not been tried on the phone yet**. An Android preview app (arm64) exists; pushes to
`main` reach it as updates.

Built in phase 1:
- Expo SDK 58 project (`kuda`, owner `elidesigninc`), Expo Router, TypeScript, vitest, same versions as Mechanoplanner.
- Three themes (Monochrome default, Ocean, Dusk) as token objects in `src/theme/themes.ts`; the choice is saved.
- Settings screen: theme picker, "Report a problem" (posts to the High Command relay as `app:kuda`), version.
- The map (`src/map/`): a globe that flattens between 2× and 3.5× zoom; drag with momentum, pinch that keeps the
  place under the fingers, tap to select. Natural Earth 110m borders below 2.6× zoom, 50m above; large airports at
  every zoom, medium ones on the flat map. Starts centred on Israel; TLV has a ring, Israel is the "home" colour.
- Selection: tap a country to select all of it (tap again to clear). On the flat map, tap an airport dot to add or
  remove just that airport, or tap a selected country to list its airports in the sheet. The bottom sheet shows
  chips ("Greece · all 25", "Italy · FCO, NAP") with remove and Clear. The selection is saved.
- High Command: Kuda added to `APPS` in High-Command `src/config.ts` and `relay/wrangler.toml`.
- GitHub Action `.github/workflows/eas.yml` (checks, EAS update, `[build]` for an Android preview build).

Built in phase 2:
- `shared/`: the types (`Destination`, `PriceEstimate`, `Itinerary`, `Leg`, `TripSelection`, `Usage`, `ApiResult`),
  the date-window filter (`fitsWindow`, `monthsInWindow`, `durationBucket`) and the normalizers for SerpApi Explore,
  SerpApi Google Flights and Travelpayouts.
- `worker/`: Cloudflare Worker with `/explore`, `/estimates`, `/flights`, `/returns`, `/usage`; KV cache (12 h for
  Explore and estimates, 1 h for flights); daily SerpApi cap (`DAILY_SEARCH_CAP`, default 40); `X-App-Token` check.
  Deploy steps are in `worker/README.md`; `.github/workflows/worker.yml` deploys it from repo secrets.
- App: `src/api/client.ts` and a debug screen (Settings → Flight data (debug)) that calls every endpoint for TLV
  and prints the normalized result, timing, cached or fresh, and the searches left today.
- Tests: 68 in total, including the normalizers and date filter against fixtures and the whole Worker run in Node
  with a fake store and a fake internet.

Built in phase 2b:
- `src/search/`: the search (`departureCc`, `departureAirports`, `earliestOut`, `latestRet`, `minNights`,
  `maxNights`, `adults`, `budget`) with one function, `sanitizeSearch`, that repairs any invalid combination; it
  is saved on the phone and shared between screens through `SearchProvider` / `useSearch()`.
- "Trip details" screen (`src/app/search.tsx`): departure country (searchable list) then its airports, a calendar
  for the date window, trip-length and traveler steppers, budget per person in $25 steps.
- The map screen shows the search as a tappable summary under the title. The departure country is the "home"
  colour and can't be picked as a destination; every departure airport gets a ring.
- The default budget is one constant: `DEFAULT_BUDGET` in `src/search/search.ts`.

Built in phase 3:
- `src/results/results.ts`: `planCalls` (one Google Explore call per month you could leave in, at most four;
  free Travelpayouts calls per month and month pair) and `buildResults` (Google's price first, Travelpayouts to
  fill gaps, "no estimate" for selected airports with nothing; filtered by the date window and the budget).
- `useResults`: runs the calls when the user taps "Search flights" (never by itself), shows progress and the
  searches left today, and re-filters without a new search when the destinations or budget change. Changing the
  dates, trip length or departure marks the prices as out of date.
- Price pins on the map (`src/map/PricePins.tsx`): solid for Google's prices, dashed for estimates, "?" for no
  estimate; only the cheapest 10 show on the globe, 25 while it flattens, all on the flat map. Tapping a pin
  highlights its row.
- Results sheet (`src/ui/ResultsSheet.tsx`): ranked list with city, code, airport name, dates, nights, stops and
  price; tapping a row flies the map there. "Destinations" switches back to the selection.
- Airports are written with their city everywhere: "Sofia (SOF)" in chips, the trip summary and results; lists
  also show the full airport name.

Built in phases 4 and 5:
- Destination screen (`src/app/destination.tsx`, rules in `src/flights/flights.ts`): opened from a result's
  "Compare flights" / "Check flights" button. Checks up to three date pairs live, one after the other: the dates
  the price lists suggest for that airport first, then trips spread across the window. Shows a comparison of the
  dates (cheapest price, fastest time, stops), the outbound options of the open date, and, after tapping an
  outbound flight, its return options (loaded on demand: one more search).
- Choosing a return saves a typed `TripSelection` (`KEYS.trip`) and opens the placeholder Planner
  (`src/app/planner.tsx`), which shows the route, both flights leg by leg and the price. Also reachable from
  Settings → Chosen flights (planner).
- High Command registration and the problem-report button were done in phase 1.
- Not done: the Android preview build (`[build]`) and publishing the Expo update.

Added after the brief (owner's requests):
- **Adults:** the number of adults is in Trip details and also in Settings → Trip. Live flight checks use it.
  Wording is "adults" everywhere.
- **Fly back from another airport ("open jaw"):** on the destination screen, "Fly back from" offers the same
  airport, the other selected destinations nearest to the arrival airport, or any airport by search. The Worker's
  `/flights` and `/returns` take `back=<IATA>`; when it differs from `dest` they ask Google for a two-leg
  multi-city trip (`type=3`, `multi_city_json`). `TripSelection.returnFrom` records it; the Planner shows it.
  Open-jaw prices exist only as live checks: the map's price pins and list are always plain round trips, because
  Google Explore and Travelpayouts only price round trips.

Added 2026-11-12, second round (owner's requests):
- **City names on the map** (`src/map/labels.ts`, `CityLabels.tsx`): under the airport dots. About 16 major
  hubs on the globe, more large cities while it flattens, and on the flat map "City CODE" for up to 44 airports.
  Selected, departure and priced airports are always named. Names never overlap and stay out from under the
  panels. They are re-chosen when the map has moved about 50 pixels, not every frame.
- **City names fixed at the source:** OurAirports names the town an airport stands in ("Spata-Artemida" for
  Athens, "Ferno" for Milan). `scripts/build-map-data.mjs` now takes the city an airport serves from OpenFlights.
- **Search screen** (`src/app/search.tsx`, title "Search flights"): adults, departure, possible dates, trip
  length in days, budget, options (nonstop only; include flying home from a different airport), then a **Search**
  button that fetches prices and opens the results list. The map's "Search flights" button opens this screen.
- **Results list** (`src/app/results.tsx`): one line per destination and pair of dates with leave and return
  dates, take-off times when the source has them, trip length in days and the total cost for all adults. Sort by
  cheapest, earliest or shortest; filters for price, trip length, nonstop, Google prices only and mixed airports.
  A line opens the live flight check for that destination and those dates.
- **Mixed-airport options in the list:** `buildMixed` pairs a one-way fare out to airport A with a one-way fare
  home from airport B (Worker `/oneways`, free Travelpayouts calls). With destinations selected A and B are both
  among them; with none, B is within 400 km of A. Shown as "Home from …", priced as two one-way tickets, and
  switched off by the search option or the list's filter. Opening one starts the live check for that pair.
- Travelpayouts answers now keep up to eight dated options per airport (they used to keep one), with take-off
  times; selection and results are shared between screens through `SelectionProvider` and `ResultsProvider`.
- Wording: trip length is in **days** on screen (the code still says nights: return date minus leave date).

Added 2026-11-12, third round (owner's feedback after using the app: "it seems to work"):
- **Airport card before selecting:** on the flat map, tapping an airport dot no longer toggles it. A card in the
  bottom panel shows "City (CODE)", the full airport name and the country, with Add / Remove. The tapped airport
  also gets its name on the map. Zoomed in past 6×, up to 80 airports are named (was 44).
- **Report button:** a "!" button in every screen's header and floating on the map (under the gear) opens a
  separate Report screen (`src/app/report.tsx`). The ticket records which screen it was pressed on
  (`whereOf` in `src/report/report.ts`). Settings links to the same screen instead of holding the form.

Added 2026-11-12, fourth round (owner asked where prices come from and who sells them):
- **Source on every price:** results lines carry a badge, "Google Flights · Checked" (solid) or "Aviasales ·
  Estimate" / "Aviasales · Rough estimate" (dashed). A "Price sources" button on the results list explains each.
  The map's results panel and the destination screen say the same in words (`originOf` in `results.ts`).
- **Who sells it:** on the Planner, "See who sells it (1 search)" lists the sellers Google has for the chosen
  flights, each marked "Airline, direct" or "Third party (travel agency)", with its price. Worker `/booking`
  (SerpApi booking options via the return option's `booking_token`), `normalizeSellers`, `Seller` type.

Added 2026-11-13: **trip planner, version 1** (brief: `docs/PLANNER.md`, decided with the owner):
- Choosing a return flight now starts a **trip** and opens it (`src/app/trip.tsx`): tabs for Plan (day by day),
  Stay (recorded by hand, with "nights without a stay"), Budget (flights + stays + activities + other costs,
  total and per person), List (checklist and notes) and Flights (the old Planner content, with "See who sells it").
- "My trips" (`src/app/planner.tsx`, reachable from the map and Settings) lists saved trips with Open / Delete.
- Trips live on the phone under `kuda.trips`; flights chosen with an earlier version become the first trip.

Added 2026-11-13: **return flights counted** (owner's request):
- Destination screen: every outbound flight shows "N return flights" once counted, and every date option shows
  the count (or a range, "3–7 return flights", when several outbound flights were counted).
- Counting costs one search per outbound flight (that is how Google lists returns), so: the first outbound flight
  of each date is counted automatically; "Count returns for the other N flights (N searches)" does the rest of
  the visible list; Settings → Trip → "Count return flights for every outbound flight" does the first five of
  each date automatically. Returns already loaded are never searched again in the same visit.
- Opening a destination now uses up to 6 searches (3 dates + 3 counts); from a results-list line, 2.

Fixed 2026-11-13: **searches found too little** (owner: many airports selected, 10–14 days in March, one
result). The "Diagnose search" workflow replayed it with real answers: nothing was dropped for price; almost every
price was dropped for its dates. Google Explore gives one trip per destination per month and picks the length
itself (13–16 days, some ending in April); Aviasales' cache is mostly 2–7 day trips; 8 selected airports had no
price at all. Changes:
- **Two one-way tickets to the same airport** (`buildSameAirport`): one-way fares (always fetched now, free)
  paired out + back when the length fits. Shown as "two one-way tickets", also used for the map's pins.
- **Each selected airport is asked on its own** (`planCalls(s, selected).routes`, Worker `dest=` on
  `/estimates` and `/oneways`; up to 15 airports, free calls run 4 at a time). Single-route answers hold many
  more dates than the "everywhere" ones. Changing the destinations now marks the prices out of date.
- Travelpayouts answers keep up to 60 date options per airport (was 8, which kept only the cheapest short trips
  and threw away the longer ones). The Worker's cache key became `estimates2:` so old answers aren't reused.
- **"Nothing that fits" list** under the results (`missingDestinations`): every selected airport without a
  fitting price, with the closest price found and why it doesn't fit ("16 days, back 6 Apr"), and Check live.
- `scripts/diagnose-search.mjs` + `.github/workflows/diagnose-search.yml`: replay a search and print every price
  with the reason it was kept or dropped. Replaying within 12 hours of the app's search costs no searches.

Added 2026-11-13: **flexible trip length** (owner chose "option 1" of three ways to find more trips):
- Search screen → Trip length → "Flexible by" (exact, ±1 … ±5 days; default ±2). `Search.flexDays`;
  `lengthRange(s)` is the widened range used by `windowOf`, the list's length filter and the no-fit list.
- Results lines outside the asked range show their length highlighted with "1 day longer than asked" etc.
- Changing it re-filters what was fetched; no new searches.
- The other two options, **on hold by the owner (2026-11-13)**: a paid SerpApi plan so Search can check selected
  airports live ($25/month for 1,000 searches), and Duffel as a free live source. Duffel's services agreement
  forbids use "for metasearch purposes" (2.5(d)) and grants use "solely for your business operations" (1.1),
  which a personal price-comparison app may not fit; the suggestion was to ask help@duffel.com first. The
  "Test Duffel" workflow and `scripts/test-duffel.mjs` are ready but no `DUFFEL_TOKEN` secret exists.

## How to test on a phone

1. In the repo folder: `git pull`, `npm install`, `npx expo start`.
2. Scan the QR code with Expo Go (same Wi-Fi as the computer).
3. Try: spin the globe and let go (it should glide); pinch in on Greece until the map is flat and back out; tap
   Greece, Italy; pinch in and tap airport dots; tap a selected country when flat (airport list opens); remove a
   chip; Clear; close and reopen the app (selection and theme should still be there); Settings → switch themes →
   send a test report (a ticket should appear in High Command under Kuda).

## How to test the Worker

1. Deploy it: `worker/README.md` (five repo secrets, then run the "Deploy worker" Action).
2. In the app: Settings → Flight data (debug). Paste the Worker's address and the `APP_TOKEN`, Save.
3. Tap Usage (free), then Estimates (free), then Explore, Flights, Returns (one search each; a second tap on the
   same button should say "from cache (free)"). "Explore Greece" checks the country search.
4. Tap "Flights ×2 adults" and compare its prices with "Flights": that answers the open question below.

## How to test phases 4 and 5

After a search, tap a result row, then "Compare flights". Three date rows fill in one after the other (about 3
searches). Tap a date row to see its outbound flights; tap one ("See returns", 1 search); tap a return
("Choose"): the Planner opens with both flights. Go back to the map, open Settings → Chosen flights: the same
trip is there. For a "no estimate" airport the button says "Check flights".

## How to test the trip planner

1. Search, open a destination, choose an outbound and a return: a trip opens on the Plan tab.
2. Plan: "+ Add to this day", type a time like 930 and a name, Save; tap the item to edit or delete it.
3. Stay: add a place for part of the trip; the warning should count the nights still missing.
4. Budget: check the total; correct the flights cost; add a per-person cost and a for-everyone cost.
5. List: tick items, add one, write a note. Close and reopen the app: everything should still be there.
6. Map → "My trips": the trip is listed with its total; choosing other flights adds a second trip.

## How to test the second round

1. Map: city names appear under airports; more as you pinch in, with codes once the map is flat.
2. Tap "Search flights" on the map: set adults, dates, trip length (e.g. 5–8 days), budget, options; tap Search.
3. Results list: each line has Leave / Return / Trip / total. Try Cheapest / Earliest / Shortest, then Filters:
   lower the price, narrow the days, Nonstop only, and switch "Home from a different airport" off and on.
4. Tap a line: the live check opens for those dates (and for that pair of airports on a "Home from" line).
5. "Map" goes back to the globe; "Prices on map" shows the pins.

## How to test flying back from another airport

Select two countries or a few airports, search, open a destination ("Compare flights"). Under "Fly back from"
tap another airport (or "Other airport…" and type a city): the three dates are checked again for arriving at
one and leaving from the other (about 3 searches). Pick an outbound, then a return (it leaves from the other
airport), "Choose": the Planner says "… back from …". Tap "Same airport" to go back to the round trip (free:
it was already loaded).

## How to test phase 3

Needs the Worker address and token saved on the debug screen. Select Greece and Italy, tap "Search flights":
progress shows, then pins and a list. Pinch in to see more pins; tap a pin (its row highlights); tap a row (the
map flies there). Tap "Destinations", add a country, "Show results": the list changes without a new search.
Lower the budget in Trip details: fewer results. Change the dates: a note asks to Refresh. With nothing
selected, "Search everywhere" lists every priced destination.

## How to test phase 2b

On the map, tap the summary under "Kuda". Change the country (e.g. Greece) and pick two airports; pick a date
range on the calendar; change nights, travelers and budget. Go back: the summary, the home country colour and the
rings on the map should follow. Close and reopen the app: the search should still be there.

## Next

1. The owner tries the trip planner on the phone; fix what turns up.
2. Still open from earlier: the per-person price question (below); the seller list, mixed-airport options and
   multi-city answers have only met made-up test answers.
3. Planner ideas listed at the end of `docs/PLANNER.md`, only if the owner asks.

## Not verified

- Phase 2b on a phone (calendar taps, the country list, the summary pill's size on a small screen).
- The trip planner on a phone: the forms with the keyboard open (the screen should scroll so the field stays
  visible), the calendar inside the Stay form, long trips with many day cards.
- The second round on a phone: city names (legibility, how they feel while dragging), the search and results
  screens, and the mixed-airport options against real Travelpayouts one-way answers (`/oneways` was only run in
  tests; calling Travelpayouts with only a destination is documented but untried with the owner's token).
- Times in the list come from Travelpayouts only. Google Explore gives dates but no times, so Google-priced
  lines say "time: tap" until the live check.
- The seller list against a real answer: `/booking` and `normalizeSellers` were only run on a made-up answer
  shaped like SerpApi's documentation (`together` / `departing` + `returning`, `book_with`, `airline`, `price`).
  If sellers come back empty or all "third party", compare with the real answer.
- Multi-city answers from Google: the open-jaw calls were only run in tests with made-up answers. If the real
  second-leg answer has a different shape (for example no price on the options), the return list will show it.
- Phases 4 and 5 on a phone and against real answers: the destination screen's sequence of live checks, the
  returns list (real `departure_token`s are long; they travel in the address of the Worker call), the Planner.
- Phase 3 on a phone: pins following the map, pin taps, the results list, and how many Google results actually
  fit a real date window (Google picks the dates; a narrow window may leave most airports with "no estimate").
- Speed on other phones: the globe was smooth enough on the owner's phone that he reported no problem, but no
  frame rate was measured. If dragging stutters, try a lower `KEEP_50M` in `scripts/build-map-data.mjs`.
- The fixtures in `tests/fixtures/` were written by hand from the API documentation. The real calls worked on the
  debug screen, but the fixtures have not been replaced with real captured answers.
- "Explore Greece" and the "no results" wording were not reported on separately.

## Decisions and open questions

- **Flat projection (needs the owner's OK).** The brief asks for a conic conformal flat map blended with
  `d3.geoProjectionMutator`. Built instead: a blend of the globe (orthographic) with a **stereographic** map
  centred on the middle of the screen, in our own small maths file (`src/map/projection.ts`). Why: both are the
  same kind of projection and differ only in distance from the centre, so the morph is one formula that runs on
  the UI thread during gestures, and the centre stays still by itself. Stereographic is conformal too (shapes stay
  true), and at regional zoom it looks the same as a conic map. d3-geo is still used for tap hit-testing. If the
  owner wants conic conformal specifically, it replaces `radial()` and the two projection formulas.
- **Is Google's price per person or for everyone (adults > 1)?** Still open: the owner said prices "seem to
  work" but didn't report the two numbers. Compare "Flights" and "Flights ×2 adults" on the debug screen before
  phase 4 shows totals. The app asks Explore and estimates with 1 adult, so those prices are per person.
- **Third-party sellers (owner asked 2026-11-12):** prices come from Google Flights (which includes online travel
  agencies among its partners) and from Aviasales' cache (also a metasearch). Lists show one price per flight
  and its source; the seller is only known after a live check, on the Planner's "See who sells it". Kiwi-only
  self-transfer combinations and Israeli agencies such as Gulliver are not covered unless Google lists them.
- **"Checked" on a results line** means Google's price as of the search, which the Worker keeps for up to 12
  hours; it is not re-checked until the line is opened.
- **OpenFlights city names** are under the Open Database License (attribution, shown in Settings → About;
  share-alike for the derived data file). Fine for a personal app; if the app is ever published commercially,
  review it or swap in another source. Reverting is one line in `scripts/build-map-data.mjs`.
- **Mixed-airport prices are two separate one-way tickets added together**, as estimates. That is a real way to
  book it, but Google's multi-city price (the live check) can differ.
- **"Days" = nights between the two dates.** The owner said "5–8 days"; the calendar meaning is return date
  minus leave date.
- **Several departure airports:** the search allows more than one, but prices are fetched from the first one
  only (one origin per call; more would multiply the searches). Offered to the owner, no answer yet.
- **Country searches** (`arrival_area_id`) are not used: they need Google's id for each country and failed for
  some in the brief's tests. Results come from the "anywhere" call filtered to the selection, as the brief allows.
- **While results show, map taps don't change the destinations** (only pins respond); "Destinations" goes back.
- **"No estimate — tap to check":** a pin tap highlights the row; the row's "Check flights" button opens the
  destination screen, which runs the live checks.
- **Opening a destination spends up to 6 searches without asking** (3 live date checks, as the brief describes,
  plus one return count per date since 2026-11-13); the screen shows how many are left. Returns are loaded only when an outbound flight is tapped.
- **Live checks use the first departure airport and the search's number of travelers.**
- **Calendar:** written in the app (`src/ui/Calendar.tsx`) instead of adding a date-picker library, so it follows
  the themes and needs no native code. Weeks start on Sunday.
- **App token:** typed into the debug screen and kept on the phone, not stored in `app.json`, so it never reaches
  the repo or the update bundle. When there is a real search screen this may want a build-time setting instead.
- **Russian routes** are hidden from Travelpayouts results by a list of Russian airport codes plus the A4 airline
  (`HIDDEN_AIRPORTS`, `HIDDEN_AIRLINES` in `shared/normalize.ts`). Extend the list if others show up.
- **Travelpayouts picks one fare per airport:** nonstop before connecting, then the cheapest. Filtering by the
  user's window happens in the app (phase 3), so a fare outside the window can hide one inside it; if that shows
  up in practice, move the window into the `/estimates` call.
- **Daily cap vs the SerpApi plan:** the Worker allows 40 searches a day (`DAILY_SEARCH_CAP`), but the free
  plan has 250 a month (about 8 a day), so heavy use can run out mid-month. Raised with the owner on
  2026-11-13; not changed yet.
- **The cap counts searches sent**, including ones SerpApi answers with an error. It is kept in KV, which is not
  exact under simultaneous calls; with one user that is fine.
- **Brief corrected:** repo name `eligishvo/Kuda` → `eligishvo/Kuda-app` (the real repo). No decision changed.
- **Robots:** Kuda has no test robots yet, so nothing was added to High Command's Bots tab. Add a `robots.yml`
  workflow and bot issues when there is something worth checking nightly (after phase 2).
- **Airports on the globe** are too small to tap, so on the round globe a tap always picks the country; airport
  dots become tappable once the map is flat (3.5× zoom).
- **Small territories** (e.g. Réunion, Guadeloupe, Gibraltar) have airports but no country shape in Natural Earth's
  files: their airports can be picked as dots, but there is no country to tap.
- **Expo link:** `app.json` has no EAS project id yet. The Action links it on its first run (needs the
  `EXPO_TOKEN` repo secret from an account that can publish to `elidesigninc/kuda`), or run `eas init` locally.
- Both phase commits carry `[skip ci]` so no Expo update is spent before the phone test. Run "Deploy worker"
  by hand from the Actions tab.

## Known issues

None recorded yet (nothing has run on a phone).

## Changelog

- **2026-11-13** — Duffel and a paid SerpApi plan put on hold by the owner; Test Duffel workflow kept.
- **2026-11-13** — Flexible trip length (±N days, default ±2). 165 tests. Published as an update.
- **2026-11-13** — Search coverage fix after a real search found one result: same-airport two-ticket trips,
  per-airport free calls, "Nothing that fits" list with reasons, Diagnose search workflow. 159 tests.
- **2026-11-13** — Return flights counted per outbound flight and per date option on the destination screen;
  setting to count them all automatically. 152 tests. Published as an update.
- **2026-11-13** — Trip planner version 1: trips started from chosen flights, with Plan, Stay, Budget, List and
  Flights tabs; "My trips". Rules in `src/planner/trip.ts` (14 tests; 150 in total). Published as an update.
- **2026-11-12** — Fourth round: source badge on every price, "Price sources" explainer, "See who sells it" on
  the Planner (Worker `/booking`). 136 tests. Published as an update; the Worker redeploys with it.
- **2026-11-12** — Third round: airport card before selecting, more names when zoomed in, a separate report
  button on every screen. Owner reported the previous rounds "seem to work". 130 tests. Published as an update.
- **2026-11-12** — Second round of owner's requests: city names on the map (with served-city names from
  OpenFlights), search form with a Search button and options, results list with dates, times, days, total cost,
  sorting and filters, mixed-airport options from one-way fares (Worker `/oneways`). 129 tests. Published as an
  update; the Worker redeploys with it. Not yet on a phone.
- **2026-11-12** — The first Android build failed in Gradle: the compiler was killed (out of memory on Expo's
  free build machine) while compiling Skia for the x86 emulator format. The preview build now compiles only
  for arm64 phones (`gradleCommand` in `eas.json`), which is every current Android phone but not emulators or
  very old 32-bit phones. Added the "Build status" workflow, which prints why the newest build failed.
- **2026-11-12** — First GitHub run: Expo project linked, Android preview build started, Worker redeployed; the
  update step failed because it bundled every platform and the app has no web packages. Publishing is now
  Android only (`eas update --platform android`).
- **2026-11-12** — Owner's requests: Adults also in Settings; fly back from a different airport (Worker `back`
  parameter with multi-city search, chooser on the destination screen, `returnFrom` in the saved trip). 110 tests.
  Owner said to publish: this commit runs the checks, publishes the first Expo update and starts the first
  Android preview build (`[build]`), and redeploys the Worker.
- **2026-11-12** — Phases 4 and 5: destination screen with live date checks, outbound and return lists and a
  date comparison; chosen flights saved as `TripSelection` and shown on a placeholder Planner. 105 tests passing.
  Not yet on a phone; no build or update published.
- **2026-11-12** — Phase 3: price search plan and results rules, price pins, results sheet, "Search flights".
  Airports shown as "City (CODE)" with full names in lists (owner's request). 95 tests passing. Not yet on a phone.
- **2026-11-12** — Phase 2b: search rules and saved state, Trip details screen, calendar, steppers, summary on
  the map, departure rings from the search. 80 tests passing. Not yet tried on the phone.
- **2026-11-12** — Owner ran the app in Expo Go: globe, selection, themes, settings and the debug screen's Usage
  all worked. Calls that reach SerpApi / Travelpayouts failed with "unexpected error": the Worker called
  Cloudflare's `fetch` as a property of an object, which Cloudflare refuses. Fixed (`REAL` in `handler.ts`), and
  unexpected errors now say what they were. Also fixed `npm install` on a fresh clone (react-dom pinned).
- **2026-11-12** — First "Deploy worker" run failed: the deploy step installed wrangler into the app's packages
  and hit a peer-dependency conflict. Fixed by giving `worker/` its own `package.json` with wrangler.
- **2026-11-12** — Phase 2 written in the same cloud session: shared types and normalizers, the Worker, the API
  client and debug screen, fixtures and tests (68 passing), deploy workflow and instructions. Checks: typecheck,
  tests, Android bundle, wrangler dry-run build. Not deployed, not called with real keys.
- **2026-11-12** — Phase 1 written in a Claude cloud session: project, themes, settings, globe map, selection,
  handoff files, High Command wiring. Checks: typecheck, 34 tests, Android bundle. Not yet run on a phone.
