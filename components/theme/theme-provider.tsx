'use client';

import {
  createContext,
  use,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { PREFERENCE_COOKIES, writePreference } from '@/lib/preference-cookie';
import { themeClassName, type Theme } from '@/lib/theme';

interface ThemeContextValue {
  readonly theme: Theme;
  readonly setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Applies the class immediately and stores the cookie, so the next server render has the same class (no flash). */
export function ThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: Theme;
  children: ReactNode;
}) {
  const [theme, setState] = useState(initialTheme);
  const setTheme = useCallback((next: Theme) => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    const className = themeClassName(next);
    if (className) root.classList.add(className);
    writePreference(PREFERENCE_COOKIES.theme, next);
    setState(next);
  }, []);
  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const value = use(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
