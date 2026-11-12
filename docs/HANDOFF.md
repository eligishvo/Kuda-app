# Kuda — handoff

Living status for whoever works on this next (person or AI). Keep it short and current.
Spec: `docs/BRIEF.md`. Rules: `AGENTS.md`.

## Status (2026-11-12)

**Phases 1 and 2 are written and pass every check that runs without a phone or API keys. Neither has been run
for real yet:** the app has not been opened in Expo Go, and the Worker has not been deployed or called with real
keys. The first job of the next session is to fix what those two tests turn up.

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

## Next

1. Fix whatever the phone test and the first real Worker calls turn up (see "Not verified"), then publish.
2. Phase 2b: search setup (departure picker, dates, trip length, travelers, budget). See the brief.

## Not verified (needs a phone)

- Nothing has run in Expo Go. The Android bundle builds, types check and 34 unit tests pass, and the drawing code
  was looked at as SVG pictures, but gestures, Skia drawing on the UI thread and speed are untested.
- Speed: every frame re-projects the visible countries on the UI thread. If dragging stutters on the phone, the
  first things to try are a lower `KEEP_50M` in `scripts/build-map-data.mjs` (fewer border points) and drawing
  medium airports only above a higher zoom.
- The first frame copies the border data to the UI thread once; a short pause when the app opens would be that.
- The settings button is a "⚙" text character; if the phone's font draws it oddly, swap it for an icon.
- The Worker has only been run in tests with made-up answers. The fixtures in `tests/fixtures/` were written by
  hand from the SerpApi and Travelpayouts documentation and the fields listed in the brief, not captured from real
  calls. If a real answer has a different shape, the debug screen will show an empty list or an error: save the
  real answer as the fixture and adjust `shared/normalize.ts`.
- The wording SerpApi uses for "no results" is matched loosely (`no results`, `empty results`, `hasn't returned
  any results`); anything else is reported as an error.
- `.github/workflows/worker.yml` relies on wrangler creating the KV namespace on the first deploy. If that step
  fails, `worker/README.md` has the manual fallback.
- The Worker's address in `app.json` (`https://kuda-worker.eligishvo.workers.dev`) is a guess based on the relay's
  address; the debug screen lets you type the real one.

## Decisions and open questions

- **Flat projection (needs the owner's OK).** The brief asks for a conic conformal flat map blended with
  `d3.geoProjectionMutator`. Built instead: a blend of the globe (orthographic) with a **stereographic** map
  centred on the middle of the screen, in our own small maths file (`src/map/projection.ts`). Why: both are the
  same kind of projection and differ only in distance from the centre, so the morph is one formula that runs on
  the UI thread during gestures, and the centre stays still by itself. Stereographic is conformal too (shapes stay
  true), and at regional zoom it looks the same as a conic map. d3-geo is still used for tap hit-testing. If the
  owner wants conic conformal specifically, it replaces `radial()` and the two projection formulas.
- **Is Google's price per person or for everyone (adults > 1)?** Still open; needs real keys. The debug screen's
  "Flights ×2 adults" button answers it. Until then the app asks Explore and estimates with 1 adult, so those
  prices are per person.
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
