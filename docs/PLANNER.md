# Trip planner — brief (version 1)

Decided with the owner on 2026-11-12. This adds to `docs/BRIEF.md`, which ended at a placeholder Planner.

## What it is

After choosing an outbound and a return flight, the app starts a **trip** and opens it. A trip has five tabs:

| Tab | What you do there |
|---|---|
| **Plan** | One card per day, from the day you land to the day you fly home. Add things to do with an optional time, note and cost. The landing and fly-home times are shown on their days. |
| **Stay** | Record where you sleep: name, check-in and check-out (picked on a calendar inside the trip's dates), total price, note. The tab says which nights have no stay yet. |
| **Budget** | Flights + stays + activity costs + other costs = total, and per person. The flights figure starts from Google's price and can be corrected. Other costs can be per person or for everyone. |
| **List** | A checklist (starts with five usual items) and free notes. |
| **Flights** | The chosen flights, where the price comes from, and "See who sells it". |

## Decisions

- **Everything is typed in by hand.** No AI suggestions and no places search in version 1.
- **Stays are recorded, not searched.** No hotel price lookups.
- **Several trips are kept.** Choosing flights again starts a new trip; "My trips" lists them, newest first, with
  Open and Delete (Delete asks once more).
- **Kept on the phone only** (AsyncStorage, key `kuda.trips`). Nothing is uploaded; a new phone starts empty.
- **Money is in US dollars**, like the flight prices. Stay prices and activity costs are totals for everyone.
- A trip's days are fixed by its flights. To change the dates, choose other flights (a new trip).

## Code

- `src/planner/trip.ts`: the `Trip` type and every rule (days, saving and removing items and stays, nights
  without a stay, the budget, the checklist, reading saved trips back). Pure and unit tested (`tests/planner.test.ts`).
- `src/planner/TripsContext.tsx`: the saved trips, shared between screens (`useTrips()`).
- `src/planner/tabs.tsx`, `parts.tsx`: the tabs and their small building blocks.
- `src/app/planner.tsx` (list of trips), `src/app/trip.tsx` (one trip).

## Not in version 1 (ideas for later, only if the owner asks)

Suggestions for places, a hotel search, other currencies, moving items between days by dragging, sharing or
exporting a trip, backup to the cloud, changing a trip's flights in place.
