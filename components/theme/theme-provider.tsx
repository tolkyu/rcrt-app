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
import {
  THEME_COLOR_MEDIA,
  themeClassName,
  themeColorFor,
  type Theme,
} from '@/lib/theme';

interface ThemeContextValue {
  readonly theme: Theme;
  readonly setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Applies the class and the status-bar colour immediately and stores the cookie, so the next server render matches (no flash). */
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
    for (const meta of document.querySelectorAll<HTMLMetaElement>(
      'meta[name="theme-color"]',
    ))
      meta.content = themeColorFor(
        next,
        meta.media === THEME_COLOR_MEDIA.dark ? 'dark' : 'light',
      );
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
