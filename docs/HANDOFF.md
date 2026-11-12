# Kuda — handoff

Living status for whoever works on this next (person or AI). Keep it short and current.
Spec: `docs/BRIEF.md`. Rules: `AGENTS.md`.

## Status (2026-11-12)

**Phases 1, 2 and 2b are built.** Phases 1 and 2 were run by the owner on his phone in Expo Go and against the
deployed Worker with real keys on 2026-11-12: the globe, selection, themes, settings and every debug-screen call
worked. Phase 2b (search setup) passes the checks but has not been tried on the phone yet.

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

1. Phase 3: results. Price pins on the globe and a ranked list, filtered by the search's budget and date window
   (`fitsWindow`, `monthsInWindow`, `durationBucket` in `shared/dates.ts` are ready for this). See the brief.
2. Publish: every commit so far carries `[skip ci]`, so no Expo update or Android build has been made. The owner
   hasn't said whether to publish yet; ask before the first push without `[skip ci]`.

## Not verified

- Phase 2b on a phone (calendar taps, the country list, the summary pill's size on a small screen).
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
- **Several departure airports:** the search allows more than one, but prices are fetched from the first one
  only (one origin per call; more would multiply the searches). Offered to the owner, no answer yet.
- **Country searches** (`arrival_area_id`) are not used: they need Google's id for each country and failed for
  some in the brief's tests. Results come from the "anywhere" call filtered to the selection, as the brief allows.
- **While results show, map taps don't change the destinations** (only pins respond); "Destinations" goes back.
- **"No estimate — tap to check"** pins and rows exist, but the check itself is phase 4 (live flight search).
- **Calendar:** written in the app (`src/ui/Calendar.tsx`) instead of adding a date-picker library, so it follows
  the themes and needs no native code. Weeks start on Sunday.
- **App token:** typed into the debug screen and kept on the phone, not stored in `app.json`, so it never reaches
  the repo or the update bundle. When there is a real search screen this may want a build-time setting instead.
- **Russian routes** are hidden from Travelpayouts results by a list of Russian airport codes plus the A4 airline
  (`HIDDEN_AIRPORTS`, `HIDDEN_AIRLINES` in `shared/normalize.ts`). Extend the list if others show up.
- **Travelpayouts picks one fare per airport:** nonstop before connecting, then the cheapest. Filtering by the
  user's window happens in the app (phase 3), so a fare outside the window can hide one inside it; if that shows
  up in practice, move the window into the `/estimates` call.
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
