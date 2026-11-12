// Runs a price search: calls the Worker for each planned request and keeps the answers.
// Searches only start when the user asks (each Explore call uses one of the day's SerpApi searches).
import { useCallback, useMemo, useRef, useState } from 'react';
import { Destination, Usage } from '../../shared/types';
import { api, Connection } from '../api/client';
import { airportByCode } from '../map/mapData';
import { Search } from '../search/search';
import { KEYS, load } from '../storage/store';
import { buildResults, planCalls, Results } from './results';

type Raw = { explore: Destination[][]; estimates: Destination[][]; key: string };

/** Two searches with the same key need the same Worker calls (same origin, months and trip length). */
const callsKey = (s: Search) => JSON.stringify([s.departureAirports[0], planCalls(s)]);

export type ResultsState = {
  status: 'idle' | 'loading' | 'done';
  /** e.g. "Checking prices 2 of 5" while loading. */
  progress: string;
  /** Something went wrong (results may still be partly filled). */
  error: string | null;
  usage: Usage | null;
  results: Results | null;
  /** True when the dates, trip length or departure changed since these prices were fetched. */
  stale: boolean;
  run: () => void;
  clear: () => void;
};

export function useResults(search: Search, selected: string[]): ResultsState {
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
    // Prices are asked from the first departure airport, for one traveler (so they are per person)
    const origin = search.departureAirports[0];
    const total = plan.estimates.length + plan.explore.length;
    const explore: Destination[][] = [];
    const estimates: Destination[][] = [];
    let problem: string | null = null;
    let step = 0;
    // Free estimates first, then the Explore calls that count against the daily limit
    for (const e of plan.estimates) {
      setProgress(`Checking prices ${++step} of ${total}`);
      const r = await api.estimates(conn, { origin, from: e.from, to: e.to });
      if (r.ok) estimates.push(r.data);
      else problem = problem ?? r.error;
      if (r.usage) setUsage(r.usage);
    }
    for (const e of plan.explore) {
      setProgress(`Checking prices ${++step} of ${total}`);
      const r = await api.explore(conn, { origin, month: e.month, duration: e.duration });
      if (r.ok) explore.push(r.data);
      else problem = problem ?? r.error;
      if (r.usage) setUsage(r.usage);
    }
    setRaw({ explore, estimates, key: callsKey(search) });
    setError(problem);
    setProgress('');
    setStatus('done');
    running.current = false;
  }, [search]);

  const clear = useCallback(() => {
    setRaw(null);
    setStatus('idle');
    setError(null);
  }, []);

  // Changing the destinations or the budget re-filters what was fetched without a new search
  const results = useMemo(
    () => (raw ? buildResults(search, selected, raw.explore, raw.estimates, airportByCode) : null),
    [raw, search, selected],
  );

  const stale = raw != null && raw.key !== callsKey(search);

  return { status, progress, error, usage, results, stale, run, clear };
}
