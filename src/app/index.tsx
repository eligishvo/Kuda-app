// Home screen: the map, the trip summary on top, and a bottom panel that is either the destination
// selection or, after "Search flights", the results.
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlobeMap } from '../map/GlobeMap';
import { Hit } from '../map/hitTest';
import { airportByCode, airportCodesIn, airportLabel, AIRPORTS, airportsIn, countryName, GEO_HIGH, GEO_LOW } from '../map/mapData';
import { Pin } from '../map/pins';
import { flyTo, useMapView } from '../map/useMapView';
import { datePairs, encodePairs, suggestedPairs } from '../flights/flights';
import { useTrips } from '../planner/TripsContext';
import { ReportButton } from '../report/ReportButton';
import { priceText, Result, windowOf } from '../results/results';
import { useResults } from '../results/useResults';
import { nightsText, shortDate, travelersText } from '../search/search';
import { useSearch } from '../search/SearchContext';
import {
  chips, countryState, EMPTY, isAirportSelected, removeCountry, selectAll, selectedAirports, toggleAirport, toggleCountry,
} from '../selection/selection';
import { useSelection } from '../selection/useSelection';
import { useTheme } from '../theme/ThemeContext';
import { FONTS, TOUCH } from '../theme/themes';
import { ResultsSheet } from '../ui/ResultsSheet';
import { SelectionSheet } from '../ui/SelectionSheet';

