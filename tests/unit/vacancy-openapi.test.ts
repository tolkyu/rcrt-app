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
  components: {
    schemas: Record<
      string,
      { required?: string[]; properties?: Record<string, unknown> }
    >;
  };
};

describe('content PATCH contract [ADR-018, VAC-08]', () => {
  const operation = document.paths['/vacancies/{vacancyId}/content']?.patch;
  it('preserves the separate draft operation and inherited guards', () => {
    expect(operation?.operationId).toBe('updateVacancyContent');
    expect(document.paths['/vacancies/{vacancyId}']?.patch?.operationId).toBe(
      'updateVacancyDraft',
    );
    expect(
      operation?.parameters
        ?.filter((p) => p.in === 'header')
        .map((p) => ({ name: p.name, required: p.required })),
    ).toEqual([{ name: 'X-CSRF-Protection', required: true }]);
    expect(Object.keys(operation?.responses ?? {}).sort()).toEqual([
      '200',
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
  it('exposes exactly the two content fields plus expectedVersion', () => {
    expect(document.components.schemas.UpdateVacancyContent?.required).toEqual([
      'expectedVersion',
    ]);
    expect(
      Object.keys(
        document.components.schemas.UpdateVacancyContent?.properties ?? {},
      ),
    ).toEqual(['expectedVersion', 'descriptionDoc', 'requirementsDoc']);
    expect(document.components.schemas.VacancyContent?.required).toEqual([
      'id',
      'version',
      'updatedAt',
      'descriptionDoc',
      'requirementsDoc',
    ]);
  });
});

describe('content GET contract [ADR-019]', () => {
  const operation = document.paths['/vacancies/{vacancyId}/content']?.get;
  it('is a separate read operation with inherited errors and no mutation transport', () => {
    expect(operation?.operationId).toBe('getVacancyContent');
    expect(operation?.requestBody).toBeUndefined();
    expect(operation?.parameters?.filter((p) => p.in === 'header')).toEqual([]);
    expect(Object.keys(operation?.responses ?? {}).sort()).toEqual([
      '200',
      '400',
      '401',
      '404',
      '500',
    ]);
  });
  it('returns revision, documents, status and eligibility without internal authorization facts', () => {
    expect(document.components.schemas.VacancyContentRead?.required).toEqual([
      'id',
      'version',
      'updatedAt',
      'descriptionDoc',
      'requirementsDoc',
      'status',
      'canEditContent',
    ]);
    expect(
      Object.keys(
        document.components.schemas.VacancyContentRead?.properties ?? {},
      ),
    ).toEqual([
      'id',
      'version',
      'updatedAt',
      'descriptionDoc',
      'requirementsDoc',
      'status',
      'canEditContent',
    ]);
    expect(
      document.components.schemas.VacancyDetail?.properties,
    ).not.toHaveProperty('descriptionDoc');
  });
});

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

describe('POST /vacancies/request contract [STORY-VAC-03-3, D87]', () => {
  const operation = document.paths['/vacancies/request']!.post!;

  it('is idempotent and carries no vertical or Team Lead field', () => {
    expect(operation.operationId).toBe('requestVacancy');
    expect(
      operation.parameters?.filter((p) => p.in === 'header'),
    ).toMatchObject([
      { name: 'X-CSRF-Protection', required: true },
      { name: 'Idempotency-Key', required: true },
    ]);
    expect(
      Object.keys(document.components.schemas.RequestVacancy!.properties ?? {}),
    ).toEqual(['positionId', 'headcount', 'priority', 'comment']);
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

describe('own draft count contract [STORY-VAC-01-3 AC1, D110]', () => {
  const operation = document.paths['/vacancies/drafts/count']?.get;

  it('is a read-only GET that answers 200 and the access refusals', () => {
    expect(operation?.operationId).toBe('countOwnVacancyDrafts');
    expect(Object.keys(operation?.responses ?? {}).sort()).toEqual([
      '200',
      '401',
      '404',
      '500',
    ]);
    expect(document.paths['/vacancies/drafts/count']).not.toHaveProperty(
      'post',
    );
  });

  it('returns only the count', () => {
    expect(document.components.schemas.VacancyDraftCount?.required).toEqual([
      'count',
    ]);
  });
});
