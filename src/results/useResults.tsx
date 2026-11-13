// Runs a price search and shares what it found between the map, the results list and the destination screen.
// Searches only start when the user asks (each Google Explore call uses one of the day's searches).
import { createContext, ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Destination, OneWay, Usage } from '../../shared/types';
import { api, Connection } from '../api/client';
import { live } from '../flights/live';
import { useAllowance } from '../flights/useAllowance';
import { airportByCode, airportCodesIn } from '../map/mapData';
import { Search } from '../search/search';
import { useSearch } from '../search/SearchContext';
import { selectedAirports } from '../selection/selection';
import { useSelection } from '../selection/useSelection';
import { KEYS, load } from '../storage/store';
import {
  asDestinations, buildMixed, buildOptions, buildResults, buildSameAirport, mergeOptions, Missing, missingDestinations, Option, planCalls, Results,
} from './results';

type Raw = { explore: Destination[][]; estimates: Destination[][]; outs: OneWay[][]; backs: OneWay[][]; key: string };

/** Two searches with the same key need the same Worker calls (same origin, months, trip length, destinations). */
const callsKey = (s: Search, selected: string[]) => JSON.stringify([s.departureAirports[0], planCalls(s, selected)]);

/** Runs jobs a few at a time (the free calls), so a search with many airports doesn't take too long. */
async function inBatches<T>(jobs: (() => Promise<T>)[], size: number): Promise<void> {
  for (let i = 0; i < jobs.length; i += size) await Promise.all(jobs.slice(i, i + size).map((j) => j()));
}

export type ResultsState = {
  status: 'idle' | 'loading' | 'done';
  /** e.g. "Checking prices 2 of 5" while loading. */
  progress: string;
  /** Something went wrong (results may still be partly filled). */
  error: string | null;
  usage: Usage | null;
  /** For the map: the best price per destination, within budget. */
  results: Results | null;
  /** For the list: every dated option, including two-ticket trips and trips that return from another airport. */
  options: Option[];
  /** Selected airports with nothing that fits, with the closest price found and why it doesn't fit. */
  missing: Missing[];
  /** True when the dates, trip length or departure changed since these prices were fetched. */
  stale: boolean;
  /** Every price list that was fetched (Google's first), for suggesting dates to check live. */
  lists: Destination[][];
  run: () => void;
};

const Ctx = createContext<ResultsState | null>(null);

export function ResultsProvider({ children }: { children: ReactNode }) {
  const { search } = useSearch();
  const [selection] = useSelection();
  const selected = useMemo(() => selectedAirports(selection, airportCodesIn), [selection]);
  const [status, setStatus] = useState<ResultsState['status']>('idle');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  // The Worker's own count of today's searches, shared with every screen (reading it is free)
  const usage = useAllowance();
  const [raw, setRaw] = useState<Raw | null>(null);
  const running = useRef(false);

  const run = useCallback(async () => {
    if (running.current) return;
    // The same search again reuses what was loaded: no Worker calls at all
    if (raw && raw.key === callsKey(search, selected) && !error) return;
    running.current = true;
    setStatus('loading');
    setError(null);
    const conn = await load<Connection | null>(KEYS.connection, null);
    if (!conn?.url || !conn?.token) {
      setError('Flight data isn’t set up yet: open Settings → Flight data (debug) and save the Worker address and app token.');
      setStatus('done');
      running.current = false;
      return;
    }
    const plan = planCalls(search, selected);
    // Prices are asked from the first departure airport, for one adult (so they are per person)
    const origin = search.departureAirports[0];
    const explore: Destination[][] = [];
    const estimates: Destination[][] = [];
    const outs: OneWay[][] = [];
    const backs: OneWay[][] = [];
    let problem: string | null = null;
    const note = (r: { ok: boolean; error?: string; usage?: Usage }) => {
      if (!r.ok) problem = problem ?? r.error ?? 'A price check failed.';
      live.noteUsage(r.usage);
    };
    // Free calls (Travelpayouts): to everywhere, then each selected airport on its own
    const free: (() => Promise<void>)[] = [];
    const addEstimates = (e: { from: string; to: string }, dest?: string) =>
      free.push(async () => {
        const r = await api.estimates(conn, { origin, from: e.from, to: e.to, dest });
        if (r.ok) estimates.push(r.data);
        note(r);
      });
    const addOneWays = (e: { month: string; dir: 'out' | 'back' }, dest?: string) =>
      free.push(async () => {
        const r = await api.oneWays(conn, { origin, month: e.month, dir: e.dir, dest });
        if (r.ok) (e.dir === 'out' ? outs : backs).push(r.data);
        note(r);
      });
    plan.estimates.forEach((e) => addEstimates(e));
    plan.oneWays.forEach((e) => addOneWays(e));
    for (const route of plan.routes) {
      route.estimates.forEach((e) => addEstimates(e, route.dest));
      route.oneWays.forEach((e) => addOneWays(e, route.dest));
    }
    const total = free.length + plan.explore.length;
    let step = 0;
    const tick = () => setProgress(`Checking prices ${++step} of ${total}`);
    await inBatches(free.map((job) => async () => { await job(); tick(); }), 4);
    // Then the Google Explore calls, which count against the daily limit
    for (const e of plan.explore) {
      tick();
      const r = await api.explore(conn, { origin, month: e.month, duration: e.duration });
      if (r.ok) explore.push(r.data);
      note(r);
    }
    setRaw({ explore, estimates, outs, backs, key: callsKey(search, selected) });
    setError(problem);
    setProgress('');
    setStatus('done');
    running.current = false;
  }, [search, selected, raw, error]);

  // Changing the budget or filters re-filters what was fetched without a new search
  const same = useMemo(() => (raw ? buildSameAirport(search, selected, raw.outs, raw.backs, airportByCode) : []), [raw, search, selected]);
  const results = useMemo(
    () => (raw ? buildResults(search, selected, raw.explore, [...raw.estimates, asDestinations(same)], airportByCode) : null),
    [raw, search, selected, same],
  );
  const options = useMemo(
    () =>
      raw
        ? mergeOptions([
            buildOptions(search, selected, raw.explore, raw.estimates, airportByCode),
            same,
            buildMixed(search, selected, raw.outs, raw.backs, airportByCode),
          ])
        : [],
    [raw, search, selected, same],
  );
  const lists = useMemo(() => (raw ? [...raw.explore, ...raw.estimates] : []), [raw]);
  const missing = useMemo(() => (raw ? missingDestinations(search, selected, lists, options, airportByCode) : []), [raw, search, selected, lists, options]);
  const stale = raw != null && raw.key !== callsKey(search, selected);

  const value = useMemo(
    () => ({ status, progress, error, usage, results, options, missing, stale, lists, run }),
    [status, progress, error, usage, results, options, missing, stale, lists, run],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useResults(): ResultsState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useResults must be used inside ResultsProvider');
  return v;
}
