// Small building blocks shared by the planner's tabs: a text field, buttons, a card.
import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { FONTS, Theme, TOUCH } from '../theme/themes';

export function Field({ theme: t, style, ...props }: TextInputProps & { theme: Theme }) {
  return (
    <TextInput
      placeholderTextColor={t.muted}
      {...props}
      style={[styles.field, { backgroundColor: t.chip, borderColor: t.border, color: t.text }, style]}
    />
  );
}

/** `kind`: main = the accent button, plain = outlined, quiet = text only. */
export function Btn({ theme: t, label, onPress, kind = 'plain', disabled }: { theme: Theme; label: string; onPress: () => void; kind?: 'main' | 'plain' | 'quiet'; disabled?: boolean }) {
  const box =
    kind === 'main' ? { backgroundColor: t.accent, borderColor: t.accent }
    : kind === 'plain' ? { backgroundColor: t.chip, borderColor: t.border }
    : { backgroundColor: 'transparent', borderColor: 'transparent' };
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={[styles.btn, box, { opacity: disabled ? 0.5 : 1 }]}>
      <Text style={[styles.btnText, { color: kind === 'main' ? t.buttonText : kind === 'quiet' ? t.muted : t.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ theme: t, children }: { theme: Theme; children: ReactNode }) {
  return <View style={[styles.card, { backgroundColor: t.panel, borderColor: t.border }]}>{children}</View>;
}

export const text = StyleSheet.create({
  heading: { fontFamily: FONTS.heading, fontSize: 18 },
  title: { fontFamily: FONTS.bodyBold, fontSize: 15 },
  body: { fontFamily: FONTS.body, fontSize: 14, lineHeight: 20 },
  small: { fontFamily: FONTS.body, fontSize: 12, lineHeight: 17 },
  price: { fontFamily: FONTS.heading, fontSize: 16 },
});

const styles = StyleSheet.create({
  field: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: TOUCH + 2, fontFamily: FONTS.body, fontSize: 15 },
  btn: { borderWidth: 1, borderRadius: 22, paddingHorizontal: 16, minHeight: TOUCH, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: FONTS.bodyMedium, fontSize: 14 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
});
