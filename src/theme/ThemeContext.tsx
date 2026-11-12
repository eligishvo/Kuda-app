// Holds the current theme, remembers the choice on the phone, and hands it to every screen via useTheme().
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { KEYS, load, save } from '../storage/store';
import { DEFAULT_THEME, Theme, ThemeId, THEMES } from './themes';

type Value = { theme: Theme; setTheme: (id: ThemeId) => void };

const Ctx = createContext<Value>({ theme: THEMES[DEFAULT_THEME], setTheme: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<ThemeId>(DEFAULT_THEME);
  useEffect(() => {
    load<ThemeId>(KEYS.theme, DEFAULT_THEME).then((saved) => {
      if (THEMES[saved]) setId(saved);
    });
  }, []);
  const setTheme = useCallback((next: ThemeId) => {
    setId(next);
    save(KEYS.theme, next);
  }, []);
  const value = useMemo(() => ({ theme: THEMES[id], setTheme }), [id, setTheme]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx).theme;
export const useSetTheme = () => useContext(Ctx).setTheme;
