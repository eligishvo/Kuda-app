// Report a problem: sends a ticket to High Command, noting which screen the button was pressed on.
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { ReportForm } from '../report/ReportForm';
import { useTheme } from '../theme/ThemeContext';
import { FONTS } from '../theme/themes';

export default function ReportScreen() {
  const t = useTheme();
  const { from } = useLocalSearchParams<{ from?: string }>();
  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Text style={[styles.body, { color: t.muted }]}>
        Tell High Command what went wrong. The ticket is filed under Kuda with the screen you came from.
      </Text>
      <ReportForm theme={t} screen={typeof from === 'string' && from ? from : '/'} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 48, gap: 12 },
  body: { fontFamily: FONTS.body, fontSize: 14, lineHeight: 20 },
});