export default function Home() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const view = useMapView();
  const [selection, update] = useSelection();
  const { search } = useSearch();
  const { trips } = useTrips();
  const homeCc = search.departureCc;
  /** The country whose airports are listed in the sheet, if any. */
  const [narrowCc, setNarrowCc] = useState<string | null>(null);
  /** The airport tapped on the map, shown with its name before it is added or removed. */
  const [previewCode, setPreviewCode] = useState<string | null>(null);
  /** Which bottom panel is showing. */
  const [showResults, setShowResults] = useState(false);
  /** The airport whose pin or result row was tapped last. */
  const [focused, setFocused] = useState<string | null>(null);

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

  // Prices: fetched when the user asks (on the search screen), shared with the results list
  const found = useResults();
  const pins: Pin[] = useMemo(() => {
    if (!showResults || !found.results) return [];
    return found.results.list.map((r, rank) => ({
      code: r.airport, lon: r.lon, lat: r.lat, label: priceText(r, true), kind: r.kind, rank, focused: r.airport === focused,
    }));
  }, [showResults, found.results, focused]);

  // Airports whose city name always shows on the map: the ones you fly from, the selected ones, the priced ones
  const named = useMemo(
    () => new Set([...search.departureAirports, ...selectedAirports(selection, airportCodesIn), ...pins.map((p) => p.code), ...(previewCode ? [previewCode] : [])]),
    [search.departureAirports, selection, pins, previewCode],
  );
  // Roughly how much of the screen the top bar and the bottom panel cover
  const covered = useMemo(() => ({ top: insets.top + 180, bottom: insets.bottom + (showResults ? 330 : 190) }), [insets.top, insets.bottom, showResults]);

  const onHit = useCallback(
    (hit: Hit, flat: boolean) => {
      if (!hit) {
        setNarrowCc(null);
        setFocused(null);
        setPreviewCode(null);
        return;
      }
      if (hit.kind === 'pin') {
        setFocused(hit.code);
        return;
      }
      // While results are showing, the map is for looking: taps don't change the destinations
      if (showResults) return;
      // The departure country isn't a destination
      if (hit.cc === homeCc) return;
      if (hit.kind === 'airport') {
        // Show which airport this is first; the card's button adds or removes it
        setNarrowCc(null);
        setPreviewCode(hit.code);
        return;
      }
      setPreviewCode(null);
      // On the flat map, tapping a selected country opens its airports instead of clearing it
      if (flat && countryState(selection, hit.cc) !== 0 && airportsIn(hit.cc).length > 0) {
        setNarrowCc(hit.cc);
        return;
      }
      setNarrowCc(null);
      update((s) => toggleCountry(s, hit.cc));
    },
    [selection, update, homeCc, showResults],
  );

  const chipList = useMemo(() => chips(selection, countryName, airportCodesIn, airportLabel), [selection]);
  const narrowing = narrowCc != null && selection[narrowCc] ? narrowCc : null;

  const previewAirport = previewCode ? airportByCode(previewCode) : undefined;

  const pickResult = (r: Result) => {
    setFocused(r.airport);
    flyTo(view, r.lon, r.lat);
  };

  const openDestination = (r: Result) => {
    // Check the dates the price lists suggest for this airport first, then others across the window
    const w = windowOf(search);
    const pairs = datePairs(w, suggestedPairs(r.airport, found.lists, w));
    router.push({ pathname: '/destination', params: { code: r.airport, pairs: encodePairs(pairs) } });
  };

  return (
    <View style={[styles.fill, { backgroundColor: t.background }]}>
      <GlobeMap
        theme={t}
        view={view}
        pins={pins}
        flagsLow={flagsLow}
        flagsHigh={flagsHigh}
        airportFlags={airportFlags}
        departures={departures}
        named={named}
        covered={covered}
        onHit={onHit}
      />
      <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.left} pointerEvents="box-none">
          <Text style={[styles.brand, { color: t.text }]}>Kuda</Text>
          {/* The search in short; tap to change it */}
          <Pressable
            onPress={() => router.push('/search')}
            accessibilityRole="button"
            accessibilityLabel="Trip details"
            style={[styles.trip, { backgroundColor: t.panel, borderColor: t.border }]}
          >
            <Text style={[styles.tripMain, { color: t.text }]} numberOfLines={1}>
              From {search.departureAirports.map(airportLabel).join(', ')}
            </Text>
            <Text style={[styles.tripSub, { color: t.muted }]} numberOfLines={1}>
              {shortDate(search.earliestOut)} – {shortDate(search.latestRet)} · {nightsText(search)}
            </Text>
            <Text style={[styles.tripSub, { color: t.muted }]} numberOfLines={1}>
              {travelersText(search.adults)} · up to <Text style={{ color: t.price }}>${search.budget}</Text> each
            </Text>
          </Pressable>
          {/* The planner: trips started by choosing flights */}
          <Pressable
            onPress={() => router.push('/planner')}
            accessibilityRole="button"
            accessibilityLabel="My trips"
            style={[styles.trips, { backgroundColor: t.panel, borderColor: t.border }]}
          >
            <Text style={[styles.tripMain, { color: t.text }]}>My trips{trips.length > 0 ? ` (${trips.length})` : ''}</Text>
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
      {/* Report a problem to High Command, under the settings button */}
      <View style={[styles.report, { top: insets.top + 8 + TOUCH + 8 }]}>
        <ReportButton round />
      </View>
      {showResults ? (
        <ResultsSheet
          theme={t}
          results={found.results}
          loading={found.status === 'loading'}
          progress={found.progress}
          error={found.error ?? (found.stale && found.status !== 'loading' ? 'Trip details changed since these prices were fetched. Tap Refresh.' : null)}
          usage={found.usage}
          budget={search.budget}
          focused={focused}
          onPick={pickResult}
          onOpen={openDestination}
          onEdit={() => setShowResults(false)}
          onList={() => router.push('/results')}
        />
      ) : (
        <SelectionSheet
          theme={t}
          chips={chipList}
          onRemove={(cc) => update((s) => removeCountry(s, cc))}
          onClear={() => {
            setNarrowCc(null);
            update(() => EMPTY);
          }}
          action={{
            label: 'Search flights',
            onPress: () => router.push('/search'),
            note: found.results && !found.stale ? undefined : chipList.length === 0 ? 'Nothing picked: the search will look everywhere.' : undefined,
            second: found.results && !found.stale ? { label: 'Prices on map', onPress: () => { setNarrowCc(null); setShowResults(true); } } : undefined,
          }}
          preview={
            previewAirport && !narrowing
              ? {
                  airport: previewAirport,
                  country: countryName(previewAirport.cc),
                  selected: isAirportSelected(selection, previewAirport.cc, previewAirport.code),
                  onToggle: () => update((s) => toggleAirport(s, previewAirport.cc, previewAirport.code, airportCodesIn(previewAirport.cc))),
                  onClose: () => setPreviewCode(null),
                }
              : undefined
          }
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  left: { flex: 1, alignItems: 'flex-start', paddingRight: 12 },
  brand: { fontFamily: FONTS.heading, fontSize: 28 },
  trip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, marginTop: 6, minHeight: TOUCH, justifyContent: 'center', maxWidth: '100%' },
  trips: { borderWidth: 1, borderRadius: 22, paddingHorizontal: 14, height: TOUCH, marginTop: 6, justifyContent: 'center' },
  tripMain: { fontFamily: FONTS.bodyMedium, fontSize: 13 },
  tripSub: { fontFamily: FONTS.body, fontSize: 12, marginTop: 1 },
  settings: { width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  settingsIcon: { fontSize: 20 },
  report: { position: 'absolute', right: 16 },
});
