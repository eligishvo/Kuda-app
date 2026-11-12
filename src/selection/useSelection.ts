// The current destination selection, remembered on the phone between app starts.
import { useCallback, useEffect, useState } from 'react';
import { KEYS, load, save } from '../storage/store';
import { EMPTY, sanitize, Selection } from './selection';

export function useSelection() {
  const [selection, setSelection] = useState<Selection>(EMPTY);
  useEffect(() => {
    load<unknown>(KEYS.selection, null).then((raw) => setSelection(sanitize(raw)));
  }, []);
  /** Changes the selection with a function of the previous one, and saves the result. */
  const update = useCallback((change: (prev: Selection) => Selection) => {
    setSelection((prev) => {
      const next = change(prev);
      save(KEYS.selection, next);
      return next;
    });
  }, []);
  return [selection, update] as const;
}
