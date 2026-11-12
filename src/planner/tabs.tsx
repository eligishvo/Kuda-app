// The four working tabs of a trip: the day-by-day plan, where to stay, the budget, and the checklist with
// notes. Each gets the trip and a `change` function; the rules live in trip.ts.
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { nightsBetween } from '../../shared/dates';
import { clock } from '../flights/flights';
import { airportLabel } from '../map/mapData';
import { daysText, shortDate, travelersText } from '../search/search';
import { Theme, TOUCH } from '../theme/themes';
import { Calendar } from '../ui/Calendar';
import { Btn, Card, Field, text } from './parts';
import {
  addCheck, budgetOf, Cost, dayLabel, daysOf, newId, nightsWithoutStay, parseAmount, parseTime, PlanItem, removeCheck, removeCost,
  removeItem, removeStay, saveCost, saveItem, saveStay, Stay, toggleCheck, Trip, tripDates,
} from './trip';

type TabProps = { theme: Theme; trip: Trip; change: (fn: (prev: Trip) => Trip) => void };
const money = (n: number) => `$${Math.round(n * 100) / 100}`;

// ---------------------------------------------------------------- Plan

export function PlanTab({ theme: t, trip, change }: TabProps) {
  /** The item being added or edited: which day, and the item's id (new items get one when saved). */
  const [editing, setEditing] = useState<{ day: string; id: string | null } | null>(null);
  const [form, setForm] = useState({ time: '', title: '', note: '', cost: '' });
  const [problem, setProblem] = useState('');
  const days = daysOf(trip);
  const { arrive, leave } = tripDates(trip.flights);
  const out = trip.flights.outbound.legs;
  const back = trip.flights.inbound.legs;

  const start = (day: string, item?: PlanItem) => {
    setEditing({ day, id: item?.id ?? null });
    setForm({ time: item?.time ?? '', title: item?.title ?? '', note: item?.note ?? '', cost: item?.cost != null ? String(item.cost) : '' });
    setProblem('');
  };
  const saveForm = () => {
    if (!editing) return;
    if (!form.title.trim()) return setProblem('Give it a name.');
    if (form.time.trim() && !parseTime(form.time)) return setProblem('Write the time like 9:30 or 17:00.');
    if (form.cost.trim() && parseAmount(form.cost) == null) return setProblem('Write the cost as a number, like 40.');
    const item: PlanItem = { id: editing.id ?? newId(), title: form.title.trim(), time: parseTime(form.time), note: form.note.trim() || undefined, cost: parseAmount(form.cost) };
    change((p) => saveItem(p, editing.day, item));
    setEditing(null);
  };

  return (
    <View style={styles.tab}>
      {days.map((day, i) => {
        const items = trip.days[day] ?? [];
        const open = editing?.day === day;
        return (
          <Card key={day} theme={t}>
            <View style={styles.rowBetween}>
              <Text style={[text.title, { color: t.text }]}>{dayLabel(day)}</Text>
              <Text style={[text.small, { color: t.muted }]}>Day {i + 1}</Text>
            </View>
            {day === arrive && (
              <Text style={[text.small, { color: t.price }]}>
                Land {clock(out[out.length - 1].arrives)} at {airportLabel(trip.flights.destination)}
              </Text>
            )}
            {day === leave && (
              <Text style={[text.small, { color: t.price }]}>
                Fly home {clock(back[0].departs)} from {airportLabel(trip.flights.returnFrom)}
              </Text>
            )}
            {items.map((it) => (
              <Pressable key={it.id} onPress={() => start(day, it)} accessibilityRole="button" style={[styles.item, { borderColor: t.border }]}>
                <Text style={[text.title, styles.time, { color: it.time ? t.text : t.muted }]}>{it.time ?? '—'}</Text>
                <View style={styles.flex}>
                  <Text style={[text.body, { color: t.text }]}>{it.title}</Text>
                  {it.note ? <Text style={[text.small, { color: t.muted }]}>{it.note}</Text> : null}
                </View>
                {it.cost != null && <Text style={[text.small, { color: t.price }]}>{money(it.cost)}</Text>}
              </Pressable>
            ))}
            {open ? (
              <View style={styles.form}>
                <View style={styles.row}>
                  <Field theme={t} value={form.time} onChangeText={(time) => setForm({ ...form, time })} placeholder="Time" keyboardType="numbers-and-punctuation" style={styles.short} />
                  <Field theme={t} value={form.title} onChangeText={(title) => setForm({ ...form, title })} placeholder="What (e.g. Acropolis)" style={styles.flex} autoFocus />
                </View>
                <View style={styles.row}>
                  <Field theme={t} value={form.note} onChangeText={(note) => setForm({ ...form, note })} placeholder="Note (optional)" style={styles.flex} />
                  <Field theme={t} value={form.cost} onChangeText={(cost) => setForm({ ...form, cost })} placeholder="Cost $" keyboardType="decimal-pad" style={styles.short} />
                </View>
                {problem ? <Text style={[text.small, { color: t.price }]}>{problem}</Text> : null}
                <View style={styles.row}>
                  <Btn theme={t} kind="main" label="Save" onPress={saveForm} />
                  <Btn theme={t} label="Cancel" onPress={() => setEditing(null)} />
                  {editing?.id && (
                    <Btn theme={t} kind="quiet" label="Delete" onPress={() => { change((p) => removeItem(p, day, editing.id as string)); setEditing(null); }} />
                  )}
                </View>
              </View>
            ) : (
              <Btn theme={t} label="+ Add to this day" onPress={() => start(day)} />
            )}
          </Card>
        );
      })}
      {days.length === 0 && <Text style={[text.body, { color: t.muted }]}>The flights have no dates, so there are no days to plan.</Text>}
      <Text style={[text.small, { color: t.muted }]}>Costs you enter here are for everyone together and are added to the budget.</Text>
    </View>
  );
}

