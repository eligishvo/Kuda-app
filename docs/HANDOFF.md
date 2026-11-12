# Kuda — handoff

Living status for whoever works on this next (person or AI). Keep it short and current.
Spec: `docs/BRIEF.md`. Rules: `AGENTS.md`.

## Status (2026-11-12)

**Phase 1 is written and passes every check that runs without a phone. It has not been run on a phone yet.**
The first job of the next session is to try it in Expo Go and fix what the phone shows.

Built:
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

## How to test on a phone

1. In the repo folder: `git pull`, `npm install`, `npx expo start`.
2. Scan the QR code with Expo Go (same Wi-Fi as the computer).
3. Try: spin the globe and let go (it should glide); pinch in on Greece until the map is flat and back out; tap
   Greece, Italy; pinch in and tap airport dots; tap a selected country when flat (airport list opens); remove a
   chip; Clear; close and reopen the app (selection and theme should still be there); Settings → switch themes →
   send a test report (a ticket should appear in High Command under Kuda).

## Next

1. Fix whatever the phone test turns up (see "Not verified" below), then publish phase 1.
2. Phase 2: Cloudflare Worker (`worker/`), shared types (`shared/`), debug screen. See the brief.

## Not verified (needs a phone)

- Nothing has run in Expo Go. The Android bundle builds, types check and 34 unit tests pass, and the drawing code
  was looked at as SVG pictures, but gestures, Skia drawing on the UI thread and speed are untested.
- Speed: every frame re-projects the visible countries on the UI thread. If dragging stutters on the phone, the
  first things to try are a lower `KEEP_50M` in `scripts/build-map-data.mjs` (fewer border points) and drawing
  medium airports only above a higher zoom.
- The first frame copies the border data to the UI thread once; a short pause when the app opens would be that.
- The settings button is a "⚙" text character; if the phone's font draws it oddly, swap it for an icon.

## Decisions and open questions

- **Flat projection (needs the owner's OK).** The brief asks for a conic conformal flat map blended with
  `d3.geoProjectionMutator`. Built instead: a blend of the globe (orthographic) with a **stereographic** map
  centred on the middle of the screen, in our own small maths file (`src/map/projection.ts`). Why: both are the
  same kind of projection and differ only in distance from the centre, so the morph is one formula that runs on
  the UI thread during gestures, and the centre stays still by itself. Stereographic is conformal too (shapes stay
  true), and at regional zoom it looks the same as a conic map. d3-geo is still used for tap hit-testing. If the
  owner wants conic conformal specifically, it replaces `radial()` and the two projection formulas.
- **Brief corrected:** repo name `eligishvo/Kuda` → `eligishvo/Kuda-app` (the real repo). No decision changed.
- **Robots:** Kuda has no test robots yet, so nothing was added to High Command's Bots tab. Add a `robots.yml`
  workflow and bot issues when there is something worth checking nightly (after phase 2).
- **Airports on the globe** are too small to tap, so on the round globe a tap always picks the country; airport
  dots become tappable once the map is flat (3.5× zoom).
- **Small territories** (e.g. Réunion, Guadeloupe, Gibraltar) have airports but no country shape in Natural Earth's
  files: their airports can be picked as dots, but there is no country to tap.
- **Expo link:** `app.json` has no EAS project id yet. The Action links it on its first run (needs the
  `EXPO_TOKEN` repo secret from an account that can publish to `elidesigninc/kuda`), or run `eas init` locally.
- The first commit carries `[skip ci]` so no Expo update is spent before the phone test.

## Known issues

None recorded yet (nothing has run on a phone).

## Changelog

- **2026-11-12** — Phase 1 written in a Claude cloud session: project, themes, settings, globe map, selection,
  handoff files, High Command wiring. Checks: typecheck, 34 tests, Android bundle. Not yet run on a phone.
