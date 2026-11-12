// Results: every option the search found, one line per destination and pair of dates, with the departure and
// return dates and times, the trip length and the total cost. Filters narrow the list; a line opens the live
// flight check for that destination and those dates.
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { encodePairs } from '../flights/flights';
import { defaultFilters, filterOptions, Filters, Option, priceText, Sort, stopsText, totalCost } from '../results/results';
import { useResults } from '../results/useResults';
import { daysText, LIMITS, shortDate, travelersText } from '../search/search';
import { useSearch } from '../search/SearchContext';
import { useTheme } from '../theme/ThemeContext';
import { FONTS, Theme, TOUCH } from '../theme/themes';
import { Stepper } from '../ui/Stepper';

const SORTS: { id: Sort; label: string }[] = [
  { id: 'price', label: 'Cheapest' },
  { id: 'date', label: 'Earliest' },
  { id: 'length', label: 'Shortest' },
];

const NOTE: Record<Option['kind'], string> = {
  live: 'Google price',
  estimate: 'Estimate, a few days old',
  rough: 'Rough estimate',
  none: '',
};

export default function ResultsScreen() {
  const t = useTheme();
  const { search } = useSearch();
  const found = useResults();
  const [filters, setFilters] = useState<Filters>(() => defaultFilters(search));
  const [showFilters, setShowFilters] = useState(false);
  // A new search starts again from the search's own budget, trip length and options
  useEffect(() => {
    setFilters(defaultFilters(search));
  }, [search]);
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  const list = useMemo(() => filterOptions(found.options, filters), [found.options, filters]);
  const loading = found.status === 'loading';
  const hidden = found.options.length - list.length;
  const mixedCount = useMemo(() => found.options.filter((o) => o.back).length, [found.options]);

  const open = (o: Option) =>
    router.push({
      pathname: '/destination',
      params: { code: o.airport, pairs: encodePairs([{ out: o.estimate.outDate, ret: o.estimate.retDate }]), ...(o.back ? { back: o.back.airport } : {}) },
    });

  const header = (
    <View style={styles.header}>
      <Text style={[styles.title, { color: t.text }]}>
        {loading ? found.progress || 'Checking prices…' : `${list.length} ${list.length === 1 ? 'option' : 'options'}`}
      </Text>
      <Text style={[styles.small, { color: t.muted }]}>
        {shortDate(search.earliestOut)} – {shortDate(search.latestRet)} · {travelersText(search.adults)}
        {found.usage ? ` · ${Math.max(0, found.usage.cap - found.usage.used)} searches left today` : ''}
      </Text>
      {found.error && <Text style={[styles.small, { color: t.price }]}>{found.error}</Text>}
      {found.stale && !loading && (
        <Text style={[styles.small, { color: t.price }]}>The search changed since these prices were fetched. Go back and tap Search.</Text>
      )}

      <View style={styles.bar}>
        {SORTS.map((s) => (
          <Chip key={s.id} theme={t} on={filters.sort === s.id} label={s.label} onPress={() => set({ sort: s.id })} />
        ))}
        <Chip theme={t} on={showFilters} label={showFilters ? 'Hide filters' : 'Filters'} onPress={() => setShowFilters(!showFilters)} />
        <Chip theme={t} on={false} label="Map" onPress={() => router.dismissTo('/')} />
      </View>

      {showFilters && (
        <View style={[styles.filters, { backgroundColor: t.panel, borderColor: t.border }]}>
          <Stepper theme={t} label="Most per person" value={filters.maxPrice} text={`$${filters.maxPrice}`} min={LIMITS.budget.min} max={LIMITS.budget.max} step={LIMITS.budget.step} onChange={(maxPrice) => set({ maxPrice })} />
          <Stepper theme={t} label="Shortest trip" value={filters.minDays} text={daysText(filters.minDays)} min={search.minNights} max={filters.maxDays} onChange={(minDays) => set({ minDays })} />
          <Stepper theme={t} label="Longest trip" value={filters.maxDays} text={daysText(filters.maxDays)} min={filters.minDays} max={search.maxNights} onChange={(maxDays) => set({ maxDays })} />
          <Toggle theme={t} label="Nonstop only" value={filters.nonstopOnly} onChange={(nonstopOnly) => set({ nonstopOnly })} />
          <Toggle theme={t} label="Google prices only (no estimates)" value={filters.liveOnly} onChange={(liveOnly) => set({ liveOnly })} />
          <Toggle
            theme={t}
            label={`Home from a different airport${mixedCount ? ` (${mixedCount})` : ''}`}
            value={filters.mixed}
            onChange={(mixed) => set({ mixed })}
          />
          <Pressable onPress={() => setFilters(defaultFilters(search))} accessibilityRole="button" style={styles.reset}>
            <Text style={[styles.small, { color: t.text }]}>Reset filters</Text>
          </Pressable>
        </View>
      )}
      {!loading && hidden > 0 && <Text style={[styles.small, { color: t.muted }]}>{hidden} more hidden by the filters.</Text>}
      {!loading && found.status === 'done' && list.length === 0 && !found.error && (
        <Text style={[styles.body, { color: t.muted }]}>
          {found.options.length === 0
            ? 'No prices were found for these dates. Try wider dates, a longer or shorter trip, or other destinations.'
            : 'Nothing passes the filters. Raise the price or widen the trip length.'}
        </Text>
      )}
      {found.status === 'idle' && <Text style={[styles.body, { color: t.muted }]}>No search yet. Go back and tap Search.</Text>}
    </View>
  );

  return (
    <FlatList
      style={{ backgroundColor: t.background }}
      contentContainerStyle={styles.page}
      data={list}
      keyExtractor={(o) => `${o.airport}_${o.back?.airport ?? ''}_${o.estimate.outDate}_${o.estimate.retDate}`}
      ListHeaderComponent={header}
      renderItem={({ item }) => <Row theme={t} o={item} adults={search.adults} onPress={() => open(item)} />}
      initialNumToRender={12}
    />
  );
}