// ---------------------------------------------------------------- Stay

export function StayTab({ theme: t, trip, change }: TabProps) {
  const { arrive, leave } = tripDates(trip.flights);
  const [editing, setEditing] = useState<string | null>(null); // a stay's id, or 'new'
  const [form, setForm] = useState({ name: '', checkIn: arrive, checkOut: leave, price: '', note: '' });
  const [problem, setProblem] = useState('');
  const uncovered = nightsWithoutStay(trip);

  const start = (s?: Stay) => {
    // A new stay starts on the first night that has nowhere to sleep yet
    const from = s?.checkIn ?? uncovered[0] ?? arrive;
    setEditing(s?.id ?? 'new');
    setForm({ name: s?.name ?? '', checkIn: from, checkOut: s?.checkOut ?? leave, price: s?.price != null ? String(s.price) : '', note: s?.note ?? '' });
    setProblem('');
  };
  const saveForm = () => {
    if (!form.name.trim()) return setProblem('Give the place a name.');
    if (form.price.trim() && parseAmount(form.price) == null) return setProblem('Write the price as a number, like 420.');
    const stay: Stay = { id: editing && editing !== 'new' ? editing : newId(), name: form.name.trim(), checkIn: form.checkIn, checkOut: form.checkOut, price: parseAmount(form.price), note: form.note.trim() || undefined };
    change((p) => saveStay(p, stay));
    setEditing(null);
  };

  return (
    <View style={styles.tab}>
      {uncovered.length > 0 ? (
        <Text style={[text.body, { color: t.price }]}>
          {uncovered.length === 1 ? '1 night has' : `${uncovered.length} nights have`} nowhere to stay yet: {uncovered.slice(0, 4).map(shortDate).join(', ')}{uncovered.length > 4 ? '…' : ''}
        </Text>
      ) : (
        trip.stays.length > 0 && <Text style={[text.body, { color: t.muted }]}>Every night has a place to stay.</Text>
      )}
      {trip.stays.map((s) => (
        <Pressable key={s.id} onPress={() => start(s)} accessibilityRole="button">
          <Card theme={t}>
            <View style={styles.rowBetween}>
              <Text style={[text.title, styles.flex, { color: t.text }]}>{s.name}</Text>
              {s.price != null && <Text style={[text.price, { color: t.price }]}>{money(s.price)}</Text>}
            </View>
            <Text style={[text.small, { color: t.muted }]}>
              {shortDate(s.checkIn)} – {shortDate(s.checkOut)} · {nightsBetween(s.checkIn, s.checkOut)} {nightsBetween(s.checkIn, s.checkOut) === 1 ? 'night' : 'nights'}
              {s.price != null ? ` · ${money(s.price / nightsBetween(s.checkIn, s.checkOut))} a night` : ''}
            </Text>
            {s.note ? <Text style={[text.small, { color: t.muted }]}>{s.note}</Text> : null}
          </Card>
        </Pressable>
      ))}
      {editing ? (
        <Card theme={t}>
          <Field theme={t} value={form.name} onChangeText={(name) => setForm({ ...form, name })} placeholder="Name (hotel, apartment, friend's place)" autoFocus />
          <Text style={[text.small, { color: t.muted }]}>Check in {shortDate(form.checkIn)}, check out {shortDate(form.checkOut)}</Text>
          <Calendar theme={t} from={form.checkIn} to={form.checkOut} min={arrive} max={leave} onChange={(checkIn, checkOut) => setForm({ ...form, checkIn, checkOut })} />
          <Field theme={t} value={form.price} onChangeText={(price) => setForm({ ...form, price })} placeholder="Total price for the stay, for everyone ($)" keyboardType="decimal-pad" />
          <Field theme={t} value={form.note} onChangeText={(note) => setForm({ ...form, note })} placeholder="Note: address, booking number (optional)" />
          {problem ? <Text style={[text.small, { color: t.price }]}>{problem}</Text> : null}
          <View style={styles.row}>
            <Btn theme={t} kind="main" label="Save" onPress={saveForm} />
            <Btn theme={t} label="Cancel" onPress={() => setEditing(null)} />
            {editing !== 'new' && <Btn theme={t} kind="quiet" label="Delete" onPress={() => { change((p) => removeStay(p, editing)); setEditing(null); }} />}
          </View>
        </Card>
      ) : (
        <Btn theme={t} label="+ Add a place to stay" onPress={() => start()} />
      )}
      <Text style={[text.small, { color: t.muted }]}>This records what you booked or are considering; the app doesn't search hotels.</Text>
    </View>
  );
}

