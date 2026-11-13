// Debug screen: calls each Worker endpoint for TLV and shows the normalized answer as it arrives,
// plus how many SerpApi searches are left today. For checking the data before the real screens exist.
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { addDays } from '../../shared/dates';
import { ApiResult, Itinerary, Usage } from '../../shared/types';
import { live } from '../flights/live';
import { api, Connection } from '../api/client';
import { useSearch } from '../search/SearchContext';
import { KEYS, load, save } from '../storage/store';
import { useTheme } from '../theme/ThemeContext';
import { FONTS, Theme, TOUCH } from '../theme/themes';

const DEFAULT_URL: string = Constants.expoConfig?.extra?.kuda?.workerUrl ?? '';
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });
/** How many items of a long list are printed. */
const SHOWN = 8;

type Shown = { title: string; line: string; ok: boolean; json: string };

export default function Debug() {
  const t = useTheme();
  // Calls use the first departure airport of the current search
  const DEPARTURE = { code: useSearch().search.departureAirports[0] };
  const [conn, setConn] = useState<Connection>({ url: DEFAULT_URL, token: '' });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState('');
  const [usage, setUsage] = useState<Usage | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  /** The first outbound option of the last /flights call: what /returns needs. */
  const [lastFlights, setLastFlights] = useState<{ token: string; out: string; ret: string; dest: string } | null>(null);
  const [dest, setDest] = useState('ATH');

  useEffect(() => {
    load<Connection | null>(KEYS.connection, null).then((c) => {
      if (c && typeof c.url === 'string' && typeof c.token === 'string') setConn({ url: c.url || DEFAULT_URL, token: c.token });
    });
  }, []);

  // Test dates: a week-long trip starting a month from today, and that month for Explore
  const today = new Date().toISOString().slice(0, 10);
  const out = addDays(today, 30);
  const ret = addDays(today, 37);
  const month = Number(out.slice(5, 7));
  const from = out.slice(0, 7);
  const to = ret.slice(0, 7);
  const code = dest.trim().toUpperCase();

  async function run<T>(title: string, call: () => Promise<ApiResult<T>>, after?: (data: T) => void) {
    setBusy(title);
    const started = Date.now();
    const r = await call();
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    setBusy('');
    if (r.usage) setUsage(r.usage);
    live.noteUsage(r.usage);
    if (!r.ok) {
      setShown({ title, ok: false, line: `Failed after ${seconds}s`, json: r.error });
      return;
    }
    const list = Array.isArray(r.data) ? r.data : null;
    const count = list ? `${list.length} items${list.length > SHOWN ? ` (first ${SHOWN} shown)` : ''}` : 'done';
    setShown({
      title,
      ok: true,
      line: `${count} · ${seconds}s · ${r.cached ? 'from cache (free)' : 'fresh'}`,
      json: JSON.stringify(list ? list.slice(0, SHOWN) : r.data, null, 2),
    });
    after?.(r.data);
  }

  const rememberFlights = (data: Itinerary[]) => {
    const token = data.find((i) => i.departureToken)?.departureToken;
    setLastFlights(token ? { token, out, ret, dest: code } : null);
  };

  const input = [styles.input, { backgroundColor: t.chip, borderColor: t.border, color: t.text }];
  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Text style={[styles.heading, { color: t.text }]}>Worker</Text>
      <TextInput
        value={conn.url}
        onChangeText={(url) => { setConn({ ...conn, url }); setSaved(false); }}
        placeholder="Worker address (https://…workers.dev)"
        placeholderTextColor={t.muted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={input}
      />
      <TextInput
        value={conn.token}
        onChangeText={(token) => { setConn({ ...conn, token }); setSaved(false); }}
        placeholder="App token (the APP_TOKEN secret)"
        placeholderTextColor={t.muted}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        style={input}
      />
      <Button theme={t} label={saved ? 'Saved' : 'Save'} onPress={() => { save(KEYS.connection, { url: conn.url.trim(), token: conn.token.trim() }); setConn({ url: conn.url.trim(), token: conn.token.trim() }); setSaved(true); }} />

      <Text style={[styles.heading, { color: t.text }]}>Searches today</Text>
      <Text style={[styles.body, { color: usage && usage.used >= usage.cap ? t.price : t.muted }]}>
        {usage ? `${usage.used} of ${usage.cap} used · ${Math.max(0, usage.cap - usage.used)} left (${usage.date}, resets at midnight UTC)` : 'Tap Usage to check.'}
      </Text>

      <Text style={[styles.heading, { color: t.text }]}>Calls from {DEPARTURE.code}</Text>
      <Text style={[styles.body, { color: t.muted }]}>
        Test trip: {out} → {ret}. Fresh Explore and Flights calls each use one search; cached ones are free.
      </Text>
      <View style={styles.row}>
        <Text style={[styles.body, { color: t.muted }]}>Destination for Flights:</Text>
        <TextInput value={dest} onChangeText={setDest} maxLength={3} autoCapitalize="characters" autoCorrect={false} style={[input, styles.dest]} />
      </View>
      <View style={styles.buttons}>
        <Button theme={t} busy={busy} label="Usage" onPress={() => run('Usage', () => api.usage(conn), setUsage)} />
        <Button theme={t} busy={busy} label="Explore" onPress={() => run(`Explore · month ${month} · one week`, () => api.explore(conn, { origin: DEPARTURE.code, month, duration: 2 }))} />
        <Button theme={t} busy={busy} label="Explore Greece" onPress={() => run(`Explore · Greece · month ${month}`, () => api.explore(conn, { origin: DEPARTURE.code, month, duration: 2, area: '/m/035qy' }))} />
        <Button theme={t} busy={busy} label="Estimates" onPress={() => run(`Estimates · ${from} to ${to}`, () => api.estimates(conn, { origin: DEPARTURE.code, from, to }))} />
        <Button theme={t} busy={busy} label="Flights" onPress={() => run(`Flights · ${DEPARTURE.code}–${code} · 1 adult`, () => api.flights(conn, { origin: DEPARTURE.code, dest: code, out, ret }), rememberFlights)} />
        <Button theme={t} busy={busy} label="Flights ×2 adults" onPress={() => run(`Flights · ${DEPARTURE.code}–${code} · 2 adults`, () => api.flights(conn, { origin: DEPARTURE.code, dest: code, out, ret, adults: 2 }))} />
        <Button
          theme={t}
          busy={busy}
          disabled={!lastFlights}
          label="Returns"
          onPress={() => lastFlights && run(`Returns · ${lastFlights.dest}–${DEPARTURE.code}`, () => api.returns(conn, { origin: DEPARTURE.code, dest: lastFlights.dest, out: lastFlights.out, ret: lastFlights.ret, departureToken: lastFlights.token }))}
        />
      </View>
      <Text style={[styles.small, { color: t.muted }]}>
        Returns uses the first option of the last Flights call. Compare the price of "Flights" and "Flights ×2 adults" to
        see whether Google's price is per person or for everyone.
      </Text>

      {busy !== '' && <Text style={[styles.body, { color: t.muted }]}>Calling {busy}…</Text>}
      {shown && (
        <View style={[styles.result, { backgroundColor: t.panel, borderColor: t.border }]}>
          <Text style={[styles.resultTitle, { color: t.text }]}>{shown.title}</Text>
          <Text style={[styles.body, { color: shown.ok ? t.muted : t.price }]}>{shown.line}</Text>
          <Text selectable style={[styles.json, { color: t.text }]}>{shown.json}</Text>
        </View>
      )}
    </ScrollView>
  );
}

function Button({ theme: t, label, onPress, busy, disabled }: { theme: Theme; label: string; onPress: () => void; busy?: string; disabled?: boolean }) {
  const off = disabled || (busy != null && busy !== '');
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      style={[styles.button, { backgroundColor: t.chip, borderColor: t.border, opacity: off ? 0.5 : 1 }]}
    >
      <Text style={[styles.buttonText, { color: t.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 48, gap: 10 },
  heading: { fontFamily: FONTS.heading, fontSize: 20, marginTop: 12 },
  body: { fontFamily: FONTS.body, fontSize: 14, lineHeight: 20 },
  small: { fontFamily: FONTS.body, fontSize: 12, lineHeight: 17 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, minHeight: TOUCH + 4, fontFamily: FONTS.body, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dest: { width: 80, textAlign: 'center' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { borderWidth: 1, borderRadius: 22, paddingHorizontal: 16, minHeight: TOUCH, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: FONTS.bodyMedium, fontSize: 14 },
  result: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 6, marginTop: 6 },
  resultTitle: { fontFamily: FONTS.bodyBold, fontSize: 15 },
  json: { fontFamily: MONO, fontSize: 11, lineHeight: 16 },
});
