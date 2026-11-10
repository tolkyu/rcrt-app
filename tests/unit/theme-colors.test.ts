import { describe, expect, it } from 'vitest';
import { THEME_COLORS, themeColorFor } from '@/lib/theme';

describe('theme-color per scheme [UI foundation F1]', () => {
  it('follows the OS scheme when the theme is system', () => {
    expect(themeColorFor('system', 'light')).toBe(THEME_COLORS.light);
    expect(themeColorFor('system', 'dark')).toBe(THEME_COLORS.dark);
  });

  it.each(['light', 'dark'] as const)(
    'a %s cookie override wins for both media variants',
    (theme) => {
      expect(themeColorFor(theme, 'light')).toBe(THEME_COLORS[theme]);
      expect(themeColorFor(theme, 'dark')).toBe(THEME_COLORS[theme]);
    },
  );
});
