export const THEMES = ['light', 'dark', 'system'] as const;
export type Theme = (typeof THEMES)[number];

export function parseTheme(value: string | null | undefined): Theme {
  return THEMES.find((theme) => theme === value) ?? 'system';
}

/** Class on <html>; `system` has none so `color-scheme: light dark` follows the OS without a script. */
export function themeClassName(theme: Theme): 'light' | 'dark' | undefined {
  return theme === 'system' ? undefined : theme;
}
