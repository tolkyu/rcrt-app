import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (file: string) => readFileSync(file, 'utf8');
const importLines = (code: string) =>
  code.split('\n').filter((line) => /^import\b/.test(line));

describe('select chunk stays out of the initial bundle [UI foundation F3, PERF-04]', () => {
  it('the static trigger imports no Radix and loads the content module only dynamically', () => {
    const code = source('components/ui/select.tsx');
    const imports = importLines(code);
    expect(imports.filter((line) => line.includes('radix-ui'))).toEqual([]);
    expect(imports.filter((line) => line.includes('select-content'))).toEqual(
      [],
    );
    expect(code).toContain("import('./select-content')");
  });

  it('the shared module holds only types, constants and helpers', () => {
    const imports = importLines(source('components/ui/select-shared.ts'));
    expect(imports).toEqual([
      "import type { AriaAttributes, FocusEventHandler } from 'react';",
    ]);
  });

  it('nothing but the lazy Select imports the content module', () => {
    for (const file of [
      'components/ui/filter-select-field.tsx',
      'components/vacancies/vacancies-view.tsx',
      'components/dev-ui/select-demos.tsx',
    ])
      expect(source(file)).not.toMatch(/from ['"].*select-content['"]/);
  });
});
