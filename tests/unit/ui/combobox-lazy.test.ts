import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (file: string) => readFileSync(file, 'utf8');
const importLines = (code: string) =>
  code.split('\n').filter((line) => /^import\b/.test(line));

describe('combobox popup stays out of the initial bundle [UI foundation F4, PERF-04]', () => {
  it('the static field imports no Radix and loads the popup only dynamically', () => {
    const code = source('components/ui/combobox.tsx');
    const imports = importLines(code);
    expect(imports.filter((line) => line.includes('radix-ui'))).toEqual([]);
    expect(
      imports.filter(
        (line) =>
          line.includes('combobox-popup') && !line.startsWith('import type'),
      ),
    ).toEqual([]);
    expect(code).toContain("import('./combobox-popup')");
  });

  it('the shared module and the options hook import no UI code', () => {
    expect(importLines(source('components/ui/combobox-shared.ts'))).toEqual([
      "import type { AriaAttributes, FocusEventHandler } from 'react';",
      "import { normalizeApostrophes } from '@/lib/apostrophes';",
    ]);
    const hook = source('components/ui/use-combobox-options.ts');
    expect(hook).not.toMatch(/radix-ui|combobox-popup|next-intl/);
  });
});
