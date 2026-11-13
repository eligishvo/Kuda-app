// Results: every option the search found, one line per destination and pair of dates, with the departure and
// return dates and times, the trip length and the total cost. Filters narrow the list; a line opens the live
// flight check for that destination and those dates.
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { encodePairs } from '../flights/flights';
import { allowanceText } from '../flights/live';
import { defaultFilters, filterOptions, Filters, Option, originOf, priceText, Sort, stopsText, totalCost } from '../results/results';
import { useResults } from '../results/useResults';
import { daysText, lengthNote, lengthRange, LIMITS, Search, shortDate, travelersText } from '../search/search';
import { useSearch } from '../search/SearchContext';
import { useTheme } from '../theme/ThemeContext';
import { FONTS, Theme, TOUCH } from '../theme/themes';
import { Stepper } from '../ui/Stepper';

const SORTS: { id: Sort; label: string }[] = [
  { id: 'price', label: 'Cheapest' },
  { id: 'date', label: 'Earliest' },
  { id: 'length', label: 'Shortest' },
];

export default function ResultsScreen() {
  const t = useTheme();
  const { search } = useSearch();
  const found = useResults();
  const [filters, setFilters] = useState<Filters>(() => defaultFilters(search));
  const [showFilters, setShowFilters] = useState(false);
  const [showSources, setShowSources] = useState(false);
  // A new search starts again from the search's own budget, trip length and options
  useEffect(() => {
    setFilters(defaultFilters(search));
  }, [search]);
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  const list = useMemo(() => filterOptions(found.options, filters), [found.options, filters]);
  const loading = found.status === 'loading';
  const hidden = found.options.length - list.length;
  const mixedCount = useMemo(() => found.options.filter((o) => o.back).length, [found.options]);

  const checkLive = (code: string) => router.push({ pathname: '/destination', params: { code } });

  const footer = !loading && found.missing.length > 0 && (
    <View style={styles.missing}>
      <Text style={[styles.section, { color: t.text }]}>Nothing that fits for {found.missing.length} selected {found.missing.length === 1 ? 'airport' : 'airports'}</Text>
      <Text style={[styles.small, { color: t.muted }]}>
        The price sources only know some dates. Here is the closest each one had; "See dates" opens the destination
        for free, and you choose there which dates to check live (up to one search each).
      </Text>
      {found.missing.map((m) => (
        <View key={m.airport} style={[styles.row, { backgroundColor: t.panel, borderColor: t.border }]}>
          <View style={styles.flex}>
            <Text style={[styles.city, { color: t.text }]} numberOfLines={1}>{m.city} ({m.airport})</Text>
            <Text style={[styles.small, { color: t.muted }]} numberOfLines={2}>
              {m.near
                ? `Closest: ${shortDate(m.near.estimate.outDate)} – ${shortDate(m.near.estimate.retDate)}, $${m.near.estimate.price} each (${originOf(m.near.kind).source}) · ${m.near.why}`
                : 'No price found for this airport in these months'}
            </Text>
          </View>
          <Pressable onPress={() => checkLive(m.airport)} accessibilityRole="button" style={styles.liveBtn}>
            <Text style={[styles.check, { color: t.text }]}>See dates ›</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );

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
        {found.usage ? ` · ${allowanceText(found.usage)}` : ''}
      </Text>
      {found.error && <Text style={[styles.small, { color: t.price }]}>{found.error}</Text>}
      {found.stale && !loading && (
        <Text style={[styles.small, { color: t.price }]}>The search or the destinations changed since these prices were fetched. Go back and tap Search.</Text>
      )}

      <View style={styles.bar}>
        {SORTS.map((s) => (
          <Chip key={s.id} theme={t} on={filters.sort === s.id} label={s.label} onPress={() => set({ sort: s.id })} />
        ))}
        <Chip theme={t} on={showFilters} label={showFilters ? 'Hide filters' : 'Filters'} onPress={() => setShowFilters(!showFilters)} />
        <Chip theme={t} on={showSources} label="Price sources" onPress={() => setShowSources(!showSources)} />
        <Chip theme={t} on={false} label="Map" onPress={() => router.dismissTo('/')} />
      </View>

      {showSources && (
        <View style={[styles.filters, { backgroundColor: t.panel, borderColor: t.border }]}>
          {(['live', 'estimate', 'rough'] as const).map((kind) => {
            const o = originOf(kind);
            return (
              <View key={kind} style={styles.sourceRow}>
                <Badge theme={t} kind={kind} mixed={false} />
                <Text style={[styles.small, styles.flex, { color: t.muted }]}>{o.detail}</Text>
              </View>
            );
          })}
          <Text style={[styles.small, { color: t.muted }]}>
            Tapping a line checks it live on Google Flights. After you choose flights, the trip's Flights tab can list who sells them
            (the airline or a travel agency) and each seller’s price.
          </Text>
        </View>
      )}

      {showFilters && (
        <View style={[styles.filters, { backgroundColor: t.panel, borderColor: t.border }]}>
          <Stepper theme={t} label="Most per person" value={filters.maxPrice} text={`$${filters.maxPrice}`} min={LIMITS.budget.min} max={LIMITS.budget.max} step={LIMITS.budget.step} onChange={(maxPrice) => set({ maxPrice })} />
          <Stepper theme={t} label="Shortest trip" value={filters.minDays} text={daysText(filters.minDays)} min={lengthRange(search).min} max={filters.maxDays} onChange={(minDays) => set({ minDays })} />
          <Stepper theme={t} label="Longest trip" value={filters.maxDays} text={daysText(filters.maxDays)} min={filters.minDays} max={lengthRange(search).max} onChange={(maxDays) => set({ maxDays })} />
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
            ? 'No price fits these dates. See below for the closest ones, or try wider dates or a different trip length.'
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
      ListFooterComponent={footer || undefined}
      renderItem={({ item }) => <Row theme={t} o={item} search={search} onPress={() => open(item)} />}
      initialNumToRender={12}
    />
  );
}

/** One option: where, when you leave and come back (with times when known), how long, and what it costs. */
function Row({ theme: t, o, search, onPress }: { theme: Theme; o: Option; search: Search; onPress: () => void }) {
  const e = o.estimate;
  const adults = search.adults;
  // Trips the flexibility let in are marked, e.g. "1 day longer than asked"
  const off = lengthNote(e.nights, search);
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
            <Text style={[styles.when, { color: off ? t.price : t.text }]}>{daysText(e.nights)}</Text>
            {off ? <Text style={[styles.tiny, { color: t.price }]}>{off}</Text> : null}
          </View>
        </View>
        <View style={styles.meta}>
          <Badge theme={t} kind={o.kind} mixed={!!o.split} />
          <Text style={[styles.small, styles.flex, { color: t.muted }]} numberOfLines={1}>
            {[stopsText(e.stops), e.airline, o.split ? 'two one-way tickets' : ''].filter(Boolean).join(' · ')}
          </Text>
        </View>
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

/** Where the price comes from and whether it was checked: "Google Flights · Checked", "Aviasales · Estimate". */
function Badge({ theme: t, kind, mixed }: { theme: Theme; kind: Option['kind']; mixed: boolean }) {
  const o = originOf(kind, mixed);
  const checked = kind === 'live';
  return (
    <View style={[styles.badge, { borderColor: checked ? t.price : t.border, borderStyle: checked ? 'solid' : 'dashed' }]}>
      <Text style={[styles.tiny, { color: checked ? t.price : t.muted }]}>{o.source} · {o.status}</Text>
    </View>
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
  sourceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: TOUCH },
  reset: { alignSelf: 'flex-start', minHeight: TOUCH, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 12 },
  city: { fontFamily: FONTS.bodyBold, fontSize: 16 },
  dates: { flexDirection: 'row', gap: 18, marginVertical: 6 },
  when: { fontFamily: FONTS.bodyMedium, fontSize: 14 },
  right: { alignItems: 'flex-end', gap: 2 },
  price: { fontFamily: FONTS.heading, fontSize: 20 },
  check: { fontFamily: FONTS.bodyMedium, fontSize: 13, marginTop: 6 },
  section: { fontFamily: FONTS.heading, fontSize: 17 },
  missing: { gap: 8, marginTop: 18 },
  liveBtn: { minHeight: TOUCH, justifyContent: 'center', paddingLeft: 6 },
});
