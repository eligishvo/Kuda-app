// One destination: its date pairs with the price-list estimates, live flight checks for the dates you
// choose, the outbound options for each, and the return options for an outbound you pick.
// "Fly back from" lets the return leave from a different airport than the one you arrive at.
// Opening this screen never spends a search. Every live lookup is a button that says what it may cost:
// checking a date pair is up to one SerpApi search, and so is each list of returns. Answers are remembered
// (src/flights/live.ts), so reopening something already loaded is free.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Itinerary } from '../../shared/types';
import { Connection, FlightQuery } from '../api/client';
import {
  airlinesText, arrivalDayShift, buildTrip, clock, compare, DatePair, datePairs, decodePairs, durationText, findAirports,
  nearest, returnsRange, returnsText, routeText, stopsLine,
} from '../flights/flights';
import { allowanceText, costText, flightQuery, live, pairsToCheck, searchesLeft } from '../flights/live';
import { useAllowance } from '../flights/useAllowance';
import { Airport, airportByCode, airportCodesIn, airportLabel, AIRPORTS } from '../map/mapData';
import { useTrips } from '../planner/TripsContext';
import { estimateFor, originOf, windowOf } from '../results/results';
import { useResults } from '../results/useResults';
import { shortDate, travelersText } from '../search/search';
import { useSearch } from '../search/SearchContext';
import { selectedAirports } from '../selection/selection';
import { useSelection } from '../selection/useSelection';
import { KEYS, load } from '../storage/store';
import { useTheme } from '../theme/ThemeContext';
import { FONTS, Theme, TOUCH } from '../theme/themes';

type Loaded = { status: 'waiting' | 'loading' | 'done'; list: Itinerary[]; error: string | null; cached: boolean };
const WAITING: Loaded = { status: 'waiting', list: [], error: null, cached: false };
/** Results are kept per fly-back airport and date pair, so switching back and forth doesn't search again. */
const keyOf = (back: string, p: DatePair) => `${back}|${p.out}_${p.ret}`;
/** A date pair on its own (which pairs you chose to check doesn't depend on the fly-back airport). */
const pairName = (p: DatePair) => `${p.out}_${p.ret}`;
/** How many of the selected airports are offered as "fly back from". */
const NEARBY = 6;
/** How many options are listed before "Show all". */
const SHOWN = 5;
/** Returns are kept per outbound flight (named by its token), so each can show how many it has. */
const returnsKey = (k: string, it: Itinerary) => `${k}#${it.departureToken ?? 'none'}`;

