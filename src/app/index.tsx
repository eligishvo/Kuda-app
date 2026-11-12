// Home screen: the map, with the selection sheet at the bottom and the settings button on top.
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlobeMap } from '../map/GlobeMap';
import { Hit } from '../map/hitTest';
import { airportByCode, airportCodesIn, AIRPORTS, airportsIn, countryName, GEO_HIGH, GEO_LOW } from '../map/mapData';
import { nightsText, shortDate } from '../search/search';
import { useSearch } from '../search/SearchContext';
import {
  chips, countryState, EMPTY, isAirportSelected, removeCountry, selectAll, toggleAirport, toggleCountry,
} from '../selection/selection';
import { useSelection } from '../selection/useSelection';
import { useTheme } from '../theme/ThemeContext';
import { FONTS, TOUCH } from '../theme/themes';
import { SelectionSheet } from '../ui/SelectionSheet';

export default function Home() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [selection, update] = useSelection();
  const { search } = useSearch();
  const homeCc = search.departureCc;

  // The country you fly from can't also be a destination: drop it if it was selected before
  useEffect(() => {
    if (selection[homeCc]) update((s) => removeCountry(s, homeCc));
  }, [homeCc, selection, update]);

  const departures = useMemo(
    () => search.departureAirports.flatMap((code) => {
      const a = airportByCode(code);
      return a ? [a.lon, a.lat] : [];
    }),
    [search.departureAirports],
  );
  /** The country whose airports are listed in the sheet, if any. */
  const [narrowCc, setNarrowCc] = useState<string | null>(null);

  // What the map needs to colour countries and airports
  const flagOf = useCallback(
    (cc: string) => (cc === homeCc ? 3 : countryState(selection, cc)),
    [selection, homeCc],
  );
  const flagsLow = useMemo(() => GEO_LOW.codes.map(flagOf), [flagOf]);
  const flagsHigh = useMemo(() => GEO_HIGH.codes.map(flagOf), [flagOf]);
  const airportFlags = useMemo(
    () => AIRPORTS.map((a) => (isAirportSelected(selection, a.cc, a.code) ? 1 : 0)),
    [selection],
  );

  const onHit = useCallback(
    (hit: Hit, flat: boolean) => {
      if (!hit) {
        setNarrowCc(null);
        return;
      }
      // The departure country isn't a destination
      if (hit.cc === homeCc) return;
      if (hit.kind === 'airport') {
        update((s) => toggleAirport(s, hit.cc, hit.code, airportCodesIn(hit.cc)));
        return;
      }
      // On the flat map, tapping a selected country opens its airports instead of clearing it
      if (flat && countryState(selection, hit.cc) !== 0 && airportsIn(hit.cc).length > 0) {
        setNarrowCc(hit.cc);
        return;
      }
      setNarrowCc(null);
      update((s) => toggleCountry(s, hit.cc));
    },
    [selection, update, homeCc],
  );

  const chipList = useMemo(() => chips(selection, countryName, airportCodesIn), [selection]);
  const narrowing = narrowCc != null && selection[narrowCc] ? narrowCc : null;

  return (
    <View style={[styles.fill, { backgroundColor: t.background }]}>
      <GlobeMap theme={t} flagsLow={flagsLow} flagsHigh={flagsHigh} airportFlags={airportFlags} departures={departures} onHit={onHit} />
      <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.left} pointerEvents="box-none">
          <Text style={[styles.brand, { color: t.text }]} pointerEvents="none">Kuda</Text>
          {/* The search in short; tap to change it */}
          <Pressable
            onPress={() => router.push('/search')}
            accessibilityRole="button"
            accessibilityLabel="Trip details"
            style={[styles.trip, { backgroundColor: t.panel, borderColor: t.border }]}
          >
            <Text style={[styles.tripMain, { color: t.text }]} numberOfLines={1}>
              From {search.departureAirports.join(', ')} · {shortDate(search.earliestOut)} – {shortDate(search.latestRet)}
            </Text>
            <Text style={[styles.tripSub, { color: t.muted }]} numberOfLines={1}>
              {nightsText(search)} · {search.adults} {search.adults === 1 ? 'traveler' : 'travelers'} · up to <Text style={{ color: t.price }}>${search.budget}</Text> each
            </Text>
          </Pressable>
        </View>
        <Pressable
          onPress={() => router.push('/settings')}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          style={[styles.settings, { backgroundColor: t.panel, borderColor: t.border }]}
        >
          <Text style={[styles.settingsIcon, { color: t.text }]}>⚙</Text>
        </Pressable>
      </View>
      <SelectionSheet
        theme={t}
        chips={chipList}
        onRemove={(cc) => update((s) => removeCountry(s, cc))}
        onClear={() => {
          setNarrowCc(null);
          update(() => EMPTY);
        }}
        narrow={
          narrowing
            ? {
                cc: narrowing,
                name: countryName(narrowing),
                airports: airportsIn(narrowing),
                isSelected: (code) => isAirportSelected(selection, narrowing, code),
                onToggle: (code) => update((s) => toggleAirport(s, narrowing, code, airportCodesIn(narrowing))),
                onAll: () => update((s) => selectAll(s, narrowing)),
                onRemove: () => {
                  setNarrowCc(null);
                  update((s) => removeCountry(s, narrowing));
                },
                onDone: () => setNarrowCc(null),
              }
            : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  brand: { fontFamily: FONTS.heading, fontSize: 28 },
  left: { flex: 1, alignItems: 'flex-start', paddingRight: 12 },
  trip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, marginTop: 6, minHeight: TOUCH, justifyContent: 'center', maxWidth: '100%' },
  tripMain: { fontFamily: FONTS.bodyMedium, fontSize: 13 },
  tripSub: { fontFamily: FONTS.body, fontSize: 12, marginTop: 1 },
  settings: { width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  settingsIcon: { fontSize: 20 },
});