// ---------------------------------------------------------------- Budget

export function BudgetTab({ theme: t, trip, change }: TabProps) {
  const b = budgetOf(trip);
  const adults = trip.flights.adults;
  const [flights, setFlights] = useState(String(trip.flightsCost));
  const [form, setForm] = useState<{ label: string; amount: string; perPerson: boolean } | null>(null);
  const [problem, setProblem] = useState('');

  const saveCostForm = () => {
    if (!form) return;
    const amount = parseAmount(form.amount);
    if (!form.label.trim()) return setProblem('Say what the cost is for.');
    if (amount == null) return setProblem('Write the amount as a number, like 150.');
    const cost: Cost = { id: newId(), label: form.label.trim(), amount, perPerson: form.perPerson };
    change((p) => saveCost(p, cost));
    setForm(null);
    setProblem('');
  };

  return (
    <View style={styles.tab}>
      <Card theme={t}>
        <Line theme={t} label="Flights" value={money(b.flights)} />
        <Line theme={t} label={`Places to stay (${trip.stays.length})`} value={money(b.stays)} />
        <Line theme={t} label="Activities in the plan" value={money(b.activities)} />
        <Line theme={t} label="Other costs" value={money(b.other)} />
        <View style={[styles.totalLine, { borderColor: t.border }]}>
          <Text style={[text.title, { color: t.text }]}>Total for {travelersText(adults)}</Text>
          <Text style={[text.heading, { color: t.price }]}>{money(b.total)}</Text>
        </View>
        {adults > 1 && <Line theme={t} label="Per person" value={money(b.perPerson)} />}
      </Card>

      <Card theme={t}>
        <Text style={[text.title, { color: t.text }]}>Flights cost, for everyone</Text>
        <View style={styles.row}>
          <Field
            theme={t}
            value={flights}
            onChangeText={(v) => {
              setFlights(v);
              const n = parseAmount(v);
              if (n != null) change((p) => ({ ...p, flightsCost: n }));
            }}
            keyboardType="decimal-pad"
            style={styles.flex}
          />
        </View>
        <Text style={[text.small, { color: t.muted }]}>
          Starts from the price Google showed when you chose the flights{trip.flights.price != null ? ` ($${trip.flights.price})` : ''}.
          {adults > 1 ? ' Check whether that was per person or for everyone, and correct it here.' : ''} Add bags and seats if you pay for them.
        </Text>
      </Card>

      <Text style={[text.heading, { color: t.text }]}>Other costs</Text>
      {trip.costs.map((c) => (
        <View key={c.id} style={[styles.item, { borderColor: t.border }]}>
          <View style={styles.flex}>
            <Text style={[text.body, { color: t.text }]}>{c.label}</Text>
            <Text style={[text.small, { color: t.muted }]}>{c.perPerson ? `${money(c.amount)} each × ${adults}` : 'for everyone'}</Text>
          </View>
          <Text style={[text.price, { color: t.price }]}>{money(c.amount * (c.perPerson ? adults : 1))}</Text>
          <Btn theme={t} kind="quiet" label="✕" onPress={() => change((p) => removeCost(p, c.id))} />
        </View>
      ))}
      {form ? (
        <Card theme={t}>
          <Field theme={t} value={form.label} onChangeText={(label) => setForm({ ...form, label })} placeholder="What for (food, car, transfers…)" autoFocus />
          <Field theme={t} value={form.amount} onChangeText={(amount) => setForm({ ...form, amount })} placeholder="Amount ($)" keyboardType="decimal-pad" />
          <View style={styles.rowBetween}>
            <Text style={[text.body, { color: t.text }]}>This amount is per person</Text>
            <Switch value={form.perPerson} onValueChange={(perPerson) => setForm({ ...form, perPerson })} trackColor={{ false: t.border, true: t.price }} thumbColor={t.text} />
          </View>
          {problem ? <Text style={[text.small, { color: t.price }]}>{problem}</Text> : null}
          <View style={styles.row}>
            <Btn theme={t} kind="main" label="Add" onPress={saveCostForm} />
            <Btn theme={t} label="Cancel" onPress={() => { setForm(null); setProblem(''); }} />
          </View>
        </Card>
      ) : (
        <Btn theme={t} label="+ Add a cost" onPress={() => setForm({ label: '', amount: '', perPerson: false })} />
      )}
      <Text style={[text.small, { color: t.muted }]}>
        {daysText(Math.max(1, daysOf(trip).length - 1))} away. Stays and activity costs come from the other tabs.
      </Text>
    </View>
  );
}

