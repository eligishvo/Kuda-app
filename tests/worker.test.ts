import { describe, expect, it } from 'vitest';
import { Env, handle, Store } from '../worker/src/handler';
import bookingRaw from './fixtures/booking.json';
import explore from './fixtures/explore.json';
import flights from './fixtures/flights.json';
import onewaysBack from './fixtures/oneways-back.json';
import onewaysOut from './fixtures/oneways-out.json';
import travelpayouts from './fixtures/travelpayouts.json';

/** A fake KV store that also remembers how long each key was meant to live. */
function fakeStore() {
  const data = new Map<string, string>();
  const ttl = new Map<string, number | undefined>();
  const store: Store = {
    get: async (k) => data.get(k) ?? null,
    put: async (k, v, o) => {
      data.set(k, v);
      ttl.set(k, o?.expirationTtl);
    },
  };
  return { store, data, ttl };
}

/** A fake internet: answers SerpApi and Travelpayouts from the fixtures and records every address asked for. */
function fakeFetch(overrides: Record<string, unknown> = {}) {
  const calls: URL[] = [];
  const fn = (async (input: string) => {
    const url = new URL(input);
    calls.push(url);
    let body: unknown;
    if (url.hostname === 'api.travelpayouts.com' && url.searchParams.get('one_way') === 'true') body = url.searchParams.get('origin') ? onewaysOut : onewaysBack;
    else if (url.hostname === 'api.travelpayouts.com') body = overrides.travelpayouts ?? travelpayouts;
    else if (url.searchParams.get('engine') === 'google_travel_explore') body = overrides.explore ?? explore;
    else if (url.searchParams.get('booking_token')) body = bookingRaw;
    else body = overrides.flights ?? flights;
    return { ok: true, status: 200, json: async () => body };
  }) as unknown as typeof fetch;
  return { fn, calls };
}

function setup(env: Partial<Env> = {}, overrides: Record<string, unknown> = {}) {
  const kv = fakeStore();
  const net = fakeFetch(overrides);
  const full: Env = { CACHE: kv.store, SERPAPI_KEY: 'serp-key', TRAVELPAYOUTS_TOKEN: 'tp-token', APP_TOKEN: 'app-token', ...env };
  const deps = { fetch: net.fn, now: () => new Date('2026-11-12T10:00:00Z') };
  const call = async (path: string, token: string | null = 'app-token') => {
    const res = await handle(new Request(`https://kuda-worker.example${path}`, { headers: token ? { 'X-App-Token': token } : {} }), full, deps);
    return { status: res.status, body: (await res.json()) as any };
  };
  return { call, kv, net };
}

describe('Worker: access', () => {
  it('answers a plain hello without a token, and nothing else', async () => {
    const { call } = setup();
    expect((await call('/', null)).body).toEqual({ ok: true, service: 'kuda-worker' });
    expect((await call('/usage', null)).status).toBe(401);
    expect((await call('/usage', 'wrong')).status).toBe(401);
    expect((await call('/usage')).status).toBe(200);
  });

  it('refuses everything until APP_TOKEN is set', async () => {
    const { call } = setup({ APP_TOKEN: undefined });
    expect((await call('/usage')).status).toBe(500);
  });

  it('rejects bad input with a readable message and without spending a search', async () => {
    const { call, net } = setup();
    for (const path of [
      '/explore?origin=tlv&month=12&duration=2',
      '/explore?origin=TLV&month=13&duration=2',
      '/explore?origin=TLV&month=12&duration=4',
      '/explore?origin=TLV&month=12&duration=2&area=Greece',
      '/estimates?origin=TLV&from=2026-12-01&to=2026-12',
      '/flights?origin=TLV&dest=ATH&out=2026-12-07&ret=2026-12-01',
      '/flights?origin=TLV&dest=Athens&out=2026-12-07&ret=2026-12-14',
      '/returns?origin=TLV&dest=ATH&out=2026-12-07&ret=2026-12-14',
    ]) {
      const r = await call(path);
      expect(r.status, path).toBe(400);
      expect(r.body.ok).toBe(false);
      expect(typeof r.body.error).toBe('string');
    }
    expect((await call('/nothing?origin=TLV')).status).toBe(404);
    expect(net.calls).toHaveLength(0);
  });
});

