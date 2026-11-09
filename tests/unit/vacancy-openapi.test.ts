import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Parameter {
  readonly name: string;
  readonly in: string;
  readonly required?: boolean;
}
interface Operation {
  readonly operationId: string;
  readonly parameters?: readonly Parameter[];
  readonly responses: Record<string, unknown>;
}
const document = JSON.parse(readFileSync('openapi/openapi.json', 'utf8')) as {
  paths: Record<string, Record<string, Operation>>;
};

describe('POST /vacancies contract [VAC-01, STORY-VAC-01-1]', () => {
  const operation = document.paths['/vacancies']!.post!;

  it('declares the required Idempotency-Key header next to the CSRF header', () => {
    expect(operation.operationId).toBe('createVacancy');
    expect(
      operation.parameters?.filter((p) => p.in === 'header'),
    ).toMatchObject([
      { name: 'X-CSRF-Protection', required: true },
      { name: 'Idempotency-Key', required: true },
    ]);
  });

  it('documents creation and every refusal the service can answer', () => {
    expect(Object.keys(operation.responses).sort()).toEqual([
      '201',
      '400',
      '401',
      '403',
      '404',
      '409',
      '413',
      '429',
      '500',
    ]);
  });

  it('keeps the list operation read-only', () => {
    expect(document.paths['/vacancies']!.get!.operationId).toBe(
      'listVacancies',
    );
  });
});
