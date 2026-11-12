// The current destination selection, remembered on the phone and shared between screens.
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { KEYS, load, save } from '../storage/store';
import { EMPTY, sanitize, Selection } from './selection';

type Update = (change: (prev: Selection) => Selection) => void;
const Ctx = createContext<readonly [Selection, Update] | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<Selection>(EMPTY);
  useEffect(() => {
    load<unknown>(KEYS.selection, null).then((raw) => setSelection(sanitize(raw)));
  }, []);
  /** Changes the selection with a function of the previous one, and saves the result. */
  const update = useCallback<Update>((change) => {
    setSelection((prev) => {
      const next = change(prev);
      save(KEYS.selection, next);
      return next;
    });
  }, []);
  const value = useMemo(() => [selection, update] as const, [selection, update]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSelection() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSelection must be used inside SelectionProvider');
  return v;
}