describe('Worker: endpoints', () => {
  it('/explore asks SerpApi with the right settings and returns normalized destinations', async () => {
    const { call, net } = setup();
    const r = await call('/explore?origin=TLV&month=12&duration=2&area=/m/035qy');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, cached: false, usage: { date: '2026-11-12', used: 1, cap: 40 } });
    expect(r.body.data.map((d: any) => d.airport)).toEqual(['FCO', 'ATH', 'LGW']);
    const p = net.calls[0].searchParams;
    expect(net.calls[0].hostname).toBe('serpapi.com');
    expect(Object.fromEntries(p)).toMatchObject({
      engine: 'google_travel_explore', departure_id: 'TLV', month: '12', travel_duration: '2', adults: '1',
      arrival_area_id: '/m/035qy', currency: 'USD', gl: 'il', hl: 'en', api_key: 'serp-key',
    });
  });

  it('answers the same question from the cache the second time, for free', async () => {
    const { call, net, kv } = setup();
    await call('/explore?origin=TLV&month=12&duration=2');
    const again = await call('/explore?origin=TLV&month=12&duration=2');
    expect(again.body).toMatchObject({ ok: true, cached: true, usage: { used: 1 } });
    expect(net.calls).toHaveLength(1);
    expect(kv.ttl.get('explore:TLV:12:2:1:')).toBe(12 * 3600);
    // A different question is a new search
    await call('/explore?origin=TLV&month=1&duration=2');
    expect(net.calls).toHaveLength(2);
  });

  it('treats "no results" as an empty list, kept for a shorter time', async () => {
    const { call, kv } = setup({}, { explore: { error: 'Empty results' } });
    const r = await call('/explore?origin=TLV&month=12&duration=2&area=/m/0345h');
    expect(r.body).toMatchObject({ ok: true, data: [] });
    expect(kv.ttl.get('explore:TLV:12:2:1:/m/0345h')).toBe(3600);
  });

  it('/estimates uses Travelpayouts and does not count against the SerpApi cap', async () => {
    const { call, net } = setup();
    const r = await call('/estimates?origin=TLV&from=2026-12&to=2026-12');
    expect(r.body).toMatchObject({ ok: true, usage: { used: 0 } });
    expect([...new Set(r.body.data.map((d: any) => d.airport))]).toEqual(['LCA', 'BUD', 'LIS']);
    expect(net.calls[0].hostname).toBe('api.travelpayouts.com');
    expect(Object.fromEntries(net.calls[0].searchParams)).toMatchObject({ origin: 'TLV', departure_at: '2026-12', return_at: '2026-12', one_way: 'false', token: 'tp-token' });
  });

  it('/oneways asks Travelpayouts for one-way fares out of, or back to, the airport (free)', async () => {
    const { call, net } = setup();
    const out = await call('/oneways?origin=TLV&month=2026-12&dir=out');
    expect(out.body).toMatchObject({ ok: true, usage: { used: 0 } });
    expect(out.body.data[0]).toMatchObject({ airport: 'ATH', price: 55, date: '2026-12-07' });
    expect(Object.fromEntries(net.calls[0].searchParams)).toMatchObject({ origin: 'TLV', departure_at: '2026-12', one_way: 'true' });
    expect(net.calls[0].searchParams.get('destination')).toBeNull();
    const back = await call('/oneways?origin=TLV&month=2026-12&dir=back');
    expect(back.body.data[0]).toMatchObject({ airport: 'SKG', price: 33 });
    expect(net.calls[1].searchParams.get('destination')).toBe('TLV');
    expect(net.calls[1].searchParams.get('origin')).toBeNull();
    expect((await call('/oneways?origin=TLV&month=2026-12&dir=sideways')).status).toBe(400);
    expect((await call('/oneways?origin=TLV&month=12&dir=out')).status).toBe(400);
  });

  it('/estimates and /oneways can ask about one destination, cached separately', async () => {
    const { call, net, kv } = setup();
    await call('/estimates?origin=TLV&from=2027-03&to=2027-03&dest=FCO');
    expect(net.calls[0].searchParams.get('destination')).toBe('FCO');
    expect(kv.data.has('estimates:TLV:2027-03:2027-03:FCO')).toBe(true);
    await call('/oneways?origin=TLV&month=2027-03&dir=out&dest=FCO');
    expect(Object.fromEntries(net.calls[1].searchParams)).toMatchObject({ origin: 'TLV', destination: 'FCO', one_way: 'true' });
    await call('/oneways?origin=TLV&month=2027-03&dir=back&dest=FCO');
    expect(Object.fromEntries(net.calls[2].searchParams)).toMatchObject({ origin: 'FCO', destination: 'TLV', one_way: 'true' });
    expect(kv.data.has('oneways:TLV:2027-03:back:FCO')).toBe(true);
    expect((await call('/estimates?origin=TLV&from=2027-03&to=2027-03&dest=Rome')).status).toBe(400);
  });

  it('/flights lists outbound options with their departure tokens (kept one hour)', async () => {
    const { call, net, kv } = setup();
    const r = await call('/flights?origin=TLV&dest=ATH&out=2026-12-07&ret=2026-12-14&adults=2');
    expect(r.body.data).toHaveLength(2);
    expect(r.body.data[0].departureToken).toBe('TOKEN-DIRECT');
    expect(Object.fromEntries(net.calls[0].searchParams)).toMatchObject({
      engine: 'google_flights', type: '1', departure_id: 'TLV', arrival_id: 'ATH', outbound_date: '2026-12-07', return_date: '2026-12-14', adults: '2',
    });
    expect(kv.ttl.get('flights:TLV:ATH:2026-12-07:2026-12-14:2')).toBe(3600);
  });

  it('/returns passes the departure token on and caches per token', async () => {
    const { call, net } = setup();
    const path = '/returns?origin=TLV&dest=ATH&out=2026-12-07&ret=2026-12-14&departure_token=';
    await call(`${path}TOKEN-DIRECT`);
    await call(`${path}TOKEN-DIRECT`);
    await call(`${path}TOKEN-VIA-LCA`);
    expect(net.calls).toHaveLength(2);
    expect(net.calls[0].searchParams.get('departure_token')).toBe('TOKEN-DIRECT');
  });

  it('flying back from another airport becomes a two-leg multi-city search, cached separately', async () => {
    const { call, net, kv } = setup();
    const r = await call('/flights?origin=TLV&dest=ATH&out=2026-12-07&ret=2026-12-14&back=SKG');
    expect(r.status).toBe(200);
    const p = Object.fromEntries(net.calls[0].searchParams);
    expect(p).toMatchObject({ engine: 'google_flights', type: '3', adults: '1' });
    expect(JSON.parse(p.multi_city_json)).toEqual([
      { departure_id: 'TLV', arrival_id: 'ATH', date: '2026-12-07' },
      { departure_id: 'SKG', arrival_id: 'TLV', date: '2026-12-14' },
    ]);
    // Multi-city searches must not carry the round-trip fields
    expect(p.departure_id).toBeUndefined();
    expect(p.return_date).toBeUndefined();
    expect(kv.data.has('flights:TLV:ATH:2026-12-07:2026-12-14:1:SKG')).toBe(true);
    // The second leg uses the same search plus the token
    await call('/returns?origin=TLV&dest=ATH&out=2026-12-07&ret=2026-12-14&back=SKG&departure_token=TOKEN-DIRECT');
    expect(Object.fromEntries(net.calls[1].searchParams)).toMatchObject({ type: '3', departure_token: 'TOKEN-DIRECT' });
    // back = the arrival airport is a plain round trip
    await call('/flights?origin=TLV&dest=ATH&out=2026-12-07&ret=2026-12-14&back=ATH');
    expect(net.calls[2].searchParams.get('type')).toBe('1');
    expect((await call('/flights?origin=TLV&dest=ATH&out=2026-12-07&ret=2026-12-14&back=Salonika')).status).toBe(400);
  });

  it('/booking lists who sells a chosen trip (one search, kept an hour)', async () => {
    const { call, net } = setup();
    const path = '/booking?origin=TLV&dest=ATH&out=2026-12-07&ret=2026-12-14&booking_token=BOOK-1';
    const r = await call(path);
    expect(r.body).toMatchObject({ ok: true, cached: false, usage: { used: 1 } });
    expect(r.body.data.map((x: any) => x.name)).toEqual(['Wizz Air + Ryanair', 'Kiwi.com', 'Gotogate', 'Aegean', 'Call to book']);
    expect(Object.fromEntries(net.calls[0].searchParams)).toMatchObject({ engine: 'google_flights', type: '1', departure_id: 'TLV', arrival_id: 'ATH', booking_token: 'BOOK-1' });
    expect((await call(path)).body.cached).toBe(true);
    expect(net.calls).toHaveLength(1);
    expect((await call('/booking?origin=TLV&dest=ATH&out=2026-12-07&ret=2026-12-14')).status).toBe(400);
  });

  it('never returns the API keys', async () => {
    const { call } = setup();
    const text = JSON.stringify([
      await call('/explore?origin=TLV&month=12&duration=2'),
      await call('/estimates?origin=TLV&from=2026-12&to=2026-12'),
      await call('/usage'),
    ]);
    expect(text).not.toContain('serp-key');
    expect(text).not.toContain('tp-token');
    expect(text).not.toContain('app-token');
  });
});

