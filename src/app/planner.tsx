// Trips: every trip you started by choosing flights. Tap one to plan it.
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { airportLabel } from '../map/mapData';
import { Btn, Card, text } from '../planner/parts';
import { budgetOf, daysOf, nightsWithoutStay, Trip, tripDates } from '../planner/trip';
import { useTrips } from '../planner/TripsContext';
import { daysText, shortDate, travelersText } from '../search/search';
import { useTheme } from '../theme/ThemeContext';

export default function TripsScreen() {
  const t = useTheme();
  const { trips, ready, remove } = useTrips();
  /** The trip whose Delete was tapped once: it asks again before deleting. */
  const [asking, setAsking] = useState<string | null>(null);

  const line = (trip: Trip) => {
    const { arrive, leave } = tripDates(trip.flights);
    const f = trip.flights;
    const route = f.returnFrom === f.destination ? `${airportLabel(f.origin)} ⇄ ${airportLabel(f.destination)}` : `${airportLabel(f.origin)} → ${airportLabel(f.destination)}, back from ${airportLabel(f.returnFrom)}`;
    return { when: `${shortDate(arrive)} – ${shortDate(leave)} · ${daysText(Math.max(1, daysOf(trip).length - 1))} · ${travelersText(f.adults)}`, route };
  };

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.page}>
      {ready && trips.length === 0 && (
        <Text style={[text.body, { color: t.muted }]}>
          No trips yet. Search for flights, open a destination, and choose an outbound and a return flight: that starts a trip here.
        </Text>
      )}
      {trips.map((trip) => {
        const { when, route } = line(trip);
        const planned = Object.values(trip.days).reduce((n, d) => n + d.length, 0);
        const missing = nightsWithoutStay(trip).length;
        return (
          <Card key={trip.id} theme={t}>
            <Pressable onPress={() => router.push({ pathname: '/trip', params: { id: trip.id } })} accessibilityRole="button" style={styles.open}>
              <View style={styles.rowBetween}>
                <Text style={[text.heading, styles.flex, { color: t.text }]} numberOfLines={1}>{trip.name}</Text>
                <Text style={[text.price, { color: t.price }]}>${budgetOf(trip).total}</Text>
              </View>
              <Text style={[text.small, { color: t.muted }]}>{route}</Text>
              <Text style={[text.small, { color: t.muted }]}>{when}</Text>
              <Text style={[text.small, { color: missing > 0 ? t.price : t.muted }]}>
                {planned} {planned === 1 ? 'thing' : 'things'} planned · {missing === 0 ? 'stay sorted' : `${missing} ${missing === 1 ? 'night' : 'nights'} without a stay`}
              </Text>
            </Pressable>
            <View style={styles.row}>
              <Btn theme={t} kind="main" label="Open" onPress={() => router.push({ pathname: '/trip', params: { id: trip.id } })} />
              {asking === trip.id ? (
                <>
                  <Btn theme={t} label="Yes, delete it" onPress={() => { remove(trip.id); setAsking(null); }} />
                  <Btn theme={t} kind="quiet" label="Keep" onPress={() => setAsking(null)} />
                </>
              ) : (
                <Btn theme={t} kind="quiet" label="Delete" onPress={() => setAsking(trip.id)} />
              )}
            </View>
          </Card>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 48, gap: 10 },
  flex: { flex: 1 },
  open: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
});
