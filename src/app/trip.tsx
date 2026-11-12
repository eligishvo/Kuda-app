// One trip: tabs for the day-by-day plan, where to stay, the budget, the checklist and notes, and the flights.
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Itinerary, Seller } from '../../shared/types';
import { api, Connection } from '../api/client';
import { airlinesText, clock, durationText, routeText, stopsLine } from '../flights/flights';
import { airportLabel } from '../map/mapData';
import { Btn, Card, Field, text } from '../planner/parts';
import { BudgetTab, ChecklistTab, PlanTab, StayTab } from '../planner/tabs';
import { budgetOf, nightsWithoutStay, Trip } from '../planner/trip';
import { useTrips } from '../planner/TripsContext';
import { shortDate, travelersText } from '../search/search';
import { KEYS, load } from '../storage/store';
import { useTheme } from '../theme/ThemeContext';
import { FONTS, Theme, TOUCH } from '../theme/themes';

const TABS = ['Plan', 'Stay', 'Budget', 'List', 'Flights'] as const;
type Tab = (typeof TABS)[number];

export default function TripScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { trips, ready, update } = useTrips();
  const trip = trips.find((x) => x.id === id);
  const [tab, setTab] = useState<Tab>('Plan');
  const [renaming, setRenaming] = useState(false);

  if (!trip) {
    return (
      <View style={[styles.page, { flex: 1, backgroundColor: t.background }]}>
        <Text style={[text.body, { color: t.muted }]}>{ready ? 'This trip no longer exists.' : 'Loading…'}</Text>
      </View>
    );
  }
  const change = (fn: (prev: Trip) => Trip) => update(trip.id, fn);
  const missing = nightsWithoutStay(trip).length;
  const badge: Partial<Record<Tab, string>> = {
    Stay: missing > 0 ? String(missing) : '',
    List: String(trip.checklist.filter((c) => !c.done).length || ''),
  };

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: trip.name }} />
      {renaming ? (
        <View style={styles.row}>
          <Field theme={t} value={trip.name} onChangeText={(name) => change((p) => ({ ...p, name }))} style={styles.flex} autoFocus />
          <Btn theme={t} kind="main" label="Done" onPress={() => setRenaming(false)} />
        </View>
      ) : (
        <Pressable onPress={() => setRenaming(true)} accessibilityRole="button" accessibilityLabel="Rename trip">
          <Text style={[styles.name, { color: t.text }]}>{trip.name}</Text>
          <Text style={[text.small, { color: t.muted }]}>
            {travelersText(trip.flights.adults)} · total <Text style={{ color: t.price }}>${budgetOf(trip).total}</Text> · tap the name to rename
          </Text>
        </Pressable>
      )}

      <View style={styles.tabs}>
        {TABS.map((name) => {
          const on = name === tab;
          return (
            <Pressable
              key={name}
              onPress={() => setTab(name)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={[styles.tabButton, { backgroundColor: on ? t.accent : t.chip, borderColor: on ? t.accent : t.border }]}
            >
              <Text style={[styles.tabText, { color: on ? t.buttonText : t.text }]}>
                {name}{badge[name] ? ` ${badge[name]}` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === 'Plan' && <PlanTab theme={t} trip={trip} change={change} />}
      {tab === 'Stay' && <StayTab theme={t} trip={trip} change={change} />}
      {tab === 'Budget' && <BudgetTab theme={t} trip={trip} change={change} />}
      {tab === 'List' && <ChecklistTab theme={t} trip={trip} change={change} />}
      {tab === 'Flights' && <FlightsTab theme={t} trip={trip} />}
    </ScrollView>
  );
}

/** The chosen flights, where their price comes from and, on request, who sells them. */
function FlightsTab({ theme: t, trip }: { theme: Theme; trip: Trip }) {
  const f = trip.flights;
  const [sellers, setSellers] = useState<{ status: 'idle' | 'loading' | 'done'; list: Seller[]; error: string | null }>({ status: 'idle', list: [], error: null });

  const findSellers = async () => {
    if (!f.inbound.bookingToken) return;
    setSellers({ status: 'loading', list: [], error: null });
    const conn = await load<Connection | null>(KEYS.connection, null);
    if (!conn?.url || !conn?.token) {
      setSellers({ status: 'done', list: [], error: 'Flight data isn’t set up: Settings → Flight data (debug).' });
      return;
    }
    const r = await api.sellers(conn, {
      origin: f.origin, dest: f.destination, back: f.returnFrom,
      out: f.outbound.legs[0].departs.slice(0, 10), ret: f.inbound.legs[0].departs.slice(0, 10),
      adults: f.adults, bookingToken: f.inbound.bookingToken,
    });
    setSellers(r.ok ? { status: 'done', list: r.data, error: null } : { status: 'done', list: [], error: r.error });
  };

  return (
    <View style={styles.gap}>
      <Text style={[text.body, { color: t.muted }]}>
        {f.returnFrom === f.destination
          ? `${airportLabel(f.origin)} ⇄ ${airportLabel(f.destination)}`
          : `${airportLabel(f.origin)} → ${airportLabel(f.destination)}, back from ${airportLabel(f.returnFrom)}`}
        {' · '}
        <Text style={{ color: t.price, fontFamily: FONTS.bodyBold }}>{f.price != null ? `$${f.price}` : 'price not shown'}</Text>
      </Text>
      <Flight theme={t} label="Outbound" it={f.outbound} />
      <Flight theme={t} label="Return" it={f.inbound} />
      <Card theme={t}>
        <Text style={[text.title, { color: t.text }]}>Where this price comes from</Text>
        <Text style={[text.body, { color: t.muted }]}>
          Google Flights, checked live when you chose these flights. It is the lowest price Google listed, from the airline
          or a travel agency. Prices change: check again before you book.
        </Text>
        {sellers.status === 'idle' && f.inbound.bookingToken && <Btn theme={t} kind="main" label="See who sells it (1 search)" onPress={findSellers} />}
        {sellers.status === 'idle' && !f.inbound.bookingToken && <Text style={[text.small, { color: t.muted }]}>Google gave no seller list for this choice.</Text>}
        {sellers.status === 'loading' && <Text style={[text.body, { color: t.muted }]}>Asking Google who sells it…</Text>}
        {sellers.error && <Text style={[text.body, { color: t.price }]}>{sellers.error}</Text>}
        {sellers.status === 'done' && !sellers.error && sellers.list.length === 0 && <Text style={[text.body, { color: t.muted }]}>Google listed no sellers for these flights.</Text>}
        {sellers.list.map((s, i) => (
          <View key={`${s.name}${i}`} style={[styles.seller, { borderColor: t.border }]}>
            <View style={styles.flex}>
              <Text style={[text.title, { color: t.text }]} numberOfLines={1}>{s.name}</Text>
              <Text style={[text.small, { color: s.airline ? t.muted : t.price }]}>
                {[s.airline ? 'Airline, direct' : 'Third party (travel agency)', s.separate ? 'two separate tickets' : '', s.fare].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Text style={[text.price, { color: s.price != null ? t.price : t.muted }]}>{s.price != null ? `$${s.price}` : 'no price'}</Text>
          </View>
        ))}
        {sellers.list.length > 0 && <Text style={[text.small, { color: t.muted }]}>Only sellers that work with Google appear here.</Text>}
      </Card>
    </View>
  );
}

function Flight({ theme: t, label, it }: { theme: Theme; label: string; it: Itinerary }) {
  return (
    <Card theme={t}>
      <Text style={[text.title, { color: t.text }]}>{label} · {shortDate(it.legs[0].departs.slice(0, 10))}</Text>
      <Text style={[text.body, { color: t.muted }]}>{routeText(it)} · {durationText(it.durationMin)} · {stopsLine(it)}</Text>
      {it.legs.map((l, i) => (
        <View key={i} style={[styles.leg, { borderColor: t.border }]}>
          <Text style={[styles.legTimes, { color: t.text }]}>{clock(l.departs)} {l.from} → {clock(l.arrives)} {l.to}</Text>
          <Text style={[text.small, { color: t.muted }]}>{[l.airline, l.flightNumber, durationText(l.durationMin)].filter(Boolean).join(' · ')}</Text>
        </View>
      ))}
      {it.legs.length > 1 && <Text style={[text.small, { color: t.muted }]}>{airlinesText(it)}</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 64, gap: 12 },
  gap: { gap: 10 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontFamily: FONTS.heading, fontSize: 22 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tabButton: { borderWidth: 1, borderRadius: 22, paddingHorizontal: 14, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontFamily: FONTS.bodyMedium, fontSize: 14 },
  leg: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  legTimes: { fontFamily: FONTS.bodyMedium, fontSize: 15 },
  seller: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, minHeight: TOUCH },
});
