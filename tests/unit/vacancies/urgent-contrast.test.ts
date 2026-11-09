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
