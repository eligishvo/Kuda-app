// Planner (placeholder): shows the flights that were chosen. The real trip planner comes later and will
// start from the same saved TripSelection.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Itinerary, TripSelection } from '../../shared/types';
import { airlinesText, clock, durationText, routeText, sanitizeTrip, stopsLine } from '../flights/flights';
import { airportLabel } from '../map/mapData';
import { shortDate, travelersText } from '../search/search';
import { KEYS, load } from '../storage/store';
import { useTheme } from '../theme/ThemeContext';
import { FONTS, Theme } from '../theme/themes';

export default function Planner() {
  const t = useTheme();
  const [trip, setTrip] = useState<TripSelection | null | undefined>(undefined);
  // Read the saved trip every time the screen is shown, so a new choice replaces the old one
  useFocusEffect(
    useCallback(() => {
      load<unknown>(KEYS.trip, null).then((raw) => setTrip(sanitizeTrip(raw)));
    }, []),
  );

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
  heading: { fontFamily: FONTS.heading, fontSize: 22 },
  body: { fontFamily: FONTS.body, fontSize: 14, lineHeight: 20 },
  small: { fontFamily: FONTS.body, fontSize: 12, lineHeight: 17 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 },
  cardTitle: { fontFamily: FONTS.bodyBold, fontSize: 16 },
  leg: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  legTimes: { fontFamily: FONTS.bodyMedium, fontSize: 15 },
});
