// Home screen: the map, with the selection sheet at the bottom and the settings button on top.
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEPARTURE } from '../config';
import { GlobeMap } from '../map/GlobeMap';
import { Hit } from '../map/hitTest';
import { airportCodesIn, AIRPORTS, airportsIn, countryName, GEO_HIGH, GEO_LOW } from '../map/mapData';
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
  /** The country whose airports are listed in the sheet, if any. */
  const [narrowCc, setNarrowCc] = useState<string | null>(null);

  // What the map needs to colour countries and airports
  const flagOf = useCallback(
    (cc: string) => (cc === DEPARTURE.cc ? 3 : countryState(selection, cc)),
    [selection],
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
      if (hit.cc === DEPARTURE.cc) return;
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
    [selection, update],
  );

  const chipList = useMemo(() => chips(selection, countryName, airportCodesIn), [selection]);
  const narrowing = narrowCc != null && selection[narrowCc] ? narrowCc : null;

  return (
    <View style={[styles.fill, { backgroundColor: t.background }]}>
      <GlobeMap theme={t} flagsLow={flagsLow} flagsHigh={flagsHigh} airportFlags={airportFlags} onHit={onHit} />
      <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="box-none">
        <View pointerEvents="none">
          <Text style={[styles.brand, { color: t.text }]}>Kuda</Text>
          <Text style={[styles.from, { color: t.muted }]}>From {DEPARTURE.code}</Text>
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
  from: { fontFamily: FONTS.bodyMedium, fontSize: 13, marginTop: 2 },
  settings: { width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  settingsIcon: { fontSize: 20 },
});
