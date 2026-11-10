import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(tsx?|css)$/.test(entry) ? [path] : [];
  });
}

const files = ['components', 'app']
  .flatMap((dir) => sources(join(process.cwd(), dir)))
  .map((path) => ({ path, text: readFileSync(path, 'utf8') }));

const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');

describe('motion rules [UI foundation F1, design-system §8]', () => {
  it.each([
    ['transition-all', /\btransition-all\b|transition:\s*all\b/],
    ['ease-in', /(?<![\w-])ease-in(?![\w-])/],
    ['scale-0', /(?<![\w-])scale-0(?![\w.[-])/],
  ])('components and app code never use %s', (_name, pattern) => {
    const offenders = files
      .filter((file) => pattern.test(file.text))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it('the button presses with a compositor-only scale of 0.97 and no press scale for keyboard or reduced motion', () => {
    const button = readFileSync(
      join(process.cwd(), 'components/ui/button.tsx'),
      'utf8',
    );
    expect(button).toContain(
      'motion-safe:not-aria-disabled:active:not-focus-visible:scale-[0.97]',
    );
    expect(button).toContain(
      'transition-[scale,background-color,color,box-shadow]',
    );
  });

  it('the shell does not animate layout properties when the sidebar collapses', () => {
    for (const name of [
      'components/shell/sidebar.tsx',
      'components/shell/app-shell.tsx',
    ])
      expect(readFileSync(join(process.cwd(), name), 'utf8')).not.toMatch(
        /transition-\[(width|padding)\]/,
      );
  });

  it('defines the three strong curves from the design system', () => {
    expect(css).toContain('--ease-out: cubic-bezier(0.23, 1, 0.32, 1);');
    expect(css).toContain('--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);');
    expect(css).toContain('--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);');
  });

  it('reduced motion keeps opacity fades instead of zeroing every duration', () => {
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion'));
    expect(reduced).not.toContain('0.01ms');
    expect(reduced).toContain('--motion-scale: 1;');
    expect(reduced).toContain('--motion-shift: 0%;');
  });

  it('never scales below 0.95 on entry', () => {
    expect(css).toContain('--motion-scale: 0.96;');
    expect(css).not.toMatch(/scale:\s*0(\.[0-8]\d*)?\s*;/);
  });
});
