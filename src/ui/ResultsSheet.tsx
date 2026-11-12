// The results panel at the bottom of the map: destinations within budget, cheapest first, then the
// selected airports that have no estimate for the dates. Tapping a row moves the map there.
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Usage } from '../../shared/types';
import { priceText, Result, Results, stopsText } from '../results/results';
import { shortDate } from '../search/search';
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
  /** Back to choosing destinations. */
  onEdit: () => void;
  onRefresh: () => void;
};

const KIND_NOTE: Record<Result['kind'], string> = {
  live: '',
  estimate: 'estimate, a few days old',
  rough: 'rough, with a connection',
  none: 'No estimate for your dates',
};

export function ResultsSheet({ theme: t, results, loading, progress, error, usage, budget, focused, onPick, onEdit, onRefresh }: Props) {
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
          <Small theme={t} label="Refresh" onPress={onRefresh} disabled={loading} />
          <Small theme={t} label="Destinations" onPress={onEdit} />
        </View>
      </View>
      {error && <Text style={[styles.note, { color: t.price }]}>{error}</Text>}
      {!loading && results && (
        <Text style={[styles.note, { color: t.muted }]}>
          {[
            results.overBudget > 0 ? `${results.overBudget} more cost over $${budget}` : '',
            usage ? `${Math.max(0, usage.cap - usage.used)} searches left today` : '',
          ].filter(Boolean).join(' · ') || 'Prices are per person, round trip.'}
        </Text>
      )}
      {!loading && results && list.length === 0 && !error && (
        <Text style={[styles.note, { color: t.muted }]}>Nothing fits these dates and budget. Try a wider window or a higher budget.</Text>
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
                    ? [`${shortDate(e.outDate)} – ${shortDate(e.retDate)}`, `${e.nights} nights`, stopsText(e.stops), e.airline, KIND_NOTE[r.kind]].filter(Boolean).join(' · ')
                    : KIND_NOTE.none}
                </Text>
              </View>
              <Text style={[e ? styles.price : styles.noPrice, { color: e ? t.price : t.muted, opacity: r.kind === 'rough' ? 0.8 : 1 }]}>
                {priceText(r)}
              </Text>
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
  noPrice: { fontFamily: FONTS.body, fontSize: 12 },
});
