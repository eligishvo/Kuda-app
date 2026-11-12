// Holds the current search, remembers it on the phone, and shares it between the map and the search screen.
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { airportCodesIn } from '../map/mapData';
import { KEYS, load, save } from '../storage/store';
import { sanitizeSearch, Search } from './search';

const today = () => new Date().toISOString().slice(0, 10);

type Value = { search: Search; change: (patch: Partial<Search>) => void };

const Ctx = createContext<Value | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState<Search>(() => sanitizeSearch(null, today(), airportCodesIn));
  useEffect(() => {
    load<unknown>(KEYS.search, null).then((raw) => setSearch(sanitizeSearch(raw, today(), airportCodesIn)));
  }, []);
  /** Applies a change, repairs anything it made invalid (e.g. a return before the departure) and saves. */
  const change = useCallback((patch: Partial<Search>) => {
    setSearch((prev) => {
      const next = sanitizeSearch({ ...prev, ...patch }, today(), airportCodesIn);
      save(KEYS.search, next);
      return next;
    });
  }, []);
  const value = useMemo(() => ({ search, change }), [search, change]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSearch(): Value {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSearch must be used inside SearchProvider');
  return v;
}
