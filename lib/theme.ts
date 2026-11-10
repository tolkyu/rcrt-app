export const THEMES = ['light', 'dark', 'system'] as const;
export type Theme = (typeof THEMES)[number];

export function parseTheme(value: string | null | undefined): Theme {
  return THEMES.find((theme) => theme === value) ?? 'system';
}

/** Class on <html>; `system` has none so `color-scheme: light dark` follows the OS without a script. */
export function themeClassName(theme: Theme): 'light' | 'dark' | undefined {
  return theme === 'system' ? undefined : theme;
}

/** Top bar colour per scheme (`--surface`): the status bar of a phone should match it. */
export const THEME_COLORS = { light: '#ffffff', dark: '#111827' } as const;

export const THEME_COLOR_MEDIA = {
  light: '(prefers-color-scheme: light)',
  dark: '(prefers-color-scheme: dark)',
} as const;

/** A cookie override wins over the OS scheme for both media variants, so the pair never disagrees with the page. */
export function themeColorFor(
  theme: Theme,
  scheme: keyof typeof THEME_COLORS,
): string {
  return THEME_COLORS[theme === 'system' ? scheme : theme];
}
