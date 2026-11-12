// A small month calendar for picking a range of dates: tap the first day, then the last.
// Written here (instead of adding a date-picker library) so it follows the theme and runs in Expo Go.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DateText } from '../../shared/types';
import { monthGrid, MONTH_NAMES } from '../search/search';
import { FONTS, Theme, TOUCH } from '../theme/themes';

type Props = {
  theme: Theme;
  from: DateText;
  to: DateText;
  /** First and last day that can be picked. */
  min: DateText;
  max: DateText;
  onChange: (from: DateText, to: DateText) => void;
};

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function Calendar({ theme: t, from, to, min, max, onChange }: Props) {
  const [year, setYear] = useState(Number(from.slice(0, 4)));
  const [month, setMonth] = useState(Number(from.slice(5, 7)));
  /** Set after the first tap, while waiting for the second. */
  const [start, setStart] = useState<DateText | null>(null);

  const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
  const canBack = ym(year, month) > min.slice(0, 7);
  const canNext = ym(year, month) < max.slice(0, 7);
  const step = (by: number) => {
    const m = month + by;
    if (m < 1) { setYear(year - 1); setMonth(12); }
    else if (m > 12) { setYear(year + 1); setMonth(1); }
    else setMonth(m);
  };

  const tap = (d: DateText) => {
    if (start && d > start) {
      setStart(null);
      onChange(start, d);
    } else {
      setStart(d);
    }
  };

  const lo = start ?? from;
  const hi = start ?? to;
  return (
    <View style={[styles.box, { backgroundColor: t.panel, borderColor: t.border }]}>
      <View style={styles.head}>
        <Arrow theme={t} label="‹" name="Previous month" enabled={canBack} onPress={() => step(-1)} />
        <Text style={[styles.month, { color: t.text }]}>{MONTH_NAMES[month - 1]} {year}</Text>
        <Arrow theme={t} label="›" name="Next month" enabled={canNext} onPress={() => step(1)} />
      </View>
      <View style={styles.grid}>
        {WEEKDAYS.map((w, i) => (
          <Text key={`w${i}`} style={[styles.cell, styles.weekday, { color: t.muted }]}>{w}</Text>
        ))}
        {monthGrid(year, month).map((d, i) => {
          if (!d) return <View key={`b${i}`} style={styles.cell} />;
          const off = d < min || d > max;
          const edge = d === lo || d === hi;
          const inside = d > lo && d < hi;
          return (
            <Pressable
              key={d}
              disabled={off}
              onPress={() => tap(d)}
              accessibilityRole="button"
              accessibilityLabel={d}
              accessibilityState={{ selected: edge || inside, disabled: off }}
              style={[styles.cell, styles.day, edge && { backgroundColor: t.accent }, inside && { backgroundColor: t.chip }]}
            >
              <Text style={[styles.dayText, { color: off ? t.border : edge ? t.buttonText : t.text }]}>{Number(d.slice(8, 10))}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.hint, { color: t.muted }]}>
        {start ? 'Now tap the latest day you want to be back.' : 'Tap the earliest day you can leave, then the latest day to be back.'}
      </Text>
    </View>
  );
}

function Arrow({ theme: t, label, name, enabled, onPress }: { theme: Theme; label: string; name: string; enabled: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!enabled} accessibilityRole="button" accessibilityLabel={name} style={[styles.arrow, { opacity: enabled ? 1 : 0.3 }]}>
      <Text style={[styles.arrowText, { color: t.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 16, padding: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  month: { fontFamily: FONTS.bodyBold, fontSize: 16 },
  arrow: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  arrowText: { fontSize: 26, lineHeight: 30 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  weekday: { fontFamily: FONTS.bodyMedium, fontSize: 12, textAlign: 'center', textAlignVertical: 'center', height: 28 },
  day: { borderRadius: 10 },
  dayText: { fontFamily: FONTS.bodyMedium, fontSize: 15 },
  hint: { fontFamily: FONTS.body, fontSize: 12, lineHeight: 17, paddingTop: 6, paddingHorizontal: 4 },
});
