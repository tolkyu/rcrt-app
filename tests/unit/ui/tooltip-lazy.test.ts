import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (file: string) => readFileSync(file, 'utf8');
const importLines = (code: string) =>
  code.split('\n').filter((line) => /^import\b/.test(line));

describe('tooltip chunk stays out of the initial bundle [UI foundation F2, PERF-04]', () => {
  it('the static trigger wrapper imports no Radix and only types from the lazy module', () => {
    const imports = importLines(source('components/ui/tooltip.tsx'));
    expect(imports.filter((line) => line.includes('radix-ui'))).toEqual([]);
    const fromContent = imports.filter((line) =>
      line.includes('./tooltip-content'),
    );
    expect(fromContent).toEqual([
      "import type { FocusIntent, TooltipSide } from './tooltip-content';",
    ]);
    expect(source('components/ui/tooltip.tsx')).toContain(
      "import('./tooltip-content')",
    );
  });

  it('DisabledReason reaches Radix only through the lazy Tooltip', () => {
    const imports = importLines(source('components/ui/disabled-reason.tsx'));
    expect(imports.filter((line) => line.includes('radix-ui'))).toEqual([]);
    expect(imports.filter((line) => line.includes('tooltip-content'))).toEqual(
      [],
    );
  });

  it('no module outside the Tooltip imports the content module statically', () => {
    const consumers = [
      'components/ui/badge.tsx',
      'components/vacancies/vacancy-badges.tsx',
      'components/dev-ui/tooltip-demos.tsx',
    ];
    for (const file of consumers)
      expect(source(file)).not.toMatch(/from ['"].*tooltip-content['"]/);
  });
});
