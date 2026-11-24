import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import {
  createTranslator,
  _createCache,
  _createIntlFormatters,
} from 'use-intl/core';
import formatPrecompiled from 'use-intl/format-message/format-only';
import { describe, expect, it } from 'vitest';
import messages from '@/messages/uk.json';

/**
 * Production builds precompile `messages/uk.json` (ADR-014) while dev, unit tests and email templates in
 * Vitest format the raw strings at runtime. This is the guard that both give the same text.
 */
const requireFromUseIntl = createRequire(
  createRequire(import.meta.url).resolve('use-intl/core'),
);
const importFromUseIntl = async <T>(specifier: string) =>
  (await import(
    pathToFileURL(requireFromUseIntl.resolve(specifier)).href
  )) as T;

type Compile = { default: (message: string) => unknown };
type MessageFormatModule = {
  IntlMessageFormat: new (
    message: string,
    locale: string,
  ) => { getAst(): AstNode[] };
};
interface AstNode {
  type: number;
  value?: string;
  options?: Record<string, { value: AstNode[] }>;
  children?: AstNode[];
}
/** `@formatjs/icu-messageformat-parser` node types. */
const NODE = {
  argument: 1,
  number: 2,
  date: 3,
  time: 4,
  select: 5,
  plural: 6,
  tag: 8,
};

const leaves: [string, string][] = [];
(function collect(node: Record<string, unknown>, prefix: string) {
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === 'string') leaves.push([prefix + key, value]);
    else if (value && typeof value === 'object' && !Array.isArray(value))
      collect(value as Record<string, unknown>, `${prefix}${key}.`);
    else
      throw new Error(
        `${prefix}${key} is not a string: the precompiler accepts strings only`,
      );
  }
})(messages, '');

function argumentsOf(
  ast: AstNode[],
  found = new Map<string, { kind: string; keys?: string[] }>(),
) {
  for (const node of ast) {
    const name = node.value ?? '';
    if (node.type === NODE.argument)
      found.set(name, found.get(name) ?? { kind: 'text' });
    else if (node.type === NODE.number) found.set(name, { kind: 'number' });
    else if (node.type === NODE.date || node.type === NODE.time)
      found.set(name, { kind: 'date' });
    else if (node.type === NODE.tag) {
      found.set(name, { kind: 'tag' });
      argumentsOf(node.children ?? [], found);
    } else if (node.type === NODE.plural || node.type === NODE.select) {
      const options = node.options ?? {};
      found.set(
        name,
        node.type === NODE.plural
          ? { kind: 'plural' }
          : { kind: 'select', keys: Object.keys(options) },
      );
      for (const option of Object.values(options))
        argumentsOf(option.value, found);
    }
  }
  return found;
}

/** A fixed matrix: every plural category boundary, every select branch, a date, a number, plain text, rich tags. */
function matrix(spec: ReturnType<typeof argumentsOf>) {
  let rows: Record<string, unknown>[] = [{}];
  for (const [name, { kind, keys }] of spec) {
    const options: unknown[] =
      kind === 'plural'
        ? [0, 1, 2, 3, 5, 11, 21, 22, 25, 1.5]
        : kind === 'number'
          ? [0, 1234.5]
          : kind === 'date'
            ? [new Date('2026-02-03T10:15:00Z')]
            : kind === 'select'
              ? (keys ?? [])
              : kind === 'tag'
                ? [
                    (chunks: unknown[]) =>
                      `<${name}>${chunks.join('')}</${name}>`,
                  ]
                : ['Іван'];
    rows = rows.flatMap((row) =>
      options.map((value) => ({ ...row, [name]: value })),
    );
  }
  return rows.slice(0, 400);
}

describe('precompiled messages format like the runtime parser (ADR-014)', () => {
  it('every catalog leaf gives the same text for a fixed argument matrix', async () => {
    const { default: compile } =
      await importFromUseIntl<Compile>('icu-minify/compile');
    const { IntlMessageFormat } =
      await importFromUseIntl<MessageFormatModule>('intl-messageformat');
    const translator = createTranslator({
      locale: 'uk',
      messages,
      timeZone: 'Europe/Kyiv',
      onError: () => undefined,
    });
    const cache = _createCache();
    const formatters = _createIntlFormatters(cache);
    const joined = (value: unknown) =>
      Array.isArray(value) ? value.join('') : String(value);
    const differences: string[] = [];
    let compared = 0;

    for (const [key, message] of leaves) {
      const compiled = compile(message);
      const spec = argumentsOf(new IntlMessageFormat(message, 'uk').getAst());
      for (const values of matrix(spec)) {
        const hasValues = Object.keys(values).length > 0;
        const runtime = hasValues
          ? translator.rich(key as never, values as never)
          : translator(key as never);
        const precompiled = formatPrecompiled(
          key,
          compiled as never,
          hasValues ? (values as never) : undefined,
          {
            cache,
            formatters,
            locale: 'uk',
            timeZone: 'Europe/Kyiv',
          },
        );
        compared += 1;
        if (joined(runtime) !== joined(precompiled))
          differences.push(
            `${key} ${JSON.stringify(values)}: ${joined(runtime)} | ${joined(precompiled)}`,
          );
      }
    }
    expect(compared).toBeGreaterThan(leaves.length);
    expect(differences).toEqual([]);
  });

  it('the errors read raw by app/global-error.tsx stay plain strings after compiling', async () => {
    const { default: compile } =
      await importFromUseIntl<Compile>('icu-minify/compile');
    const keys = Object.keys(messages.errors).filter((key) =>
      key.startsWith('appError'),
    );
    expect(keys.length).toBeGreaterThanOrEqual(3);
    for (const key of keys) {
      const raw = messages.errors[key as keyof typeof messages.errors];
      expect(compile(raw), key).toBe(raw);
    }
  });

  it('the catalog is strings only: the precompiler rejects arrays and t.raw has nothing to return', () => {
    expect(leaves.length).toBeGreaterThan(1000);
  });
});

describe('next-intl and use-intl move together', () => {
  const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
    dependencies: Record<string, string>;
  };
  it('are pinned to the same exact version (the precompiled format is shared between them)', () => {
    const { 'next-intl': nextIntl, 'use-intl': useIntl } =
      manifest.dependencies;
    expect(nextIntl).toMatch(/^\d+\.\d+\.\d+$/);
    expect(useIntl).toBe(nextIntl);
  });
});
