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
  readonly requestBody?: {
    readonly content: Record<
      string,
      { readonly schema: { readonly $ref: string } }
    >;
  };
}
const document = JSON.parse(readFileSync('openapi/openapi.json', 'utf8')) as {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, { required?: string[] }> };
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

describe('draft lifecycle contract [STORY-VAC-01-3, D92]', () => {
  const byId = (operationId: string) =>
    Object.entries(document.paths).flatMap(([path, methods]) =>
      Object.entries(methods)
        .filter(([, operation]) => operation.operationId === operationId)
        .map(([method, operation]) => ({ path, method, operation })),
    )[0]!;

  it.each([
    ['updateVacancyDraft', 'patch', '/vacancies/{vacancyId}'],
    ['deleteVacancyDraft', 'delete', '/vacancies/{vacancyId}'],
    ['publishVacancyDraft', 'post', '/vacancies/{vacancyId}/publish'],
    ['cancelVacancyDraft', 'post', '/vacancies/{vacancyId}/cancel'],
  ])(
    '%s is %s %s and documents the refusals the service answers',
    (id, method, path) => {
      const found = byId(id);
      expect(found).toMatchObject({ method, path });
      for (const status of ['200', '400', '401', '403', '404', '409', '429'])
        expect(found.operation.responses, `${id} ${status}`).toHaveProperty(
          status,
        );
    },
  );

  it('binds publish to the version the author last saw', () => {
    const ref = byId('publishVacancyDraft').operation.requestBody?.content[
      'application/json'
    ]?.schema.$ref;
    expect(ref).toBe('#/components/schemas/PublishDraft');
    expect(document.components.schemas.PublishDraft?.required).toEqual([
      'expectedVersion',
    ]);
  });

  it('requires the Idempotency-Key only on publish', () => {
    const headers = (id: string) =>
      byId(id)
        .operation.parameters?.filter((p) => p.in === 'header')
        .map((p) => p.name);
    expect(headers('publishVacancyDraft')).toEqual([
      'X-CSRF-Protection',
      'Idempotency-Key',
    ]);
    for (const id of [
      'updateVacancyDraft',
      'deleteVacancyDraft',
      'cancelVacancyDraft',
    ])
      expect(headers(id)).toEqual(['X-CSRF-Protection']);
  });
});
