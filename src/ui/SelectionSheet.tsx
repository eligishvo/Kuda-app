// The panel at the bottom of the map. Normally it lists the selection as removable chips;
// after tapping a selected country on the flat map it lists that country's airports to narrow it down.
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Airport } from '../map/mapData';
import { Chip } from '../selection/selection';
import { FONTS, Theme, TOUCH } from '../theme/themes';

type Props = {
  theme: Theme;
  chips: Chip[];
  onRemove: (cc: string) => void;
  onClear: () => void;
  /** The main button under the chips (e.g. "Search flights"). */
  action?: { label: string; onPress: () => void; busy?: boolean; note?: string; second?: { label: string; onPress: () => void } };
  /** Set while narrowing one country down to some airports. */
  narrow?: {
    cc: string;
    name: string;
    airports: Airport[];
    isSelected: (code: string) => boolean;
    onToggle: (code: string) => void;
    onAll: () => void;
    onRemove: () => void;
    onDone: () => void;
  };
};

export function SelectionSheet({ theme: t, chips, onRemove, onClear, action, narrow }: Props) {
  const insets = useSafeAreaInsets();
  const sheet = [styles.sheet, { backgroundColor: t.panel, borderColor: t.border, paddingBottom: insets.bottom + 12 }];

  if (narrow) {
    const picked = narrow.airports.filter((a) => narrow.isSelected(a.code)).length;
    return (
      <View style={sheet}>
        <View style={styles.row}>
          <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>
            {narrow.name}
          </Text>
          <Text style={[styles.count, { color: t.muted }]}>
            {picked} of {narrow.airports.length}
          </Text>
        </View>
        <View style={styles.actions}>
          <SmallButton theme={t} label="All airports" onPress={narrow.onAll} />
          <SmallButton theme={t} label="Remove country" onPress={narrow.onRemove} />
          <View style={styles.spacer} />
          <Pressable
            onPress={narrow.onDone}
            accessibilityRole="button"
            style={[styles.done, { backgroundColor: t.accent }]}
          >
            <Text style={[styles.doneText, { color: t.buttonText }]}>Done</Text>
          </Pressable>
        </View>
        <ScrollView style={styles.list}>
          {narrow.airports.map((a) => {
            const on = narrow.isSelected(a.code);
            return (
              <Pressable
                key={a.code}
                onPress={() => narrow.onToggle(a.code)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={[styles.airport, { borderColor: t.border }]}
              >
                <View style={[styles.check, { borderColor: on ? t.accent : t.border, backgroundColor: on ? t.accent : 'transparent' }]}>
                  {on && <Text style={[styles.checkMark, { color: t.buttonText }]}>✓</Text>}
                </View>
                <Text style={[styles.code, { color: t.text }]}>{a.code}</Text>
                <View style={styles.airportText}>
                  <Text style={[styles.airportCity, { color: t.text }]} numberOfLines={1}>{a.city || a.name}</Text>
                  {a.city !== '' && <Text style={[styles.airportName, { color: t.muted }]} numberOfLines={1}>{a.name}</Text>}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={sheet}>
      <View style={styles.row}>
        <Text style={[styles.title, { color: t.text }]}>Destinations</Text>
        {chips.length > 0 && <SmallButton theme={t} label="Clear" onPress={onClear} />}
      </View>
      {chips.length === 0 ? (
        <Text style={[styles.hint, { color: t.muted }]}>
          Tap a country to add it. Pinch in to see its airports and pick only some. With nothing picked, the search
          looks everywhere.
        </Text>
      ) : (
        <ScrollView style={styles.chipScroll} contentContainerStyle={styles.chips}>
          {chips.map((c) => (
            <View key={c.cc} style={[styles.chip, { backgroundColor: t.chip, borderColor: t.border }]}>
              <Text style={[styles.chipText, { color: t.text }]} numberOfLines={1}>
                {c.label}
              </Text>
              <Pressable
                onPress={() => onRemove(c.cc)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${c.label}`}
                hitSlop={8}
                style={styles.chipRemove}
              >
                <Text style={[styles.chipX, { color: t.muted }]}>✕</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
      {action && (
        <>
          <View style={styles.actions2}>
            <Pressable
              onPress={action.onPress}
              disabled={action.busy}
              accessibilityRole="button"
              style={[styles.action, styles.grow, { backgroundColor: t.accent, opacity: action.busy ? 0.6 : 1 }]}
            >
              <Text style={[styles.actionText, { color: t.buttonText }]}>{action.label}</Text>
            </Pressable>
            {action.second && (
              <Pressable
                onPress={action.second.onPress}
                accessibilityRole="button"
                style={[styles.action, styles.secondAction, { backgroundColor: t.chip, borderColor: t.border }]}
              >
                <Text style={[styles.actionText, { color: t.text }]}>{action.second.label}</Text>
              </Pressable>
            )}
          </View>
          {action.note ? <Text style={[styles.note, { color: t.muted }]}>{action.note}</Text> : null}
        </>
      )}
    </View>
  );
}

function SmallButton({ theme: t, label, onPress }: { theme: Theme; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.small, { backgroundColor: t.chip, borderColor: t.border }]}
    >
      <Text style={[styles.smallText, { color: t.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: TOUCH },
  title: { fontFamily: FONTS.heading, fontSize: 18, flexShrink: 1 },
  count: { fontFamily: FONTS.bodyMedium, fontSize: 14 },
  hint: { fontFamily: FONTS.body, fontSize: 14, lineHeight: 20, paddingBottom: 4 },
  chipScroll: { maxHeight: 108 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 22, paddingLeft: 14, height: TOUCH, maxWidth: '100%' },
  chipText: { fontFamily: FONTS.bodyMedium, fontSize: 14, flexShrink: 1 },
  chipRemove: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  chipX: { fontSize: 14 },
  small: { borderWidth: 1, borderRadius: 22, paddingHorizontal: 14, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  smallText: { fontFamily: FONTS.bodyMedium, fontSize: 14 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 8 },
  spacer: { flex: 1 },
  done: { borderRadius: 22, paddingHorizontal: 20, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  doneText: { fontFamily: FONTS.bodyBold, fontSize: 15 },
  list: { maxHeight: 260 },
  airport: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: TOUCH + 4, borderTopWidth: StyleSheet.hairlineWidth },
  check: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkMark: { fontSize: 14, fontWeight: '700', lineHeight: 18 },
  code: { fontFamily: FONTS.bodyBold, fontSize: 15, width: 44 },
  airportText: { flex: 1, paddingVertical: 4 },
  airportCity: { fontFamily: FONTS.bodyMedium, fontSize: 14 },
  airportName: { fontFamily: FONTS.body, fontSize: 12 },
  actions2: { flexDirection: 'row', gap: 8, marginTop: 10 },
  grow: { flex: 1 },
  secondAction: { borderWidth: 1, paddingHorizontal: 16 },
  action: { borderRadius: 24, minHeight: TOUCH + 4, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontFamily: FONTS.bodyBold, fontSize: 16 },
  note: { fontFamily: FONTS.body, fontSize: 12, lineHeight: 17, paddingTop: 6 },
});
