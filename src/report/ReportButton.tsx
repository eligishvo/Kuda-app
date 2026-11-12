// The report button shown on every screen: opens the report form and tells it which screen you were on.
import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { FONTS, TOUCH } from '../theme/themes';

/** `round` draws it as a floating circle (on the map); otherwise it sits in a screen's header. */
export function ReportButton({ round }: { round?: boolean }) {
  const t = useTheme();
  const from = usePathname();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/report', params: { from } })}
      accessibilityRole="button"
      accessibilityLabel="Report a problem"
      hitSlop={round ? 0 : 6}
      style={[styles.base, round ? [styles.round, { backgroundColor: t.panel, borderColor: t.border }] : styles.header]}
    >
      <Text style={[styles.mark, { color: t.text }]}>!</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  round: { width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, borderWidth: 1 },
  header: { width: TOUCH, height: TOUCH },
  mark: { fontFamily: FONTS.heading, fontSize: 20 },
});