/** One option: where, when you leave and come back (with times when known), how long, and what it costs. */
function Row({ theme: t, o, adults, onPress }: { theme: Theme; o: Option; adults: number; onPress: () => void }) {
  const e = o.estimate;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.row, { backgroundColor: t.panel, borderColor: t.border }]}>
      <View style={styles.flex}>
        <Text style={[styles.city, { color: t.text }]} numberOfLines={1}>{o.city} ({o.airport})</Text>
        {o.back ? (
          <Text style={[styles.small, { color: t.price }]} numberOfLines={1}>Home from {o.back.city} ({o.back.airport})</Text>
        ) : (
          <Text style={[styles.small, { color: t.muted }]} numberOfLines={1}>{o.name}</Text>
        )}
        <View style={styles.dates}>
          <When theme={t} label="Leave" date={e.outDate} time={e.outTime} />
          <When theme={t} label="Return" date={e.retDate} time={e.retTime} />
          <View>
            <Text style={[styles.tiny, { color: t.muted }]}>Trip</Text>
            <Text style={[styles.when, { color: t.text }]}>{daysText(e.nights)}</Text>
          </View>
        </View>
        <Text style={[styles.small, { color: t.muted }]} numberOfLines={1}>
          {[stopsText(e.stops), e.airline, NOTE[o.kind], o.back ? 'two one-way tickets' : ''].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={[styles.price, { color: t.price, opacity: o.kind === 'rough' ? 0.8 : 1 }]}>
          {o.kind === 'live' ? '' : '~'}${totalCost(o, adults)}
        </Text>
        <Text style={[styles.tiny, { color: t.muted }]}>{adults > 1 ? `total · ${priceText(o, true)} each` : 'total'}</Text>
        <Text style={[styles.check, { color: t.text }]}>Flights ›</Text>
      </View>
    </Pressable>
  );
}

function When({ theme: t, label, date, time }: { theme: Theme; label: string; date: string; time?: string }) {
  return (
    <View>
      <Text style={[styles.tiny, { color: t.muted }]}>{label}</Text>
      <Text style={[styles.when, { color: t.text }]}>{shortDate(date)}</Text>
      <Text style={[styles.tiny, { color: t.muted }]}>{time ?? 'time: tap'}</Text>
    </View>
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
      <Text style={[styles.chipText, { color: on ? t.buttonText : t.text }]}>{label}</Text>
    </Pressable>
  );
}

function Toggle({ theme: t, label, value, onChange }: { theme: Theme; label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <Text style={[styles.body, styles.flex, { color: t.text }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: t.border, true: t.price }} thumbColor={t.text} accessibilityLabel={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 48, gap: 8 },
  header: { gap: 6, marginBottom: 4 },
  flex: { flex: 1 },
  title: { fontFamily: FONTS.heading, fontSize: 22 },
  body: { fontFamily: FONTS.body, fontSize: 14, lineHeight: 20 },
  small: { fontFamily: FONTS.body, fontSize: 12, lineHeight: 17 },
  tiny: { fontFamily: FONTS.body, fontSize: 11, lineHeight: 15 },
  bar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { borderWidth: 1, borderRadius: 22, paddingHorizontal: 14, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: FONTS.bodyMedium, fontSize: 13 },
  filters: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: TOUCH },
  reset: { alignSelf: 'flex-start', minHeight: TOUCH, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 12 },
  city: { fontFamily: FONTS.bodyBold, fontSize: 16 },
  dates: { flexDirection: 'row', gap: 18, marginVertical: 6 },
  when: { fontFamily: FONTS.bodyMedium, fontSize: 14 },
  right: { alignItems: 'flex-end', gap: 2 },
  price: { fontFamily: FONTS.heading, fontSize: 20 },
  check: { fontFamily: FONTS.bodyMedium, fontSize: 13, marginTop: 6 },
});
