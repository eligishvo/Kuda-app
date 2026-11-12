// Planner (placeholder): shows the flights that were chosen, where their price comes from, and on request
// who sells them. The real trip planner comes later and will start from the same saved TripSelection.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Itinerary, Seller, TripSelection } from '../../shared/types';
import { api, Connection } from '../api/client';
import { airlinesText, clock, durationText, routeText, sanitizeTrip, stopsLine } from '../flights/flights';
import { airportLabel } from '../map/mapData';
import { shortDate, travelersText } from '../search/search';
import { KEYS, load } from '../storage/store';
import { useTheme } from '../theme/ThemeContext';
import { FONTS, Theme, TOUCH } from '../theme/themes';

type Sellers = { status: 'idle' | 'loading' | 'done'; list: Seller[]; error: string | null };

export default function Planner() {
  const t = useTheme();
  const [trip, setTrip] = useState<TripSelection | null | undefined>(undefined);
  const [sellers, setSellers] = useState<Sellers>({ status: 'idle', list: [], error: null });
  // Read the saved trip every time the screen is shown, so a new choice replaces the old one
  useFocusEffect(
    useCallback(() => {
      load<unknown>(KEYS.trip, null).then((raw) => {
        setTrip(sanitizeTrip(raw));
        setSellers({ status: 'idle', list: [], error: null });
      });
    }, []),
  );

  const findSellers = async () => {
    if (!trip?.inbound.bookingToken) return;
    setSellers({ status: 'loading', list: [], error: null });
    const conn = await load<Connection | null>(KEYS.connection, null);
    if (!conn?.url || !conn?.token) {
      setSellers({ status: 'done', list: [], error: 'Flight data isn’t set up: Settings → Flight data (debug).' });
      return;
    }
    const r = await api.sellers(conn, {
      origin: trip.origin,
      dest: trip.destination,
      back: trip.returnFrom,
      out: trip.outbound.legs[0].departs.slice(0, 10),
      ret: trip.inbound.legs[0].departs.slice(0, 10),
      adults: trip.adults,
      bookingToken: trip.inbound.bookingToken,
    });
    setSellers(r.ok ? { status: 'done', list: r.data, error: null } : { status: 'done', list: [], error: r.error });
  };

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.page}>
      {trip === null && (
        <Text style={[styles.body, { color: t.muted }]}>
          No flights chosen yet. Search on the map, open a destination and choose an outbound and a return flight.
        </Text>
      )}
      {trip && (
        <>
          <Text style={[styles.heading, { color: t.text }]}>
            {trip.returnFrom === trip.destination
              ? `${airportLabel(trip.origin)} ⇄ ${airportLabel(trip.destination)}`
              : `${airportLabel(trip.origin)} → ${airportLabel(trip.destination)}, back from ${airportLabel(trip.returnFrom)}`}
          </Text>
          <Text style={[styles.body, { color: t.muted }]}>
            {travelersText(trip.adults)} · there and back{' '}
            <Text style={{ color: t.price, fontFamily: FONTS.bodyBold }}>{trip.price != null ? `$${trip.price}` : 'price not shown'}</Text>
          </Text>
          <Flight theme={t} label="Outbound" it={trip.outbound} />
          <Flight theme={t} label="Return" it={trip.inbound} />

          {/* Where the price comes from, and who sells it */}
          <View style={[styles.card, { backgroundColor: t.panel, borderColor: t.border }]}>
            <Text style={[styles.cardTitle, { color: t.text }]}>Where this price comes from</Text>
            <Text style={[styles.body, { color: t.muted }]}>
              Google Flights, checked live when you chose these flights. It is the lowest price Google listed, from the
              airline or a travel agency.
            </Text>
            {sellers.status === 'idle' && trip.inbound.bookingToken && (
              <Pressable onPress={findSellers} accessibilityRole="button" style={[styles.button, { backgroundColor: t.accent }]}>
                <Text style={[styles.buttonText, { color: t.buttonText }]}>See who sells it (1 search)</Text>
              </Pressable>
            )}
            {sellers.status === 'idle' && !trip.inbound.bookingToken && (
              <Text style={[styles.small, { color: t.muted }]}>Google gave no seller list for this choice.</Text>
            )}
            {sellers.status === 'loading' && <Text style={[styles.body, { color: t.muted }]}>Asking Google who sells it…</Text>}
            {sellers.error && <Text style={[styles.body, { color: t.price }]}>{sellers.error}</Text>}
            {sellers.status === 'done' && !sellers.error && sellers.list.length === 0 && (
              <Text style={[styles.body, { color: t.muted }]}>Google listed no sellers for these flights.</Text>
            )}
            {sellers.list.map((s, i) => (
              <View key={`${s.name}${i}`} style={[styles.seller, { borderColor: t.border }]}>
                <View style={styles.flex}>
                  <Text style={[styles.sellerName, { color: t.text }]} numberOfLines={1}>{s.name}</Text>
                  <Text style={[styles.small, { color: s.airline ? t.muted : t.price }]}>
                    {[s.airline ? 'Airline, direct' : 'Third party (travel agency)', s.separate ? 'two separate tickets' : '', s.fare].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Text style={[styles.sellerPrice, { color: s.price != null ? t.price : t.muted }]}>{s.price != null ? `$${s.price}` : 'no price'}</Text>
              </View>
            ))}
            {sellers.list.length > 0 && (
              <Text style={[styles.small, { color: t.muted }]}>
                Only sellers that work with Google appear here. Others, such as local agencies, are not included.
              </Text>
            )}
          </View>

          <View style={[styles.card, { backgroundColor: t.panel, borderColor: t.border }]}>
            <Text style={[styles.cardTitle, { color: t.text }]}>Trip planner</Text>
            <Text style={[styles.body, { color: t.muted }]}>
              Coming later. These flights are saved on this phone and will be where the plan starts.
            </Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Flight({ theme: t, label, it }: { theme: Theme; label: string; it: Itinerary }) {
  const first = it.legs[0];
  return (
    <View style={[styles.card, { backgroundColor: t.panel, borderColor: t.border }]}>
      <Text style={[styles.cardTitle, { color: t.text }]}>
        {label} · {shortDate(first.departs.slice(0, 10))}
      </Text>
      <Text style={[styles.body, { color: t.muted }]}>{routeText(it)} · {durationText(it.durationMin)} · {stopsLine(it)}</Text>
      {it.legs.map((l, i) => (
        <View key={i} style={[styles.leg, { borderColor: t.border }]}>
          <Text style={[styles.legTimes, { color: t.text }]}>
            {clock(l.departs)} {l.from} → {clock(l.arrives)} {l.to}
          </Text>
          <Text style={[styles.small, { color: t.muted }]}>
            {[l.airline, l.flightNumber, durationText(l.durationMin)].filter(Boolean).join(' · ')}
          </Text>
        </View>
      ))}
      {it.legs.length > 1 && <Text style={[styles.small, { color: t.muted }]}>{airlinesText(it)}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 48, gap: 10 },
  flex: { flex: 1 },
  heading: { fontFamily: FONTS.heading, fontSize: 22 },
  body: { fontFamily: FONTS.body, fontSize: 14, lineHeight: 20 },
  small: { fontFamily: FONTS.body, fontSize: 12, lineHeight: 17 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 },
  cardTitle: { fontFamily: FONTS.bodyBold, fontSize: 16 },
  leg: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  legTimes: { fontFamily: FONTS.bodyMedium, fontSize: 15 },
  button: { borderRadius: 24, minHeight: TOUCH + 4, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonText: { fontFamily: FONTS.bodyBold, fontSize: 15 },
  seller: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, minHeight: TOUCH },
  sellerName: { fontFamily: FONTS.bodyBold, fontSize: 15 },
  sellerPrice: { fontFamily: FONTS.heading, fontSize: 17 },
});
