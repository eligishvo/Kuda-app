// The Worker's real "searches left today", shared by every screen that can spend one.
// Asking for it is free (the Worker reads its own counter; no SerpApi search is made).
import { useEffect, useState } from 'react';
import { Usage } from '../../shared/types';
import { Connection } from '../api/client';
import { KEYS, load } from '../storage/store';
import { live } from './live';

export function useAllowance(): Usage | null {
  const [usage, setUsage] = useState<Usage | null>(live.usage());
  useEffect(() => {
    const stop = live.onUsage(setUsage);
    (async () => {
      const c = await load<Connection | null>(KEYS.connection, null);
      if (c?.url && c?.token) await live.refreshUsage(c);
    })();
    return stop;
  }, []);
  return usage;
}
