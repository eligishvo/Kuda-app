// Search: who flies, from where, which dates are possible, how long the trip should be, the budget and a few
// options. Every change is saved straight away; the Search button fetches prices and opens the results list.
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { addDays } from '../../shared/dates';
import { airportCodesIn, airportLabel, airportsIn, countriesWithAirports } from '../map/mapData';
import { allowanceText, costText } from '../flights/live';
import { MAX_EXPLORE_CALLS, planCalls } from '../results/results';
import { useResults } from '../results/useResults';
import { selectedAirports } from '../selection/selection';
import { daysText, lengthRange, LIMITS, nightsText, shortDate, travelersText } from '../search/search';
import { useSelection } from '../selection/useSelection';
import { useSearch } from '../search/SearchContext';
import { useTheme } from '../theme/ThemeContext';
import { FONTS, Theme, TOUCH } from '../theme/themes';
import { Calendar } from '../ui/Calendar';
import { Stepper } from '../ui/Stepper';

export default function SearchScreen() {
  const t = useTheme();
  const { search, change } = useSearch();
  const found = useResults();
  const [selection] = useSelection();
  const picked = Object.keys(selection).length;
  // What tapping Search may cost: one Google Explore search per month, nothing when these prices are loaded already
  const loaded = found.status === 'done' && found.results != null && !found.stale && !found.error;
  const searchCost = loaded ? 0 : planCalls(search, selectedAirports(selection, airportCodesIn)).explore.length;
  const [picking, setPicking] = useState(false);
  const [filter, setFilter] = useState('');
  const today = new Date().toISOString().slice(0, 10);

  const countries = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return countriesWithAirports().filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [filter]);
  const country = countriesWithAirports().find((c) => c.cc === search.departureCc);
  const airports = airportsIn(search.departureCc);


  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Text style={[styles.heading, { color: t.text }]}>Who is flying</Text>
      <Stepper theme={t} label="Adults" value={search.adults} min={LIMITS.adults.min} max={LIMITS.adults.max} onChange={(adults) => change({ adults })} />

      <Text style={[styles.heading, { color: t.text }]}>Flying from</Text>
      <Pressable
        onPress={() => setPicking(!picking)}
        accessibilityRole="button"
        style={[styles.field, { backgroundColor: t.chip, borderColor: t.border }]}
      >
        <Text style={[styles.fieldText, { color: t.text }]}>{country?.name ?? search.departureCc}</Text>
        <Text style={[styles.fieldText, { color: t.muted }]}>{picking ? 'Close' : 'Change'}</Text>
      </Pressable>
      {picking && (
        <View style={[styles.picker, { backgroundColor: t.panel, borderColor: t.border }]}>
          <TextInput
            value={filter}
            onChangeText={setFilter}
            placeholder="Search countries"
            placeholderTextColor={t.muted}
            autoCorrect={false}
            style={[styles.input, { backgroundColor: t.chip, borderColor: t.border, color: t.text }]}
          />
          <ScrollView style={styles.countries} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {countries.map((c) => (
              <Pressable
                key={c.cc}
                onPress={() => {
                  // A new country starts from its default airport (the search rules pick it)
                  change({ departureCc: c.cc, departureAirport: '' });
                  setPicking(false);
                  setFilter('');
                }}
                accessibilityRole="button"
                style={[styles.country, { borderColor: t.border }]}
              >
                <Text style={[styles.fieldText, { color: c.cc === search.departureCc ? t.price : t.text }]}>{c.name}</Text>
                <Text style={[styles.small, { color: t.muted }]}>{c.count} {c.count === 1 ? 'airport' : 'airports'}</Text>
              </Pressable>
            ))}
            {countries.length === 0 && <Text style={[styles.small, { color: t.muted, padding: 12 }]}>No country matches.</Text>}
          </ScrollView>
        </View>
      )}
      <Text style={[styles.small, { color: t.muted }]}>Fly from (one airport; every price and live check uses it):</Text>
      <View style={styles.chips}>
        {airports.map((a) => {
          const on = search.departureAirport === a.code;
          return (
            <Pressable
              key={a.code}
              onPress={() => change({ departureAirport: a.code })}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={[styles.chip, { backgroundColor: on ? t.accent : t.chip, borderColor: on ? t.accent : t.border }]}
            >
              <Text style={[styles.chipText, { color: on ? t.buttonText : t.text }]} numberOfLines={1}>{a.city || a.name} ({a.code})</Text>
              {a.city !== '' && <Text style={[styles.small, { color: on ? t.buttonText : t.muted }]} numberOfLines={1}>{a.name}</Text>}
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.heading, { color: t.text }]}>Possible dates</Text>
      <Text style={[styles.body, { color: t.text }]}>
        Leave on or after {shortDate(search.earliestOut)}, back by {shortDate(search.latestRet)}
      </Text>
      <Calendar
        theme={t}
        from={search.earliestOut}
        to={search.latestRet}
        min={today}
        max={addDays(today, LIMITS.horizonDays)}
        onChange={(earliestOut, latestRet) => change({ earliestOut, latestRet })}
      />
      <Text style={[styles.small, { color: t.muted }]}>Prices are only available for about the next six months.</Text>

      <Text style={[styles.heading, { color: t.text }]}>Trip length</Text>
      <Stepper theme={t} label="Shortest" value={search.minNights} text={daysText(search.minNights)} min={LIMITS.nights.min} max={search.maxNights} onChange={(minNights) => change({ minNights })} />
      <Stepper theme={t} label="Longest" value={search.maxNights} text={daysText(search.maxNights)} min={search.minNights} max={LIMITS.nights.max} onChange={(maxNights) => change({ maxNights })} />
      <Stepper
        theme={t}
        label="Flexible by"
        value={search.flexDays}
        text={search.flexDays === 0 ? 'exact' : `± ${daysText(search.flexDays)}`}
        min={0}
        max={LIMITS.flex.max}
        onChange={(flexDays) => change({ flexDays })}
      />
      <Text style={[styles.small, { color: t.muted }]}>
        Counted from the day you leave to the day you come back: 7 → 14 December is 7 days.
        {search.flexDays > 0
          ? ` Trips of ${lengthRange(search).min}–${lengthRange(search).max} days are shown; the ones outside ${search.minNights}–${search.maxNights} are marked.`
          : ''}
      </Text>

      <Text style={[styles.heading, { color: t.text }]}>Budget</Text>
      <Stepper
        theme={t}
        label="Per person, there and back"
        value={search.budget}
        text={`$${search.budget}`}
        min={LIMITS.budget.min}
        max={LIMITS.budget.max}
        step={LIMITS.budget.step}
        onChange={(budget) => change({ budget })}
      />

      <Text style={[styles.heading, { color: t.text }]}>Options</Text>
      <Toggle theme={t} label="Nonstop flights only" value={search.nonstopOnly} onChange={(nonstopOnly) => change({ nonstopOnly })} />
      <Toggle
        theme={t}
        label="Include flying home from a different airport"
        note="Arrive at one airport and return from another one you selected (or a nearby one). Priced as two one-way tickets."
        value={search.mixAirports}
        onChange={(mixAirports) => change({ mixAirports })}
      />

      <Summary theme={t} lines={[
        `From ${airportLabel(search.departureAirport)}`,
        `${shortDate(search.earliestOut)} – ${shortDate(search.latestRet)}, ${nightsText(search)}`,
        `${travelersText(search.adults)}, up to $${search.budget} each${search.adults > 1 ? ` ($${search.budget * search.adults} in total)` : ''}`,
        picked === 0 ? 'Destinations: anywhere (pick countries or airports on the map to narrow it)' : `Destinations: ${picked} ${picked === 1 ? 'country' : 'countries'} picked on the map`,
      ]} />

      <Pressable
        onPress={() => {
          found.run();
          router.push('/results');
        }}
        disabled={found.status === 'loading'}
        accessibilityRole="button"
        style={[styles.go, { backgroundColor: t.accent, opacity: found.status === 'loading' ? 0.6 : 1 }]}
      >
        <Text style={[styles.goText, { color: t.buttonText }]}>{found.status === 'loading' ? 'Searching…' : `Search · ${costText(searchCost)}`}</Text>
      </Pressable>
      <Text style={[styles.small, { color: t.muted }]}>
        One Google search per month in your dates (at most {MAX_EXPLORE_CALLS}); the other price sources are free, and the
        same search within 12 hours is free too.{found.usage ? ` ${allowanceText(found.usage)}.` : ''}
      </Text>
    </ScrollView>
  );
}

