// The "Report a problem" form: a short title and optional details, sent to High Command as a ticket for Kuda.
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { FONTS, Theme, TOUCH } from '../theme/themes';
import { buildReport, checkReport, LIMITS, REPORT_PRIVACY, sendReport, whereOf } from './report';

const RELAY: string = Constants.expoConfig?.extra?.highCommand?.reportUrl ?? '';
const VERSION = Constants.expoConfig?.version ?? '?';

/** `screen` is the route the report is about (where the button was pressed). */
export function ReportForm({ theme: t, screen }: { theme: Theme; screen: string }) {
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
      buildReport({ title, details }, { screen, where: whereOf(screen), version: VERSION, updateId: Updates.updateId, platform: Platform.OS }),
    );
    setBusy(false);
    if (result.ok) {
      setTitle('');
      setDetails('');
      setMessage({ ok: true, text: result.ticket ? `Sent. Ticket #${result.ticket} is in High Command.` : 'Sent. Thank you.' });
    } else {
      setMessage({ ok: false, text: result.error });
    }
  };

  const input = [styles.input, { backgroundColor: t.chip, borderColor: t.border, color: t.text }];
  return (
    <View style={styles.form}>
      <Text style={[styles.small, { color: t.muted }]}>About: {whereOf(screen)}</Text>
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
        <Text style={[styles.sendText, { color: t.buttonText }]}>{busy ? 'Sending…' : 'Send to High Command'}</Text>
      </Pressable>
      {message && <Text style={[styles.body, { color: message.ok ? t.text : t.price }]}>{message.text}</Text>}
      <Text style={[styles.small, { color: t.muted }]}>{REPORT_PRIVACY}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 10 },
  body: { fontFamily: FONTS.body, fontSize: 14, lineHeight: 20 },
  small: { fontFamily: FONTS.body, fontSize: 12, lineHeight: 17 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, minHeight: TOUCH + 4, fontFamily: FONTS.body, fontSize: 15 },
  details: { minHeight: 110, paddingTop: 12, textAlignVertical: 'top' },
  send: { borderRadius: 24, minHeight: TOUCH + 4, alignItems: 'center', justifyContent: 'center' },
  sendText: { fontFamily: FONTS.bodyBold, fontSize: 16 },
});
