import { describe, expect, it } from 'vitest';
import { api, get } from '../src/api/client';

const conn = { url: 'https://kuda-worker.example/', token: 'app-token' };

function fake(body: unknown, status = 200) {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  const fn = (async (url: string, init: { headers: Record<string, string> }) => {
    seen.push({ url, headers: init.headers });
    return { ok: status < 400, status, json: async () => body };
  }) as unknown as typeof fetch;
  return { fn, seen };
}

describe('Worker client', () => {
  it('sends the token and builds the address for each endpoint', async () => {
    const f = fake({ ok: true, data: [], cached: false, usage: { date: '2026-11-12', used: 0, cap: 40 } });
    await api.usage(conn, f.fn);
    await api.explore(conn, { origin: 'TLV', month: 12, duration: 2, area: '/m/035qy' }, f.fn);
    await api.estimates(conn, { origin: 'TLV', from: '2026-12', to: '2027-01' }, f.fn);
    await api.flights(conn, { origin: 'TLV', dest: 'ATH', out: '2026-12-07', ret: '2026-12-14', adults: 2 }, f.fn);
    await api.returns(conn, { origin: 'TLV', dest: 'ATH', out: '2026-12-07', ret: '2026-12-14', departureToken: 'a b/c=' }, f.fn);
    expect(f.seen.map((s) => s.url)).toEqual([
      'https://kuda-worker.example/usage',
      'https://kuda-worker.example/explore?origin=TLV&month=12&duration=2&area=%2Fm%2F035qy',
      'https://kuda-worker.example/estimates?origin=TLV&from=2026-12&to=2027-01',
      'https://kuda-worker.example/flights?origin=TLV&dest=ATH&out=2026-12-07&ret=2026-12-14&adults=2',
      'https://kuda-worker.example/returns?origin=TLV&dest=ATH&out=2026-12-07&ret=2026-12-14&departure_token=a%20b%2Fc%3D',
    ]);
    expect(f.seen.every((s) => s.headers['X-App-Token'] === 'app-token')).toBe(true);
  });

  it('passes the Worker’s own errors through', async () => {
    const f = fake({ ok: false, error: 'Daily search limit reached (40).', usage: { date: '2026-11-12', used: 40, cap: 40 } }, 429);
    expect(await api.explore(conn, { origin: 'TLV', month: 12, duration: 2 }, f.fn)).toMatchObject({ ok: false, error: 'Daily search limit reached (40).', usage: { used: 40 } });
  });

  it('never throws: no address, no token, no connection, nonsense answers', async () => {
    expect(await get({ url: '', token: 'x' }, '/usage')).toMatchObject({ ok: false });
    expect(await get({ url: 'https://x', token: '' }, '/usage')).toMatchObject({ ok: false });
    const down = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await get(conn, '/usage', down)).toMatchObject({ ok: false });
    expect(await get(conn, '/usage', fake('<html>', 502).fn)).toEqual({ ok: false, error: 'The Worker answered 502 without data.' });
  });
});
