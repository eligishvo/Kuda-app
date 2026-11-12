// A number with − and + buttons.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FONTS, Theme, TOUCH } from '../theme/themes';

type Props = {
  theme: Theme;
  label: string;
  value: number;
  /** How the value is written, e.g. "$400" or "5 nights". */
  text?: string;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
};

export function Stepper({ theme: t, label, value, text, min, max, step = 1, onChange }: Props) {
  const button = (sign: -1 | 1) => {
    const next = Math.max(min, Math.min(max, value + sign * step));
    const off = next === value;
    return (
      <Pressable
        onPress={() => onChange(next)}
        disabled={off}
        accessibilityRole="button"
        accessibilityLabel={`${sign < 0 ? 'Less' : 'More'}: ${label}`}
        style={[styles.button, { backgroundColor: t.chip, borderColor: t.border, opacity: off ? 0.4 : 1 }]}
      >
        <Text style={[styles.sign, { color: t.text }]}>{sign < 0 ? '−' : '+'}</Text>
      </Pressable>
    );
  };
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: t.muted }]}>{label}</Text>
      {button(-1)}
      <Text style={[styles.value, { color: t.text }]}>{text ?? String(value)}</Text>
      {button(1)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: TOUCH },
  label: { fontFamily: FONTS.body, fontSize: 15, flex: 1 },
  button: { width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sign: { fontSize: 22, lineHeight: 26 },
  value: { fontFamily: FONTS.bodyBold, fontSize: 16, minWidth: 84, textAlign: 'center' },
});
