import { describe, expect, it } from 'vitest';
import {
  cancelVacancySchema,
  patchVacancySchema,
  publishDraftSchema,
  VACANCY_REASON_MAX,
  VACANCY_TITLE_MAX,
} from '@/lib/schemas/vacancy';

const position = '3f1e2d3c-4b5a-4968-8776-655443322110';
const issues = (schema: typeof patchVacancySchema, input: unknown) => {
  const result = schema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.map((i) => `${i.path.join('.')}:${i.code}`);
};

describe('partial draft update contract [STORY-VAC-01-3 AC2, D92]', () => {
  it('needs the version and at least one field', () => {
    expect(issues(patchVacancySchema, { title: 'Назва' })).toContain(
      'expectedVersion:invalid_type',
    );
    expect(issues(patchVacancySchema, { expectedVersion: 1 })).toContain(
      ':custom',
    );
    expect(
      patchVacancySchema.safeParse({ expectedVersion: 0, title: 'Н1' }).success,
    ).toBe(false);
    expect(
      patchVacancySchema.safeParse({ expectedVersion: 2, headcount: 2 })
        .success,
    ).toBe(true);
  });

  it('keeps missing keys missing and lets null clear an optional field', () => {
    const parsed = patchVacancySchema.parse({
      expectedVersion: 3,
      positionId: null,
      teamLeadId: null,
      location: null,
      salaryCurrency: null,
      descriptionDoc: null,
    });
    expect(parsed).toEqual({
      expectedVersion: 3,
      positionId: null,
      teamLeadId: null,
      location: null,
      salaryCurrency: null,
      descriptionDoc: null,
    });
    expect('title' in parsed).toBe(false);
  });

  it.each([
    'verticalId',
    'status',
    'mode',
    'createdBy',
    'source',
    'openedAt',
    'recruiterInitiated',
    'publicNo',
    'version',
    'bonusAmountMinor',
    '__proto__',
  ])('refuses the field %s instead of ignoring it', (field) => {
    const body = JSON.parse(
      `{"expectedVersion":1,"title":"Назва","${field}":"x"}`,
    );
    expect(issues(patchVacancySchema, body)).toContain(':unrecognized_keys');
  });

  it('does not accept null for the fields a draft must always have', () => {
    for (const field of ['title', 'headcount', 'priority', 'probationDays'])
      expect(
        patchVacancySchema.safeParse({ expectedVersion: 1, [field]: null })
          .success,
        field,
      ).toBe(false);
  });

  it('normalises the title like creation and keeps its bounds', () => {
    expect(
      patchVacancySchema.parse({ expectedVersion: 1, title: '  Нова   назва ' })
        .title,
    ).toBe('Нова назва');
    for (const title of [
      '',
      ' ',
      'я',
      'я'.repeat(VACANCY_TITLE_MAX + 1),
      'a​b',
    ])
      expect(
        patchVacancySchema.safeParse({ expectedVersion: 1, title }).success,
        title,
      ).toBe(false);
  });

  it('keeps the limits of creation for the shared fields', () => {
    for (const bad of [
      { headcount: 0 },
      { headcount: 101 },
      { probationDays: 29 },
      { probationDays: 91 },
      { workFormat: 'ONSITE' },
      { positionId: 'not-a-uuid' },
      { salaryMinMinor: '-1' },
      { salaryCurrency: 'usd' },
    ])
      expect(
        patchVacancySchema.safeParse({ expectedVersion: 1, ...bad }).success,
        JSON.stringify(bad),
      ).toBe(false);
    expect(
      patchVacancySchema.safeParse({ expectedVersion: 1, positionId: position })
        .success,
    ).toBe(true);
  });

  it('leaves every salary coupling to the merged draft: the service judges the bounds against the stored values', () => {
    expect(
      patchVacancySchema.safeParse({
        expectedVersion: 1,
        salaryMinMinor: '200',
        salaryMaxMinor: '100',
      }).success,
    ).toBe(true);
    expect(
      patchVacancySchema.safeParse({ expectedVersion: 1, salaryMaxMinor: '5' })
        .success,
    ).toBe(true);
  });
});

describe('publish contract [D92, SEC-V2S2-04]', () => {
  it('needs the version the author last saw and nothing else', () => {
    expect(publishDraftSchema.parse({ expectedVersion: 3 })).toEqual({
      expectedVersion: 3,
    });
    for (const bad of [
      {},
      { expectedVersion: 0 },
      { expectedVersion: '1' },
      { expectedVersion: 1, status: 'OPEN' },
    ])
      expect(
        publishDraftSchema.safeParse(bad).success,
        JSON.stringify(bad),
      ).toBe(false);
  });
});

describe('cancel contract [D82]', () => {
  it('needs a trimmed, visible reason within bounds', () => {
    expect(
      cancelVacancySchema.parse({ reason: '  Потреба   зникла ' }).reason,
    ).toBe('Потреба зникла');
    for (const reason of [
      '',
      '   ',
      'a\u0000b',
      'a‮b',
      'я'.repeat(VACANCY_REASON_MAX + 1),
    ])
      expect(cancelVacancySchema.safeParse({ reason }).success, reason).toBe(
        false,
      );
    expect(cancelVacancySchema.safeParse({}).success).toBe(false);
    expect(
      cancelVacancySchema.safeParse({ reason: 'Дубль', status: 'OPEN' })
        .success,
    ).toBe(false);
  });
});
