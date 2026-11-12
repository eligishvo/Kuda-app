// One destination: live flight checks on up to three date pairs, the outbound options for each, the return
// options for an outbound you pick, and a comparison of price, time and stops between the dates.
// "Fly back from" lets the return leave from a different airport than the one you arrive at.
// Each live check and each list of returns is one SerpApi search (free when repeated within the hour).
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Itinerary, Usage } from '../../shared/types';
import { api, Connection } from '../api/client';
import {
  airlinesText, arrivalDayShift, buildTrip, clock, compare, DatePair, datePairs, decodePairs, durationText, findAirports,
  nearest, routeText, stopsLine,
} from '../flights/flights';
import { Airport, airportByCode, airportCodesIn, airportLabel, AIRPORTS } from '../map/mapData';
import { useTrips } from '../planner/TripsContext';
import { selectedAirports } from '../selection/selection';
import { useSelection } from '../selection/useSelection';
import { windowOf } from '../results/results';
import { shortDate, travelersText } from '../search/search';
import { useSearch } from '../search/SearchContext';
import { KEYS, load } from '../storage/store';
import { useTheme } from '../theme/ThemeContext';
import { FONTS, Theme, TOUCH } from '../theme/themes';

type Loaded = { status: 'waiting' | 'loading' | 'done'; list: Itinerary[]; error: string | null; cached: boolean };
const WAITING: Loaded = { status: 'waiting', list: [], error: null, cached: false };
/** Results are kept per fly-back airport and date pair, so switching back and forth doesn't search again. */
const keyOf = (back: string, p: DatePair) => `${back}|${p.out}_${p.ret}`;
/** How many of the selected airports are offered as "fly back from". */
const NEARBY = 6;
/** How many options are listed before "Show all". */
const SHOWN = 5;

