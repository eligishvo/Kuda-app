# Kuda Worker

A small Cloudflare Worker between the app and the flight-data services. It keeps the API keys out of the app,
caches answers in Cloudflare KV, and stops after a set number of SerpApi searches per day.

| Endpoint (all GET) | What it returns | Source | Kept for |
|---|---|---|---|
| `/explore?origin&month&duration&adults&area?` | Cheapest destinations for a month (`Destination[]`) | SerpApi Google Travel Explore | 12 h |
| `/estimates?origin&from&to&dest?` (months, `2026-12`) | Cached round trips to everywhere, or to `dest` only (`Destination[]`) | Travelpayouts | 12 h |
| `/oneways?origin&month&dir&dest?` (`dir` = `out` or `back`) | One-way fares from the airport to everywhere, or from everywhere to it; with `dest`, that route only (`OneWay[]`) | Travelpayouts | 12 h |
| `/flights?origin&dest&out&ret&adults&back?` | Outbound options with `departureToken` (`Itinerary[]`). `back` = airport to fly home from, when different from `dest` | SerpApi Google Flights | 1 h |
| `/returns?…&departure_token` | Return options for one outbound flight (`Itinerary[]`) | SerpApi Google Flights | 1 h |
| `/booking?…&booking_token` | Who sells a chosen trip, airline or agency, with prices (`Seller[]`) | SerpApi Google Flights | 1 h |
| `/usage` | Today's SerpApi searches and the cap | KV | — |

Every request needs the header `X-App-Token: <APP_TOKEN>`. Every answer looks like
`{ ok, data, cached, usage: { date, used, cap } }` or `{ ok: false, error }`. The types are in `shared/types.ts`.
Only SerpApi searches that actually go out count against the cap (cached answers and Travelpayouts are free).
The cap is `DAILY_SEARCH_CAP` in `wrangler.toml` (default 40) and resets at midnight UTC.

## Deploy — the easy way (GitHub Action)

1. In the repo on GitHub: Settings → Secrets and variables → Actions → New repository secret. Add:
   - `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (the same values High Command's relay uses)
   - `SERPAPI_KEY`, `TRAVELPAYOUTS_TOKEN`
   - `APP_TOKEN`: any long random text (e.g. from a password generator). Keep a copy for the app.
2. Actions tab → **Deploy worker** → Run workflow. The run's summary shows the Worker's address.
3. In the app: Settings → Flight data (debug) → paste the address and the same `APP_TOKEN` → Save → Usage.

After that the Worker redeploys by itself whenever `worker/` or `shared/` changes on `main`.

## Deploy — by hand (wrangler)

```bash
cd worker
npx wrangler login
npx wrangler deploy                       # creates the KV namespace the first time, prints the address
npx wrangler secret put SERPAPI_KEY       # paste the key when asked
npx wrangler secret put TRAVELPAYOUTS_TOKEN
npx wrangler secret put APP_TOKEN
```

If the deploy stops at the KV step, create the namespace yourself with `npx wrangler kv namespace create CACHE`
and add the `id = "…"` line it prints under `[[kv_namespaces]]` in `wrangler.toml`.

## Check it

```bash
curl https://<address>/                                        # {"ok":true,"service":"kuda-worker"}
curl -H "X-App-Token: <APP_TOKEN>" https://<address>/usage
```

## Code

- `src/handler.ts`: all the logic, written against a tiny key-value interface so `tests/worker.test.ts` runs it in
  Node with a fake store and a fake internet.
- `src/index.ts`: the Cloudflare entry point.
- `../shared/normalize.ts`: raw SerpApi / Travelpayouts answers → the app's types. `../shared/dates.ts`: the
  date-window filter.
