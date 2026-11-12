// Runs a price search and shares what it found between the map, the results list and the destination screen.
// Searches only start when the user asks (each Google Explore call uses one of the day's searches).
import { createContext, ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Destination, OneWay, Usage } from '../../shared/types';
import { api, Connection } from '../api/client';
import { airportByCode, airportCodesIn } from '../map/mapData';
import { Search } from '../search/search';
import { useSearch } from '../search/SearchContext';
import { selectedAirports } from '../selection/selection';
import { useSelection } from '../selection/useSelection';
import { KEYS, load } from '../storage/store';
import { buildMixed, buildOptions, buildResults, Option, planCalls, Results } from './results';

type Raw = { explore: Destination[][]; estimates: Destination[][]; outs: OneWay[][]; backs: OneWay[][]; key: string };

/** Two searches with the same key need the same Worker calls (same origin, months, trip length, options). */
const callsKey = (s: Search) => JSON.stringify([s.departureAirports[0], planCalls(s)]);

export type ResultsState = {
  status: 'idle' | 'loading' | 'done';
  /** e.g. "Checking prices 2 of 5" while loading. */
  progress: string;
  /** Something went wrong (results may still be partly filled). */
  error: string | null;
  usage: Usage | null;
  /** For the map: the best price per destination, within budget. */
  results: Results | null;
  /** For the list: every dated option, including trips that return from another airport. */
  options: Option[];
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
  const [usage, setUsage] = useState<Usage | null>(null);
  const [raw, setRaw] = useState<Raw | null>(null);
  const running = useRef(false);

  const run = useCallback(async () => {
    if (running.current) return;
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
    const plan = planCalls(search);
    // Prices are asked from the first departure airport, for one adult (so they are per person)
    const origin = search.departureAirports[0];
    const total = plan.estimates.length + plan.oneWays.length + plan.explore.length;
    const explore: Destination[][] = [];
    const estimates: Destination[][] = [];
    const outs: OneWay[][] = [];
    const backs: OneWay[][] = [];
    let problem: string | null = null;
    let step = 0;
    const note = (r: { ok: boolean; error?: string; usage?: Usage }) => {
      if (!r.ok) problem = problem ?? r.error ?? 'A price check failed.';
      if (r.usage) setUsage(r.usage);
    };
    // Free calls first, then the Google Explore calls that count against the daily limit
    for (const e of plan.estimates) {
      setProgress(`Checking prices ${++step} of ${total}`);
      const r = await api.estimates(conn, { origin, from: e.from, to: e.to });
      if (r.ok) estimates.push(r.data);
      note(r);
    }
    for (const e of plan.oneWays) {
      setProgress(`Checking prices ${++step} of ${total}`);
      const r = await api.oneWays(conn, { origin, month: e.month, dir: e.dir });
      if (r.ok) (e.dir === 'out' ? outs : backs).push(r.data);
      note(r);
    }
    for (const e of plan.explore) {
      setProgress(`Checking prices ${++step} of ${total}`);
      const r = await api.explore(conn, { origin, month: e.month, duration: e.duration });
      if (r.ok) explore.push(r.data);
      note(r);
    }
    setRaw({ explore, estimates, outs, backs, key: callsKey(search) });
    setError(problem);
    setProgress('');
    setStatus('done');
    running.current = false;
  }, [search]);

  // Changing the destinations or the budget re-filters what was fetched without a new search
  const results = useMemo(
    () => (raw ? buildResults(search, selected, raw.explore, raw.estimates, airportByCode) : null),
    [raw, search, selected],
  );
  const options = useMemo(
    () =>
      raw
        ? [
            ...buildOptions(search, selected, raw.explore, raw.estimates, airportByCode),
            ...buildMixed(search, selected, raw.outs, raw.backs, airportByCode),
          ]
        : [],
    [raw, search, selected],
  );
  const lists = useMemo(() => (raw ? [...raw.explore, ...raw.estimates] : []), [raw]);
  const stale = raw != null && raw.key !== callsKey(search);

  const value = useMemo(
    () => ({ status, progress, error, usage, results, options, stale, lists, run }),
    [status, progress, error, usage, results, options, stale, lists, run],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useResults(): ResultsState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useResults must be used inside ResultsProvider');
  return v;
}