function Line({ theme: t, label, value }: { theme: Theme; label: string; value: string }) {
  return (
    <View style={styles.rowBetween}>
      <Text style={[text.body, { color: t.muted }]}>{label}</Text>
      <Text style={[text.body, { color: t.text }]}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------- Checklist and notes

export function ChecklistTab({ theme: t, trip, change }: TabProps) {
  const [typed, setTyped] = useState('');
  const done = trip.checklist.filter((c) => c.done).length;
  const add = () => {
    change((p) => addCheck(p, typed));
    setTyped('');
  };
  return (
    <View style={styles.tab}>
      <Text style={[text.small, { color: t.muted }]}>{done} of {trip.checklist.length} done</Text>
      {trip.checklist.map((c) => (
        <View key={c.id} style={[styles.item, { borderColor: t.border }]}>
          <Pressable
            onPress={() => change((p) => toggleCheck(p, c.id))}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: c.done }}
            style={styles.checkRow}
          >
            <View style={[styles.box, { borderColor: c.done ? t.accent : t.border, backgroundColor: c.done ? t.accent : 'transparent' }]}>
              {c.done && <Text style={[styles.tick, { color: t.buttonText }]}>✓</Text>}
            </View>
            <Text style={[text.body, styles.flex, { color: c.done ? t.muted : t.text, textDecorationLine: c.done ? 'line-through' : 'none' }]}>{c.text}</Text>
          </Pressable>
          <Btn theme={t} kind="quiet" label="✕" onPress={() => change((p) => removeCheck(p, c.id))} />
        </View>
      ))}
      <View style={styles.row}>
        <Field theme={t} value={typed} onChangeText={setTyped} placeholder="Add to the list" onSubmitEditing={add} returnKeyType="done" style={styles.flex} />
        <Btn theme={t} kind="main" label="Add" onPress={add} disabled={!typed.trim()} />
      </View>

      <Text style={[text.heading, { color: t.text, marginTop: 10 }]}>Notes</Text>
      <Field
        theme={t}
        value={trip.notes}
        onChangeText={(notes) => change((p) => ({ ...p, notes }))}
        placeholder="Booking numbers, addresses, ideas…"
        multiline
        style={styles.notes}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tab: { gap: 10 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  form: { gap: 8 },
  short: { width: 92 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: TOUCH, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
  time: { width: 48 },
  totalLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, marginTop: 2 },
  checkRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: TOUCH },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  tick: { fontSize: 14, fontWeight: '700', lineHeight: 18 },
  notes: { minHeight: 140, paddingTop: 12, textAlignVertical: 'top' },
});
