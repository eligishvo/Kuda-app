// Settings: pick a theme, report a problem (goes to High Command), and see which version is installed.
import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { buildReport, checkReport, LIMITS, REPORT_PRIVACY, sendReport } from '../report/report';
import { useSetTheme, useTheme } from '../theme/ThemeContext';
import { FONTS, Theme, THEME_IDS, THEMES, TOUCH } from '../theme/themes';

const RELAY: string = Constants.expoConfig?.extra?.highCommand?.reportUrl ?? '';
const VERSION = Constants.expoConfig?.version ?? '?';

export default function Settings() {
  const t = useTheme();
  const setTheme = useSetTheme();
  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Text style={[styles.heading, { color: t.text }]}>Theme</Text>
      <View style={styles.themes}>
        {THEME_IDS.map((id) => {
          const option = THEMES[id];
          const on = option.id === t.id;
          return (
            <Pressable
              key={id}
              onPress={() => setTheme(id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={[styles.theme, { backgroundColor: option.panel, borderColor: on ? t.accent : t.border }]}
            >
              <Swatch theme={option} />
              <Text style={[styles.themeName, { color: option.text }]}>{option.name}</Text>
              <Text style={[styles.themeOn, { color: option.muted }]}>{on ? 'Selected' : ' '}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.heading, { color: t.text }]}>Report a problem</Text>
      <ReportForm theme={t} />

      <Text style={[styles.heading, { color: t.text }]}>Developer</Text>
      <Pressable
        onPress={() => router.push('/debug')}
        accessibilityRole="button"
        style={[styles.link, { backgroundColor: t.chip, borderColor: t.border }]}
      >
        <Text style={[styles.linkText, { color: t.text }]}>Flight data (debug)</Text>
        <Text style={[styles.linkText, { color: t.muted }]}>›</Text>
      </Pressable>

      <Text style={[styles.heading, { color: t.text }]}>About</Text>
      <Text style={[styles.body, { color: t.muted }]}>
        Kuda {VERSION}
        {Updates.updateId ? ` · update ${Updates.updateId.slice(0, 8)}` : ''}
      </Text>
      <Text style={[styles.body, { color: t.muted }]}>
        Borders: Natural Earth. Airports: OurAirports. Both are public domain.
      </Text>
    </ScrollView>
  );
}

/** A tiny picture of a theme: sea, land, a selected country and the accent colour. */
function Swatch({ theme: o }: { theme: Theme }) {
  return (
    <View style={[styles.swatch, { backgroundColor: o.seaLight, borderColor: o.rim }]}>
      <View style={[styles.swatchLand, { backgroundColor: o.land }]} />
      <View style={[styles.swatchSelected, { backgroundColor: o.selectedFill }]} />
      <View style={[styles.swatchDot, { backgroundColor: o.accent }]} />
    </View>
  );
}

function ReportForm({ theme: t }: { theme: Theme }) {
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (!RELAY) return <Text style={[styles.body, { color: t.muted }]}>Reporting isn't set up in this build.</Text>;

  const send = async () => {
    const problem = checkReport({ title, details });
    if (problem) {
      setMessage({ ok: false, text: problem });
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await sendReport(
      RELAY,
      buildReport(
        { title, details },
        {
          screen: '/settings',
          where: 'Settings',
          steps: ['⚙ (top right of the map)'],
          version: VERSION,
          updateId: Updates.updateId,
          platform: Platform.OS,
        },
      ),
    );
    setBusy(false);
    if (result.ok) {
      setTitle('');
      setDetails('');
      setMessage({ ok: true, text: result.ticket ? `Sent. Ticket #${result.ticket}.` : 'Sent. Thank you.' });
    } else {
      setMessage({ ok: false, text: result.error });
    }
  };

  const input = [styles.input, { backgroundColor: t.chip, borderColor: t.border, color: t.text }];
  return (
    <View style={styles.form}>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="What went wrong? (short title)"
        placeholderTextColor={t.muted}
        maxLength={LIMITS.title}
        style={input}
      />
      <TextInput
        value={details}
        onChangeText={setDetails}
        placeholder="Details: what you did, what you expected (optional)"
        placeholderTextColor={t.muted}
        maxLength={LIMITS.details}
        multiline
        style={[input, styles.details]}
      />
      <Pressable
        onPress={send}
        disabled={busy}
        accessibilityRole="button"
        style={[styles.send, { backgroundColor: t.accent, opacity: busy ? 0.6 : 1 }]}
      >
        <Text style={[styles.sendText, { color: t.buttonText }]}>{busy ? 'Sending…' : 'Send report'}</Text>
      </Pressable>
      {message && <Text style={[styles.body, { color: message.ok ? t.text : t.price }]}>{message.text}</Text>}
      <Text style={[styles.small, { color: t.muted }]}>{REPORT_PRIVACY}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 48, gap: 10 },
  heading: { fontFamily: FONTS.heading, fontSize: 20, marginTop: 14 },
  body: { fontFamily: FONTS.body, fontSize: 14, lineHeight: 20 },
  small: { fontFamily: FONTS.body, fontSize: 12, lineHeight: 17 },
  themes: { flexDirection: 'row', gap: 10 },
  theme: { flex: 1, borderWidth: 2, borderRadius: 16, padding: 12, alignItems: 'center', gap: 8, minHeight: TOUCH },
  themeName: { fontFamily: FONTS.bodyBold, fontSize: 14 },
  themeOn: { fontFamily: FONTS.body, fontSize: 12 },
  swatch: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, overflow: 'hidden' },
  swatchLand: { position: 'absolute', left: 8, top: 12, width: 30, height: 22, borderRadius: 8 },
  swatchSelected: { position: 'absolute', left: 26, top: 28, width: 18, height: 14, borderRadius: 5 },
  swatchDot: { position: 'absolute', left: 14, top: 38, width: 8, height: 8, borderRadius: 4 },
  link: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, minHeight: TOUCH + 4 },
  linkText: { fontFamily: FONTS.bodyMedium, fontSize: 15 },
  form: { gap: 10 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, minHeight: TOUCH + 4, fontFamily: FONTS.body, fontSize: 15 },
  details: { minHeight: 110, paddingTop: 12, textAlignVertical: 'top' },
  send: { borderRadius: 24, minHeight: TOUCH + 4, alignItems: 'center', justifyContent: 'center' },
  sendText: { fontFamily: FONTS.bodyBold, fontSize: 16 },
});
