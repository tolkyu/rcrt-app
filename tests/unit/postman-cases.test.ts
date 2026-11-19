import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mergeCases,
  type OpenApi,
  type PmCollection,
} from '../../scripts/postman-cases';

const spec: OpenApi = {
  paths: {
    '/vacancies': {
      get: {
        operationId: 'listVacancies',
        responses: {
          '200': {
            content: {
              'application/json': { schema: { type: 'object' } },
            },
          },
        },
      },
    },
  },
  components: { schemas: {} },
};

const collection = (): PmCollection => ({
  info: {},
  item: [
    {
      name: 'Vacancies',
      item: [
        {
          name: 'List',
          request: {
            method: 'GET',
            url: { path: ['vacancies'], host: ['{{baseUrl}}'] },
          },
        },
      ],
    },
  ],
});

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'postman-cases-'));
  mkdirSync(join(dir, 'cases'));
  mkdirSync(join(dir, 'tests'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const generate = (cases: object[]) => {
  writeFileSync(join(dir, 'cases', 'vacancies.json'), JSON.stringify(cases));
  const merged = collection();
  mergeCases(merged, spec, dir);
  return merged.item[0]!.item!;
};
const prerequest = (item: { event?: unknown[] }) =>
  (
    item.event as {
      listen: string;
      script: { exec: string[] };
    }[]
  ).find((event) => event.listen === 'prerequest');
const base = { operation: 'listVacancies', as: null, status: 200 };

describe('Newman case generation [ADR-006]', () => {
  it('a plain case has no prerequest script', () => {
    const [item] = generate([{ ...base, name: 'plain' }]);
    expect(prerequest(item!)).toBeUndefined();
  });

  it('freshRateWindow waits for the next whole minute before the request, nothing else', () => {
    const [item] = generate([
      { ...base, name: 'fresh window', freshRateWindow: true },
    ]);
    expect(prerequest(item!)!.script.exec).toEqual([
      'setTimeout(() => {}, 60250 - (Date.now() % 60000));',
    ]);
  });

  it('keeps the skip guard for chained variables after the wait', () => {
    writeFileSync(
      join(dir, 'tests', 'capture.js'),
      "pm.collectionVariables.set('made_here', 1);\n",
    );
    const items = generate([
      { ...base, name: 'capture', script: 'capture' },
      {
        ...base,
        name: 'chained',
        params: { id: '{{made_here}}' },
        freshRateWindow: true,
      },
    ]);
    const exec = prerequest(items[1]!)!.script.exec;
    expect(exec).toHaveLength(2);
    expect(exec[0]).toContain('setTimeout');
    expect(exec[1]).toContain('pm.execution.skipRequest()');
  });

  it('refuses a value other than true for freshRateWindow', () => {
    expect(() =>
      generate([{ ...base, name: 'bad', freshRateWindow: false }]),
    ).toThrow();
  });
});