describe('Worker: daily cap', () => {
  it('stops SerpApi searches at the cap, but still serves the cache and Travelpayouts', async () => {
    const { call, net } = setup({ DAILY_SEARCH_CAP: '2' });
    await call('/explore?origin=TLV&month=12&duration=2');
    await call('/flights?origin=TLV&dest=ATH&out=2026-12-07&ret=2026-12-14');
    const blocked = await call('/explore?origin=TLV&month=1&duration=2');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ ok: false, usage: { used: 2, cap: 2 } });
    expect(net.calls).toHaveLength(2);
    expect((await call('/explore?origin=TLV&month=12&duration=2')).body.cached).toBe(true);
    expect((await call('/estimates?origin=TLV&from=2026-12&to=2026-12')).status).toBe(200);
    expect((await call('/usage')).body.data).toEqual({ date: '2026-11-12', used: 2, cap: 2 });
  });

  it('uses 40 a day when no cap is set, and reports a missing key clearly', async () => {
    const { call } = setup({ SERPAPI_KEY: undefined });
    expect((await call('/usage')).body.data.cap).toBe(40);
    const r = await call('/explore?origin=TLV&month=12&duration=2');
    expect(r.status).toBe(500);
    expect(r.body.error).toMatch(/SERPAPI_KEY/);
  });

  it('passes on a SerpApi failure as an error, not as data', async () => {
    const { call } = setup({}, { flights: { error: 'Invalid API key.' } });
    const r = await call('/flights?origin=TLV&dest=ATH&out=2026-12-07&ret=2026-12-14');
    expect(r.status).toBe(502);
    expect(r.body.error).toMatch(/Invalid API key/);
  });
});
