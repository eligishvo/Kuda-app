// One destination: live flight checks on up to three date pairs, the outbound options for each, the return
// options for an outbound you pick, and a comparison of price, time and stops between the dates.
// Each live check and each list of returns is one SerpApi search (free when repeated within the hour).
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Itinerary, Usage } from '../../shared/types';
import { api, Connection } from '../api/client';
import {
  airlinesText, arrivalDayShift, buildTrip, clock, compare, DatePair, datePairs, decodePairs, durationText, routeText, stopsLine,
} from '../flights/flights';
import { airportByCode, airportLabel } from '../map/mapData';
import { windowOf } from '../results/results';
import { shortDate, travelersText } from '../search/search';
import { useSearch } from '../search/SearchContext';
import { KEYS, load, save } from '../storage/store';
import { useTheme } from '../theme/ThemeContext';
import { FONTS, Theme, TOUCH } from '../theme/themes';

type Loaded = { status: 'waiting' | 'loading' | 'done'; list: Itinerary[]; error: string | null; cached: boolean };
const WAITING: Loaded = { status: 'waiting', list: [], error: null, cached: false };
const keyOf = (p: DatePair) => `${p.out}_${p.ret}`;
/** How many options are listed before "Show all". */
const SHOWN = 5;

export default function DestinationScreen() {
  const t = useTheme();
  const { search } = useSearch();
  const params = useLocalSearchParams<{ code?: string; pairs?: string }>();
  const code = (params.code ?? '').toUpperCase();
  const airport = airportByCode(code);
  const origin = search.departureAirports[0];
  // The dates to check come from the results screen; opened without them, spread three across the window
  const [pairs] = useState<DatePair[]>(() => {
    const given = decodePairs(params.pairs);
    return given.length > 0 ? given : datePairs(windowOf(search), []);
  });

  const [conn, setConn] = useState<Connection | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [outbound, setOutbound] = useState<Record<string, Loaded>>({});
  const [open, setOpen] = useState(keyOf(pairs[0] ?? { out: '', ret: '' }));
  /** The outbound flight picked for each date pair, and the returns loaded for it. */
  const [picked, setPicked] = useState<Record<string, Itinerary>>({});
  const [returns, setReturns] = useState<Record<string, Loaded>>({});
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const started = useRef(false);

  const check = useCallback(
    async (c: Connection, p: DatePair) => {
      setOutbound((o) => ({ ...o, [keyOf(p)]: { ...WAITING, status: 'loading' } }));
      const r = await api.flights(c, { origin, dest: code, out: p.out, ret: p.ret, adults: search.adults });
      if (r.usage) setUsage(r.usage);
      setOutbound((o) => ({
        ...o,
        [keyOf(p)]: r.ok ? { status: 'done', list: r.data, error: null, cached: r.cached } : { status: 'done', list: [], error: r.error, cached: false },
      }));
    },
    [origin, code, search.adults],
  );

  // On opening: check the date pairs one after the other
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const c = await load<Connection | null>(KEYS.connection, null);
      if (!c?.url || !c?.token) {
        setConn({ url: '', token: '' });
        return;
      }
      setConn(c);
      for (const p of pairs) await check(c, p);
    })();
  }, [pairs, check]);

  const pickOutbound = async (p: DatePair, it: Itinerary) => {
    const k = keyOf(p);
    setPicked((x) => ({ ...x, [k]: it }));
    if (!conn || !it.departureToken) {
      setReturns((x) => ({ ...x, [k]: { status: 'done', list: [], error: 'Google gave no way to list returns for this flight.', cached: false } }));
      return;
    }
    setReturns((x) => ({ ...x, [k]: { ...WAITING, status: 'loading' } }));
    const r = await api.returns(conn, { origin, dest: code, out: p.out, ret: p.ret, adults: search.adults, departureToken: it.departureToken });
    if (r.usage) setUsage(r.usage);
    setReturns((x) => ({
      ...x,
      [k]: r.ok ? { status: 'done', list: r.data, error: null, cached: r.cached } : { status: 'done', list: [], error: r.error, cached: false },
    }));
  };

  const choose = async (p: DatePair, inbound: Itinerary) => {
    const out = picked[keyOf(p)];
    if (!out) return;
    await save(KEYS.trip, buildTrip(origin, code, search.adults, out, inbound));
    router.push('/planner');
  };

  const title = airport ? `${airport.city || airport.name} (${code})` : code;
  const notSetUp = conn != null && (!conn.url || !conn.token);
  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.page}>
      <Stack.Screen options={{ title }} />
      <Text style={[styles.heading, { color: t.text }]}>{title}</Text>
      <Text style={[styles.body, { color: t.muted }]}>
        {airport?.name ?? 'Unknown airport'} · from {airportLabel(origin)} · {travelersText(search.adults)}
      </Text>
      {notSetUp && (
        <Text style={[styles.body, { color: t.price }]}>
          Flight data isn’t set up yet: open Settings → Flight data (debug) and save the Worker address and app token.
        </Text>
      )}
      {usage && (
        <Text style={[styles.small, { color: usage.used >= usage.cap ? t.price : t.muted }]}>
          {Math.max(0, usage.cap - usage.used)} of {usage.cap} searches left today
        </Text>
      )}

      {/* Comparison between the dates: tap one to see its flights */}
      <Text style={[styles.section, { color: t.text }]}>Dates compared</Text>
      <View style={[styles.table, { borderColor: t.border, backgroundColor: t.panel }]}>
        {pairs.map((p) => {
          const k = keyOf(p);
          const o = outbound[k] ?? WAITING;
          const c = compare(o.list);
          const on = k === open;
          return (
            <Pressable
              key={k}
              onPress={() => setOpen(k)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.dateRow, { borderColor: t.border, backgroundColor: on ? t.chip : 'transparent' }]}
            >
              <View style={styles.flex}>
                <Text style={[styles.dateText, { color: t.text }]}>{shortDate(p.out)} – {shortDate(p.ret)}</Text>
                <Text style={[styles.small, { color: o.error ? t.price : t.muted }]} numberOfLines={2}>
                  {o.status === 'waiting' ? 'Waiting…'
                    : o.status === 'loading' ? 'Checking live prices…'
                    : o.error ? o.error
                    : c.count === 0 ? 'No flights found'
                    : `${c.count} options · fastest ${durationText(c.fastestMin ?? 0)} · ${c.fewestStops === 0 ? 'nonstop available' : `${c.fewestStops}+ stops`}`}
                </Text>
              </View>
              <Text style={[styles.price, { color: c.cheapest != null ? t.price : t.muted }]}>{c.cheapest != null ? `$${c.cheapest}` : '—'}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.small, { color: t.muted }]}>
        Prices are round trip, as Google shows them for {travelersText(search.adults)}.
        {search.adults > 1 ? ' Whether that is per person or for everyone has not been confirmed yet.' : ''}
      </Text>

      {pairs.filter((p) => keyOf(p) === open).map((p) => {
        const k = keyOf(p);
        const o = outbound[k] ?? WAITING;
        const mine = picked[k];
        const back = returns[k];
        const list = showAll[k] ? o.list : o.list.slice(0, SHOWN);
        return (
          <View key={k} style={styles.block}>
            <Text style={[styles.section, { color: t.text }]}>Outbound · {shortDate(p.out)}</Text>
            {o.status !== 'done' && <Text style={[styles.body, { color: t.muted }]}>Checking live prices…</Text>}
            {o.status === 'done' && o.error && conn && (
              <SmallButton theme={t} label="Try again" onPress={() => check(conn, p)} />
            )}
            {list.map((it, i) => (
              <Option key={`o${i}`} theme={t} it={it} selected={mine === it} onPress={() => pickOutbound(p, it)} action={mine === it ? 'Selected' : 'See returns'} />
            ))}
            {o.list.length > SHOWN && !showAll[k] && (
              <SmallButton theme={t} label={`Show all ${o.list.length}`} onPress={() => setShowAll((x) => ({ ...x, [k]: true }))} />
            )}

            {mine && (
              <>
                <Text style={[styles.section, { color: t.text }]}>Return · {shortDate(p.ret)}</Text>
                {(!back || back.status !== 'done') && <Text style={[styles.body, { color: t.muted }]}>Loading returns for the selected flight…</Text>}
                {back?.error && <Text style={[styles.body, { color: t.price }]}>{back.error}</Text>}
                {back?.status === 'done' && !back.error && back.list.length === 0 && (
                  <Text style={[styles.body, { color: t.muted }]}>No return flights found for this outbound flight.</Text>
                )}
                {back?.list.map((it, i) => (
                  <Option key={`r${i}`} theme={t} it={it} selected={false} onPress={() => choose(p, it)} action="Choose" />
                ))}
              </>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

/** One flight option: times, route, duration, stops, airline, price. */
function Option({ theme: t, it, selected, onPress, action }: { theme: Theme; it: Itinerary; selected: boolean; onPress: () => void; action: string }) {
  const first = it.legs[0];
  const last = it.legs[it.legs.length - 1];
  const shift = arrivalDayShift(it);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.option, { backgroundColor: t.panel, borderColor: selected ? t.accent : t.border }]}
    >
      <View style={styles.flex}>
        <Text style={[styles.times, { color: t.text }]}>
          {clock(first.departs)} → {clock(last.arrives)}{shift > 0 ? ` (+${shift})` : ''}
        </Text>
        <Text style={[styles.small, { color: t.muted }]} numberOfLines={1}>{routeText(it)} · {durationText(it.durationMin)}</Text>
        <Text style={[styles.small, { color: t.muted }]} numberOfLines={2}>{stopsLine(it)}</Text>
        <Text style={[styles.small, { color: t.muted }]} numberOfLines={1}>{airlinesText(it)} · {it.legs.map((l) => l.flightNumber).filter(Boolean).join(', ')}</Text>
      </View>
      <View style={styles.right}>
        <Text style={[styles.price, { color: it.price != null ? t.price : t.muted }]}>{it.price != null ? `$${it.price}` : '—'}</Text>
        <Text style={[styles.action, { color: selected ? t.price : t.text }]}>{action}</Text>
      </View>
    </Pressable>
  );
}

function SmallButton({ theme: t, label, onPress }: { theme: Theme; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.smallButton, { backgroundColor: t.chip, borderColor: t.border }]}>
      <Text style={[styles.action, { color: t.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 48, gap: 8 },
  flex: { flex: 1 },
  heading: { fontFamily: FONTS.heading, fontSize: 24 },
  section: { fontFamily: FONTS.heading, fontSize: 18, marginTop: 14 },
  body: { fontFamily: FONTS.body, fontSize: 14, lineHeight: 20 },
  small: { fontFamily: FONTS.body, fontSize: 12, lineHeight: 17 },
  table: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: TOUCH + 12, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  dateText: { fontFamily: FONTS.bodyBold, fontSize: 15 },
  price: { fontFamily: FONTS.heading, fontSize: 18 },
  block: { gap: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 12, minHeight: TOUCH + 12 },
  times: { fontFamily: FONTS.bodyBold, fontSize: 16 },
  right: { alignItems: 'flex-end', gap: 4 },
  action: { fontFamily: FONTS.bodyMedium, fontSize: 13 },
  smallButton: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 22, paddingHorizontal: 14, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
});
