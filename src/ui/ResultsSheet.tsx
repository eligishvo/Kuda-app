// The results panel at the bottom of the map: destinations within budget, cheapest first, then the
// selected airports that have no estimate for the dates. Tapping a row moves the map there.
import { allowanceText } from '../flights/live';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Usage } from '../../shared/types';
import { originOf, priceText, Result, Results, stopsText } from '../results/results';
import { daysText, shortDate } from '../search/search';
import { FONTS, Theme, TOUCH } from '../theme/themes';

type Props = {
  theme: Theme;
  results: Results | null;
  loading: boolean;
  progress: string;
  error: string | null;
  usage: Usage | null;
  budget: number;
  /** The airport whose pin or row was tapped last. */
  focused: string | null;
  onPick: (r: Result) => void;
  /** Open the destination screen (live flight checks) for a result. */
  onOpen: (r: Result) => void;
  /** Back to choosing destinations. */
  onEdit: () => void;
  /** Open the full list with dates, times and filters. */
  onList: () => void;
};

/** Where a result's price comes from, e.g. "Google Flights, checked" or "Aviasales, estimate". */
const sourceNote = (kind: Result['kind']) => {
  if (kind === 'none') return 'No estimate for your dates';
  const o = originOf(kind);
  return `${o.source}, ${o.status.toLowerCase()}`;
};

export function ResultsSheet({ theme: t, results, loading, progress, error, usage, budget, focused, onPick, onOpen, onEdit, onList }: Props) {
  const insets = useSafeAreaInsets();
  const list = results?.list ?? [];
  const priced = list.filter((r) => r.estimate).length;
  return (
    <View style={[styles.sheet, { backgroundColor: t.panel, borderColor: t.border, paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.row}>
        <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>
          {loading ? progress || 'Checking prices…' : `${priced} within $${budget}`}
        </Text>
        <View style={styles.buttons}>
          <Small theme={t} label="Full list" onPress={onList} />
          <Small theme={t} label="Destinations" onPress={onEdit} />
        </View>
      </View>
      {error && <Text style={[styles.note, { color: t.price }]}>{error}</Text>}
      {!loading && results && (
        <Text style={[styles.note, { color: t.muted }]}>
          {[
            results.overBudget > 0 ? `${results.overBudget} more cost over $${budget}` : '',
            allowanceText(usage),
          ].filter(Boolean).join(' · ') || 'Prices are per person, round trip.'}
        </Text>
      )}
      {!loading && results && list.length === 0 && !error && (
        <Text style={[styles.note, { color: t.muted }]}>Nothing fits these dates and budget. Try a wider window or a higher budget.</Text>
      )}
      {!loading && list.length > 0 && (
        <Text style={[styles.note, { color: t.muted }]}>Tap a destination, then "Compare flights" to see its dates (free). Live prices are checked only when you tap Check there, up to one search per date pair.</Text>
      )}
      <ScrollView style={styles.list}>
        {list.map((r) => {
          const e = r.estimate;
          const on = r.airport === focused;
          return (
            <Pressable
              key={r.airport}
              onPress={() => onPick(r)}
              accessibilityRole="button"
              style={[styles.item, { borderColor: t.border, backgroundColor: on ? t.chip : 'transparent' }]}
            >
              <View style={styles.itemText}>
                <Text style={[styles.city, { color: t.text }]} numberOfLines={1}>{r.city} ({r.airport})</Text>
                <Text style={[styles.detail, { color: t.muted }]} numberOfLines={1}>{r.name}</Text>
                <Text style={[styles.detail, { color: t.muted }]} numberOfLines={1}>
                  {e
                    ? [`${shortDate(e.outDate)} – ${shortDate(e.retDate)}`, daysText(e.nights), stopsText(e.stops), sourceNote(r.kind)].filter(Boolean).join(' · ')
                    : sourceNote('none')}
                </Text>
              </View>
              <View style={styles.right}>
                {e && (
                  <Text style={[styles.price, { color: t.price, opacity: r.kind === 'rough' ? 0.8 : 1 }]}>{priceText(r)}</Text>
                )}
                {/* The tapped row offers the live flight check */}
                {on && (
                  <Pressable
                    onPress={() => onOpen(r)}
                    accessibilityRole="button"
                    style={[styles.open, { backgroundColor: t.accent }]}
                  >
                    <Text style={[styles.openText, { color: t.buttonText }]}>{e ? 'Compare flights' : 'See dates'}</Text>
                  </Pressable>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function Small({ theme: t, label, onPress, disabled }: { theme: Theme; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[styles.small, { backgroundColor: t.chip, borderColor: t.border, opacity: disabled ? 0.5 : 1 }]}
    >
      <Text style={[styles.smallText, { color: t.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
    paddingHorizontal: 16, paddingTop: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: TOUCH, gap: 8 },
  title: { fontFamily: FONTS.heading, fontSize: 18, flexShrink: 1 },
  buttons: { flexDirection: 'row', gap: 8 },
  small: { borderWidth: 1, borderRadius: 22, paddingHorizontal: 12, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  smallText: { fontFamily: FONTS.bodyMedium, fontSize: 13 },
  note: { fontFamily: FONTS.body, fontSize: 12, lineHeight: 17, paddingBottom: 4 },
  list: { maxHeight: 250 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: TOUCH + 12, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 6, paddingHorizontal: 4, borderRadius: 8 },
  itemText: { flex: 1 },
  city: { fontFamily: FONTS.bodyBold, fontSize: 15 },
  detail: { fontFamily: FONTS.body, fontSize: 12, lineHeight: 17 },
  price: { fontFamily: FONTS.heading, fontSize: 18 },
  right: { alignItems: 'flex-end', gap: 4 },
  open: { borderRadius: 22, paddingHorizontal: 14, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  openText: { fontFamily: FONTS.bodyBold, fontSize: 13 },
});