export default function DestinationScreen() {
  const t = useTheme();
  const { search } = useSearch();
  const found = useResults();
  const trips = useTrips();
  const usage = useAllowance();
  const left = searchesLeft(usage);
  const params = useLocalSearchParams<{ code?: string; pairs?: string; back?: string }>();
  const code = (params.code ?? '').toUpperCase();
  const airport = airportByCode(code);
  const origin = search.departureAirport;
  // The dates come from the map or the results list; opened without them, spread three across the window
  const [pairs] = useState<DatePair[]>(() => {
    const given = decodePairs(params.pairs);
    return given.length > 0 ? given : datePairs(windowOf(search), []);
  });

  const [conn, setConn] = useState<Connection | null>(null);
  const [outbound, setOutbound] = useState<Record<string, Loaded>>({});
  /** The airport to fly home from: the arrival airport unless the user picks another. */
  const firstBack = /^[A-Z]{3}$/.test((params.back ?? '').toUpperCase()) ? (params.back as string).toUpperCase() : code;
  const [back, setBack] = useState(firstBack);
  const [finding, setFinding] = useState(false);
  const [typed, setTyped] = useState('');
  const [selection] = useSelection();
  const [openPair, setOpenPair] = useState<DatePair | undefined>(pairs[0]);
  const open = openPair ? keyOf(back, openPair) : '';
  /** The date pairs ticked for checking: the first (best) one to start with. */
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(pairs[0] ? [pairName(pairs[0])] : []));
  /** The outbound flight picked for each date pair, and the returns loaded for each outbound flight. */
  const [picked, setPicked] = useState<Record<string, Itinerary>>({});
  const [returns, setReturns] = useState<Record<string, Loaded>>({});
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});

  const queryOf = (from: string, p: DatePair): FlightQuery => flightQuery(search, code, from, p);

  // On opening: only the saved connection is read (the allowance is read by useAllowance, also free)
  useEffect(() => {
    load<Connection | null>(KEYS.connection, null).then((c) => setConn(c?.url && c?.token ? c : { url: '', token: '' }));
  }, []);
  const ready = conn != null && !!conn.url && !!conn.token;

  /** A date pair's outbound flights: what this screen loaded, or what was checked earlier (free). */
  const outboundOf = (from: string, p: DatePair): Loaded => {
    const mine = outbound[keyOf(from, p)];
    if (mine) return mine;
    const seen = live.peekFlights(queryOf(from, p));
    return seen ? { status: 'done', list: seen, error: null, cached: true } : WAITING;
  };
  /** The returns of one outbound flight, the same way. */
  const returnsOf = (from: string, p: DatePair, it: Itinerary): Loaded | undefined => {
    const mine = returns[returnsKey(keyOf(from, p), it)];
    if (mine) return mine;
    const seen = it.departureToken ? live.peekReturns(queryOf(from, p), it.departureToken) : undefined;
    return seen ? { status: 'done', list: seen, error: null, cached: true } : undefined;
  };
  const isLoaded = (p: DatePair) => outboundOf(back, p).status === 'done' && !outboundOf(back, p).error;

  /** Checks the ticked date pairs live, one after the other: up to one search each. */
  const checkChosen = () => checkPairs(pairsToCheck(pairs.filter((p) => chosen.has(pairName(p))), isLoaded));
  const checkPairs = async (todo: DatePair[]) => {
    if (!ready || busy) return;
    setBusy(true);
    if (todo[0]) setOpenPair(todo[0]);
    for (const p of todo) {
      const k = keyOf(back, p);
      setOutbound((o) => ({ ...o, [k]: { ...WAITING, status: 'loading' } }));
      const r = await live.checkFlights(conn as Connection, queryOf(back, p));
      setOutbound((o) => ({
        ...o,
        [k]: r.ok ? { status: 'done', list: r.data, error: null, cached: r.cached } : { status: 'done', list: [], error: r.error, cached: false },
      }));
    }
    setBusy(false);
  };

  /** Loads the returns of the given outbound flights: up to one search each, none for ones already loaded. */
  const loadReturns = async (p: DatePair, list: Itinerary[]) => {
    if (!ready || busy) return;
    setBusy(true);
    for (const it of list) {
      const key = returnsKey(keyOf(back, p), it);
      if (!it.departureToken) {
        setReturns((x) => ({ ...x, [key]: { status: 'done', list: [], error: 'Google gave no way to list returns for this flight.', cached: false } }));
        continue;
      }
      setReturns((x) => ({ ...x, [key]: { ...WAITING, status: 'loading' } }));
      const r = await live.loadReturns(conn as Connection, queryOf(back, p), it.departureToken);
      setReturns((x) => ({
        ...x,
        [key]: r.ok ? { status: 'done', list: r.data, error: null, cached: r.cached } : { status: 'done', list: [], error: r.error, cached: false },
      }));
    }
    setBusy(false);
  };

  // Another airport to fly back from only changes what is shown: nothing is searched until you tap Check
  const flyBackFrom = (from: string) => {
    setBack(from);
    setFinding(false);
    setTyped('');
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

  /** How many return flights each counted outbound flight of a date pair has. */
  const countsFor = (p: DatePair, list: Itinerary[]) =>
    list.map((it) => returnsOf(back, p, it)).filter((r): r is Loaded => r?.status === 'done' && !r.error).map((r) => r.list.length);

  const choose = (p: DatePair, inbound: Itinerary) => {
    const out = picked[keyOf(back, p)];
    if (!out) return;
    // Choosing flights starts a trip in the planner and opens it
    const trip = trips.add(buildTrip(origin, code, back, search.adults, out, inbound));
    router.push({ pathname: '/trip', params: { id: trip.id } });
  };

  const toCheck = pairsToCheck(pairs.filter((p) => chosen.has(pairName(p))), isLoaded);
  const noneLeft = left === 0;
  const tooFew = left != null && left < toCheck.length;
  const title = airport ? `${airport.city || airport.name} (${code})` : code;
  const notSetUp = conn != null && !ready;
  const anyLive = pairs.some((p) => isLoaded(p));
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
        <Text style={[styles.small, { color: noneLeft ? t.price : t.muted }]}>
          {allowanceText(usage)}{noneLeft ? ' · the daily limit resets at midnight UTC' : ''}
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
          ? 'Pick another airport to arrive here and fly home from there. Nothing is searched until you tap Check.'
          : `Arriving at ${airportLabel(code)}, flying home from ${airportLabel(back)}. Getting between them is up to you.`}
      </Text>

      {/* The dates: estimates first (free), live prices once checked. Tick the ones to check. */}
      <Text style={[styles.section, { color: t.text }]}>Dates</Text>
      <View style={[styles.table, { borderColor: t.border, backgroundColor: t.panel }]}>
        {pairs.map((p) => {
          const k = keyOf(back, p);
          const o = outboundOf(back, p);
          const c = compare(o.list);
          const loaded = o.status === 'done' && !o.error;
          const ticked = chosen.has(pairName(p));
          const on = k === open && o.status !== 'waiting';
          const est = estimateFor(found.options, code, back, p);
          const press = () => {
            if (o.status !== 'waiting') setOpenPair(p);
            else setChosen((x) => {
              const next = new Set(x);
              if (next.has(pairName(p))) next.delete(pairName(p));
              else next.add(pairName(p));
              return next;
            });
          };
          return (
            <Pressable
              key={k}
              onPress={press}
              accessibilityRole={o.status === 'waiting' ? 'checkbox' : 'button'}
              accessibilityState={o.status === 'waiting' ? { checked: ticked } : { selected: on }}
              style={[styles.dateRow, { borderColor: t.border, backgroundColor: on ? t.chip : 'transparent' }]}
            >
              {o.status === 'waiting' && (
                <View style={[styles.box, { borderColor: ticked ? t.accent : t.border, backgroundColor: ticked ? t.accent : 'transparent' }]}>
                  {ticked && <Text style={[styles.tick, { color: t.buttonText }]}>✓</Text>}
                </View>
              )}
              <View style={styles.flex}>
                <Text style={[styles.dateText, { color: t.text }]}>{shortDate(p.out)} – {shortDate(p.ret)}</Text>
                {est && (
                  <Text style={[styles.small, { color: t.muted }]} numberOfLines={1}>
                    {originOf(est.kind, !!est.split).status}: ${est.estimate.price} each ({originOf(est.kind, !!est.split).source})
                  </Text>
                )}
                <Text style={[styles.small, { color: o.error ? t.price : t.muted }]} numberOfLines={2}>
                  {o.status === 'waiting' ? (ticked ? 'Will be checked live' : 'Not checked live · tap to choose')
                    : o.status === 'loading' ? 'Checking live prices…'
                    : o.error ? o.error
                    : c.count === 0 ? 'No flights found'
                    : `${c.count} outbound ${c.count === 1 ? 'flight' : 'flights'} · fastest ${durationText(c.fastestMin ?? 0)} · ${c.fewestStops === 0 ? 'nonstop available' : `${c.fewestStops}+ stops`}`}
                </Text>
                {loaded && c.count > 0 && (
                  <Text style={[styles.small, { color: t.price }]} numberOfLines={1}>
                    {(() => {
                      const counts = countsFor(p, o.list);
                      if (counts.length === 0) return 'Returns not loaded yet';
                      return `${returnsRange(counts)}${counts.length === 1 ? ' with one outbound flight' : ` (${counts.length} outbound flights counted)`}`;
                    })()}
                  </Text>
                )}
              </View>
              <Text style={[styles.price, { color: c.cheapest != null ? t.price : t.muted }]}>{c.cheapest != null ? `$${c.cheapest}` : '—'}</Text>
            </Pressable>
          );
        })}
      </View>
      {toCheck.length > 0 && (
        <Pressable
          onPress={checkChosen}
          disabled={!ready || busy || noneLeft}
          accessibilityRole="button"
          style={[styles.go, { backgroundColor: t.accent, opacity: !ready || busy || noneLeft ? 0.5 : 1 }]}
        >
          <Text style={[styles.goText, { color: t.buttonText }]}>
            {busy ? 'Checking…' : `Check ${toCheck.length === 1 ? 'these dates' : `${toCheck.length} date pairs`} · ${costText(toCheck.length)}`}
          </Text>
        </Pressable>
      )}
      {toCheck.length === 0 && pairs.some((p) => !isLoaded(p)) && (
        <Text style={[styles.small, { color: t.muted }]}>Tick the dates you want checked live; each is up to one search.</Text>
      )}
      {tooFew && !noneLeft && (
        <Text style={[styles.small, { color: t.price }]}>Only {left} left today: the dates after that will fail until the limit resets.</Text>
      )}
      {anyLive && (
        <Text style={[styles.small, { color: t.price }]}>
          Source: Google Flights, checked live{pairs.some((p) => outboundOf(back, p).cached) ? ' (some earlier, within the last hour)' : ' just now'}.
        </Text>
      )}
      <Text style={[styles.small, { color: t.muted }]}>
        Each live price is the lowest Google lists for that flight, from the airline or a travel agency. After you
        choose flights, the trip's Flights tab can show who sells them.
      </Text>
      <Text style={[styles.small, { color: t.muted }]}>
        Live prices are for the whole trip there and back, as Google shows them for {travelersText(search.adults)}.
        {search.adults > 1 ? ' Whether that is per person or for everyone has not been confirmed yet.' : ''}
      </Text>

      {pairs.filter((p) => keyOf(back, p) === open).map((p) => {
        const k = keyOf(back, p);
        const o = outboundOf(back, p);
        if (o.status === 'waiting') return null;
        const mine = picked[k];
        const loaded = mine ? returnsOf(back, p, mine) : undefined;
        const list = showAll[k] ? o.list : o.list.slice(0, SHOWN);
        const uncounted = list.filter((it) => it.departureToken && !returnsOf(back, p, it));
        return (
          <View key={k} style={styles.block}>
            <Text style={[styles.section, { color: t.text }]}>Outbound · {shortDate(p.out)}</Text>
            {o.status !== 'done' && <Text style={[styles.body, { color: t.muted }]}>Checking live prices…</Text>}
            {o.status === 'done' && o.error && ready && (
              <SmallButton theme={t} label={`Try again · ${costText(1)}`} onPress={() => checkPairs([p])} />
            )}
            {list.length > 0 && <Text style={[styles.small, { color: t.muted }]}>Tap a flight to pick it (free).</Text>}
            {list.map((it, i) => {
              const r = returnsOf(back, p, it);
              // How many return flights go with this outbound flight, once loaded
              const extra = !r ? 'Returns not loaded' : r.status !== 'done' ? 'Loading return flights…' : r.error ? 'Could not load returns' : returnsText(r.list.length);
              return (
                <Option key={`o${i}`} theme={t} it={it} selected={mine === it} onPress={() => setPicked((x) => ({ ...x, [k]: it }))} action={mine === it ? 'Selected' : 'Pick'} extra={extra} strong={r?.status === 'done' && !r.error} />
              );
            })}
            {uncounted.length > 1 && (
              <SmallButton
                theme={t}
                label={`Count returns for ${uncounted.length} flights · ${costText(uncounted.length)}`}
                onPress={() => loadReturns(p, uncounted)}
              />
            )}
            {o.list.length > SHOWN && !showAll[k] && (
              <SmallButton theme={t} label={`Show all ${o.list.length}`} onPress={() => setShowAll((x) => ({ ...x, [k]: true }))} />
            )}

            {mine && (
              <>
                <Text style={[styles.section, { color: t.text }]}>
                  Return · {shortDate(p.ret)}{back !== code ? ` · from ${airportLabel(back)}` : ''}
                </Text>
                {!loaded && (
                  <SmallButton theme={t} label={`See returns for this flight · ${costText(1)}`} onPress={() => loadReturns(p, [mine])} />
                )}
                {loaded?.status === 'loading' && <Text style={[styles.body, { color: t.muted }]}>Loading returns for the selected flight…</Text>}
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
function Option({ theme: t, it, selected, onPress, action, extra, strong }: { theme: Theme; it: Itinerary; selected: boolean; onPress: () => void; action: string; extra?: string; strong?: boolean }) {
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
        {extra ? <Text style={[styles.small, { color: strong ? t.price : t.muted }]} numberOfLines={1}>{extra}</Text> : null}
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
  box: { width: 24, height: 24, borderWidth: 2, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  tick: { fontFamily: FONTS.bodyBold, fontSize: 14 },
  go: { borderRadius: 22, minHeight: TOUCH + 4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  goText: { fontFamily: FONTS.bodyBold, fontSize: 15 },
  smallButton: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 22, paddingHorizontal: 14, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
});