function Toggle({ theme: t, label, note, value, onChange }: { theme: Theme; label: string; note?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <View style={styles.toggleText}>
        <Text style={[styles.body, { color: t.text }]}>{label}</Text>
        {note ? <Text style={[styles.small, { color: t.muted }]}>{note}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: t.border, true: t.price }} thumbColor={t.text} accessibilityLabel={label} />
    </View>
  );
}

function Summary({ theme: t, lines }: { theme: Theme; lines: string[] }) {
  return (
    <View style={[styles.summary, { backgroundColor: t.panel, borderColor: t.border }]}>
      <Text style={[styles.small, { color: t.muted }]}>Your search (saved automatically)</Text>
      {lines.map((l) => (
        <Text key={l} style={[styles.body, { color: t.text }]}>{l}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 48, gap: 10 },
  heading: { fontFamily: FONTS.heading, fontSize: 20, marginTop: 14 },
  body: { fontFamily: FONTS.body, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: FONTS.body, fontSize: 12, lineHeight: 17 },
  field: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, minHeight: TOUCH + 4 },
  fieldText: { fontFamily: FONTS.bodyMedium, fontSize: 15 },
  picker: { borderWidth: 1, borderRadius: 14, padding: 10, gap: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, minHeight: TOUCH + 4, fontFamily: FONTS.body, fontSize: 15 },
  countries: { maxHeight: 280 },
  country: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: TOUCH + 2, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6, minHeight: TOUCH, justifyContent: 'center', maxWidth: '100%' },
  chipText: { fontFamily: FONTS.bodyBold, fontSize: 15 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: TOUCH + 4 },
  toggleText: { flex: 1 },
  go: { borderRadius: 26, minHeight: TOUCH + 8, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  goText: { fontFamily: FONTS.bodyBold, fontSize: 17 },
  summary: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 4, marginTop: 16 },
});
