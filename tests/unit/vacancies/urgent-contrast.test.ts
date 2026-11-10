import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');

function token(name: string, theme: 'light' | 'dark'): string {
  const match = new RegExp(
    `--${name}:\\s*light-dark\\((#[0-9a-f]{6}),\\s*(#[0-9a-f]{6})\\)`,
    'i',
  ).exec(css);
  if (!match) throw new Error(`Token --${name} is not a light-dark pair`);
  return match[theme === 'light' ? 1 : 2]!;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const [hi, lo] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  ) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('urgent vacancy badge contrast [STORY-VAC-04-4, D97]', () => {
  it.each(['light', 'dark'] as const)(
    'text on the soft destructive background is at least 4.5:1 in the %s theme',
    (theme) => {
      expect(
        contrast(
          token('error-text', theme),
          token('destructive-subtle', theme),
        ),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(['light', 'dark'] as const)(
    'the neutral closed-vacancy label is at least 4.5:1 in the %s theme',
    (theme) => {
      expect(
        contrast(
          token('muted-foreground-strong', theme),
          token('surface-muted', theme),
        ),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );
});

function plainToken(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-f]{6});`, 'i').exec(css);
  if (!match) throw new Error(`Token --${name} is not a plain hex colour`);
  return match[1]!;
}

describe('status tones on soft fills [UI foundation F1, design-system §1.2]', () => {
  const tones = ['success', 'warning', 'info'] as const;

  it.each(
    tones.flatMap((tone) =>
      (['light', 'dark'] as const).map((theme) => [tone, theme] as const),
    ),
  )(
    '%s text on its subtle fill is at least 4.5:1 in the %s theme',
    (tone, theme) => {
      expect(
        contrast(token(`${tone}-text`, theme), token(`${tone}-subtle`, theme)),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  // Light success (#22C55E, 2.28:1) and warning (#F59E0B, 2.15:1) dots are below 3:1 by the approved palette; they always sit beside a text label.
  it.each([
    ['error', 'light'],
    ['info', 'light'],
    ['success', 'dark'],
    ['warning', 'dark'],
    ['error', 'dark'],
    ['info', 'dark'],
  ] as const)(
    'the %s status dot is at least 3:1 on the surface in the %s theme',
    (tone, theme) => {
      expect(
        contrast(token(tone, theme), token('surface', theme)),
      ).toBeGreaterThanOrEqual(3);
    },
  );

  it('maps every subtle and info token into the Tailwind colour theme', () => {
    for (const name of [
      'success-subtle',
      'warning-subtle',
      'info',
      'info-subtle',
      'info-text',
    ])
      expect(css).toContain(`--color-${name}: var(--${name});`);
  });
});

describe('brand tokens in both themes [UI foundation F1, ui-foundation §0 finding 7]', () => {
  it.each(['light', 'dark'] as const)(
    'the brand accent is at least 3:1 on surface, background and selected rows in the %s theme',
    (theme) => {
      for (const surface of ['surface', 'background', 'primary-subtle'])
        expect(
          contrast(token('brand', theme), token(surface, theme)),
        ).toBeGreaterThanOrEqual(3);
    },
  );

  it('uses the approved #818CF8 accent on dark', () => {
    expect(token('brand', 'dark').toLowerCase()).toBe('#818cf8');
  });

  it('filled primary buttons keep white text at 4.5:1 in both themes', () => {
    expect(
      contrast(plainToken('primary-foreground'), plainToken('primary')),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['light', 'dark'] as const)(
    'the logo tile glyph (large bold text) is at least 3:1 on the brand fill in the %s theme',
    (theme) => {
      expect(
        contrast('#ffffff', token('brand-fill', theme)),
      ).toBeGreaterThanOrEqual(3);
    },
  );

  it('links stay at 4.5:1 on dark surfaces', () => {
    for (const surface of ['surface', 'background', 'primary-subtle'])
      expect(
        contrast(token('link', 'dark'), token(surface, 'dark')),
      ).toBeGreaterThanOrEqual(4.5);
  });
});
