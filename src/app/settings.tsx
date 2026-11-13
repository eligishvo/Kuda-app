// Settings: pick a theme, report a problem (goes to High Command), and see which version is installed.
import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { LIMITS as TRIP_LIMITS } from '../search/search';
import { useSearch } from '../search/SearchContext';
import { KEYS, load, save } from '../storage/store';
import { useSetTheme, useTheme } from '../theme/ThemeContext';
import { FONTS, Theme, THEME_IDS, THEMES, TOUCH } from '../theme/themes';
import { Stepper } from '../ui/Stepper';

const VERSION = Constants.expoConfig?.version ?? '?';

export default function Settings() {
  const t = useTheme();
  const setTheme = useSetTheme();
  const { search, change } = useSearch();
  const [countReturns, setCountReturns] = useState(false);
  useEffect(() => {
    load<boolean>(KEYS.countReturns, false).then((v) => setCountReturns(v === true));
  }, []);
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
      <Pressable
        onPress={() => router.push({ pathname: '/report', params: { from: '/settings' } })}
        accessibilityRole="button"
        style={[styles.link, { backgroundColor: t.chip, borderColor: t.border }]}
      >
        <Text style={[styles.linkText, { color: t.text }]}>Send a report to High Command</Text>
        <Text style={[styles.linkText, { color: t.muted }]}>›</Text>
      </Pressable>
      <Text style={[styles.small, { color: t.muted }]}>The "!" button at the top of every screen does the same.</Text>

      <Text style={[styles.heading, { color: t.text }]}>Trip</Text>
      {/* The same number as in Trip details: prices are checked for this many adults */}
      <Stepper theme={t} label="Adults" value={search.adults} min={TRIP_LIMITS.adults.min} max={TRIP_LIMITS.adults.max} onChange={(adults) => change({ adults })} />
      <View style={styles.setting}>
        <View style={styles.settingText}>
          <Text style={[styles.linkText, { color: t.text }]}>Count return flights for every outbound flight</Text>
          <Text style={[styles.small, { color: t.muted }]}>
            Off: counted for the first outbound flight of each date, the rest when you ask. On: counted for the first
            five of each date as soon as a destination opens (about 15 more searches per destination).
          </Text>
        </View>
        <Switch
          value={countReturns}
          onValueChange={(v) => {
            setCountReturns(v);
            save(KEYS.countReturns, v);
          }}
          trackColor={{ false: t.border, true: t.price }}
          thumbColor={t.text}
          accessibilityLabel="Count return flights for every outbound flight"
        />
      </View>
      <Pressable
        onPress={() => router.push('/planner')}
        accessibilityRole="button"
        style={[styles.link, { backgroundColor: t.chip, borderColor: t.border }]}
      >
        <Text style={[styles.linkText, { color: t.text }]}>My trips (planner)</Text>
        <Text style={[styles.linkText, { color: t.muted }]}>›</Text>
      </Pressable>

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
        Borders: Natural Earth. Airports: OurAirports (both public domain). City names: OpenFlights (Open Database License).
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
  setting: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingText: { flex: 1, gap: 2 },
  link: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, minHeight: TOUCH + 4 },
  linkText: { fontFamily: FONTS.bodyMedium, fontSize: 15 },
  form: { gap: 10 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, minHeight: TOUCH + 4, fontFamily: FONTS.body, fontSize: 15 },
  details: { minHeight: 110, paddingTop: 12, textAlignVertical: 'top' },
  send: { borderRadius: 24, minHeight: TOUCH + 4, alignItems: 'center', justifyContent: 'center' },
  sendText: { fontFamily: FONTS.bodyBold, fontSize: 16 },
});