export default function DestinationScreen() {
  const t = useTheme();
  const { search } = useSearch();
  const trips = useTrips();
  const params = useLocalSearchParams<{ code?: string; pairs?: string; back?: string }>();
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
  /** The airport to fly home from: the arrival airport unless the user picks another. */
  const firstBack = /^[A-Z]{3}$/.test((params.back ?? '').toUpperCase()) ? (params.back as string).toUpperCase() : code;
  const [back, setBack] = useState(firstBack);
  const [finding, setFinding] = useState(false);
  const [typed, setTyped] = useState('');
  const [selection] = useSelection();
  const [openPair, setOpenPair] = useState<DatePair | undefined>(pairs[0]);
  const open = openPair ? keyOf(back, openPair) : '';
  /** The outbound flight picked for each date pair, and the returns loaded for it. */
  const [picked, setPicked] = useState<Record<string, Itinerary>>({});
  const [returns, setReturns] = useState<Record<string, Loaded>>({});
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const started = useRef(false);
  /** Fly-back airports whose date pairs have been (or are being) checked. */
  const checked = useRef(new Set<string>());

  const check = useCallback(
    async (c: Connection, from: string, p: DatePair) => {
      setOutbound((o) => ({ ...o, [keyOf(from, p)]: { ...WAITING, status: 'loading' } }));
      const r = await api.flights(c, { origin, dest: code, back: from, out: p.out, ret: p.ret, adults: search.adults });
      if (r.usage) setUsage(r.usage);
      setOutbound((o) => ({
        ...o,
        [keyOf(from, p)]: r.ok ? { status: 'done', list: r.data, error: null, cached: r.cached } : { status: 'done', list: [], error: r.error, cached: false },
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
      // Opened from a "home from another airport" result, that combination is checked instead of the round trip
      checked.current.add(firstBack);
      for (const p of pairs) await check(c, firstBack, p);
    })();
  }, [pairs, check, firstBack]);

  // Choosing another airport to fly back from checks the same dates again for that combination
  const flyBackFrom = async (from: string) => {
    setBack(from);
    setFinding(false);
    setTyped('');
    if (!conn?.url || !conn?.token || checked.current.has(from)) return;
    checked.current.add(from);
    for (const p of pairs) await check(conn, from, p);
  };

  // Offered as fly-back airports: the other selected destinations, nearest to the arrival airport first
  const others: Airport[] = airport
    ? nearest(
        airport,
        selectedAirports(selection, airportCodesIn).map(airportByCode).filter((a): a is Airport => a != null && a.cc !== search.departureCc),
        NEARBY,
      )
    : [];
  const backOptions = [...(back !== code && !others.some((a) => a.code === back) ? [airportByCode(back)].filter((a): a is Airport => a != null) : []), ...others];
  const matches = finding ? findAirports(typed, AIRPORTS).filter((a) => a.code !== code && a.cc !== search.departureCc) : [];

  const pickOutbound = async (p: DatePair, it: Itinerary) => {
    const k = keyOf(back, p);
    setPicked((x) => ({ ...x, [k]: it }));
    if (!conn || !it.departureToken) {
      setReturns((x) => ({ ...x, [k]: { status: 'done', list: [], error: 'Google gave no way to list returns for this flight.', cached: false } }));
      return;
    }
    setReturns((x) => ({ ...x, [k]: { ...WAITING, status: 'loading' } }));
    const r = await api.returns(conn, { origin, dest: code, back, out: p.out, ret: p.ret, adults: search.adults, departureToken: it.departureToken });
    if (r.usage) setUsage(r.usage);
    setReturns((x) => ({
      ...x,
      [k]: r.ok ? { status: 'done', list: r.data, error: null, cached: r.cached } : { status: 'done', list: [], error: r.error, cached: false },
    }));
  };

  const choose = async (p: DatePair, inbound: Itinerary) => {
    const out = picked[keyOf(back, p)];
    if (!out) return;
    // Choosing flights starts a trip in the planner and opens it
    const trip = trips.add(buildTrip(origin, code, back, search.adults, out, inbound));
    router.push({ pathname: '/trip', params: { id: trip.id } });
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

      {/* Where the return leaves from */}
      <Text style={[styles.section, { color: t.text }]}>Fly back from</Text>
      <View style={styles.chips}>
        <Chip theme={t} on={back === code} label={`Same airport (${code})`} onPress={() => flyBackFrom(code)} />
        {backOptions.map((a) => (
          <Chip key={a.code} theme={t} on={back === a.code} label={`${a.city || a.name} (${a.code})`} onPress={() => flyBackFrom(a.code)} />
        ))}
        <Chip theme={t} on={finding} label={finding ? 'Close' : 'Other airport…'} onPress={() => setFinding(!finding)} />
      </View>
      {finding && (
        <View style={[styles.finder, { backgroundColor: t.panel, borderColor: t.border }]}>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            placeholder="City, airport name or code"
            placeholderTextColor={t.muted}
            autoCorrect={false}
            autoFocus
            style={[styles.input, { backgroundColor: t.chip, borderColor: t.border, color: t.text }]}
          />
          {matches.map((a) => (
            <Pressable key={a.code} onPress={() => flyBackFrom(a.code)} accessibilityRole="button" style={[styles.match, { borderColor: t.border }]}>
              <Text style={[styles.dateText, { color: t.text }]} numberOfLines={1}>{a.city || a.name} ({a.code})</Text>
              <Text style={[styles.small, { color: t.muted }]} numberOfLines={1}>{a.name}</Text>
            </Pressable>
          ))}
          {typed.trim().length >= 2 && matches.length === 0 && <Text style={[styles.small, { color: t.muted }]}>No airport matches.</Text>}
        </View>
      )}
      <Text style={[styles.small, { color: t.muted }]}>
        {back === code
          ? 'Pick another airport to arrive here and fly home from there. That checks the dates again (about 3 searches).'
          : `Arriving at ${airportLabel(code)}, flying home from ${airportLabel(back)}. Getting between them is up to you.`}
      </Text>

      {/* Comparison between the dates: tap one to see its flights */}
      <Text style={[styles.section, { color: t.text }]}>Dates compared</Text>
      <View style={[styles.table, { borderColor: t.border, backgroundColor: t.panel }]}>
        {pairs.map((p) => {
          const k = keyOf(back, p);
          const o = outbound[k] ?? WAITING;
          const c = compare(o.list);
          const on = k === open;
          return (
            <Pressable
              key={k}
              onPress={() => setOpenPair(p)}
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
      <Text style={[styles.small, { color: t.price }]}>
        Source: Google Flights, checked live{pairs.some((p) => outbound[keyOf(back, p)]?.cached) ? ' (some within the last hour)' : ' just now'}.
      </Text>
      <Text style={[styles.small, { color: t.muted }]}>
        Each price is the lowest Google lists for that flight, from the airline or a travel agency. After you choose
        flights, the trip's Flights tab can show who sells them.
      </Text>
      <Text style={[styles.small, { color: t.muted }]}>
        Prices are for the whole trip there and back, as Google shows them for {travelersText(search.adults)}.
        {search.adults > 1 ? ' Whether that is per person or for everyone has not been confirmed yet.' : ''}
      </Text>

      {pairs.filter((p) => keyOf(back, p) === open).map((p) => {
        const k = keyOf(back, p);
        const o = outbound[k] ?? WAITING;
        const mine = picked[k];
        const loaded = returns[k];
        const list = showAll[k] ? o.list : o.list.slice(0, SHOWN);
        return (
          <View key={k} style={styles.block}>
            <Text style={[styles.section, { color: t.text }]}>Outbound · {shortDate(p.out)}</Text>
            {o.status !== 'done' && <Text style={[styles.body, { color: t.muted }]}>Checking live prices…</Text>}
            {o.status === 'done' && o.error && conn && (
              <SmallButton theme={t} label="Try again" onPress={() => check(conn, back, p)} />
            )}
            {list.map((it, i) => (
              <Option key={`o${i}`} theme={t} it={it} selected={mine === it} onPress={() => pickOutbound(p, it)} action={mine === it ? 'Selected' : 'See returns'} />
            ))}
            {o.list.length > SHOWN && !showAll[k] && (
              <SmallButton theme={t} label={`Show all ${o.list.length}`} onPress={() => setShowAll((x) => ({ ...x, [k]: true }))} />
            )}

            {mine && (
              <>
                <Text style={[styles.section, { color: t.text }]}>
                  Return · {shortDate(p.ret)}{back !== code ? ` · from ${airportLabel(back)}` : ''}
                </Text>
                {(!loaded || loaded.status !== 'done') && <Text style={[styles.body, { color: t.muted }]}>Loading returns for the selected flight…</Text>}
                {loaded?.error && <Text style={[styles.body, { color: t.price }]}>{loaded.error}</Text>}
                {loaded?.status === 'done' && !loaded.error && loaded.list.length === 0 && (
                  <Text style={[styles.body, { color: t.muted }]}>No return flights found for this outbound flight.</Text>
                )}
                {loaded?.list.map((it, i) => (
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

function Chip({ theme: t, on, label, onPress }: { theme: Theme; on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[styles.chip, { backgroundColor: on ? t.accent : t.chip, borderColor: on ? t.accent : t.border }]}
    >
      <Text style={[styles.action, { color: on ? t.buttonText : t.text }]} numberOfLines={1}>{label}</Text>
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 22, paddingHorizontal: 14, height: TOUCH, alignItems: 'center', justifyContent: 'center', maxWidth: '100%' },
  finder: { borderWidth: 1, borderRadius: 14, padding: 10, gap: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, minHeight: TOUCH + 4, fontFamily: FONTS.body, fontSize: 15 },
  match: { minHeight: TOUCH + 4, justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  smallButton: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 22, paddingHorizontal: 14, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
});
