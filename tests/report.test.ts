import { describe, expect, it } from 'vitest';
import { buildReport, checkReport, sendReport } from '../src/report/report';
import { THEME_IDS, THEMES } from '../src/theme/themes';

const ctx = { screen: '/settings', where: 'Settings', steps: ['⚙ (top right)'], version: '1.0.0', updateId: null, platform: 'android' };

describe('problem reports', () => {
  it('needs a short title', () => {
    expect(checkReport({ title: ' a ', details: '' })).toMatch(/title/);
    expect(checkReport({ title: 'Globe is jumpy', details: '' })).toBeNull();
    expect(checkReport({ title: 'x'.repeat(200), details: '' })).toMatch(/title/);
  });

  it('files under app:kuda with the fields the relay expects', () => {
    const p = buildReport({ title: '  Globe   is jumpy ', details: ' when pinching ' }, ctx);
    expect(p).toMatchObject({ app: 'kuda', title: 'Globe is jumpy', details: 'when pinching', screen: '/settings', version: '1.0.0', platform: 'android' });
  });

  it('posts to <relay>/report and reports the ticket number', async () => {
    let called = '';
    const ok = (async (url: string) => {
      called = url;
      return { ok: true, status: 200, json: async () => ({ ticket: 12 }) };
    }) as unknown as typeof fetch;
    expect(await sendReport('https://relay.example/', buildReport({ title: 'abc', details: '' }, ctx), ok)).toEqual({ ok: true, ticket: 12 });
    expect(called).toBe('https://relay.example/report');
  });

  it('never throws when the relay is down or refuses', async () => {
    const down = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    const refuse = (async () => ({ ok: false, status: 400, json: async () => ({ error: 'Unknown app' }) })) as unknown as typeof fetch;
    const p = buildReport({ title: 'abc', details: '' }, ctx);
    expect(await sendReport('https://relay.example', p, down)).toMatchObject({ ok: false });
    expect(await sendReport('https://relay.example', p, refuse)).toEqual({ ok: false, error: 'Unknown app' });
  });
});

describe('themes', () => {
  it('all three define the same tokens, as hex colours', () => {
    expect(THEME_IDS).toEqual(['monochrome', 'ocean', 'dusk']);
    const keys = Object.keys(THEMES.monochrome).sort();
    for (const id of THEME_IDS) {
      expect(Object.keys(THEMES[id]).sort()).toEqual(keys);
      for (const [k, v] of Object.entries(THEMES[id])) {
        if (typeof v === 'string' && k !== 'id' && k !== 'name') expect(v).toMatch(/^#[0-9A-F]{6}$/);
      }
    }
  });
});
