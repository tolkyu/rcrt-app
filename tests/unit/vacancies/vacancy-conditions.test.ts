import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { createVacancySchema } from '@/lib/schemas/vacancy';
import {
  emptyVacancyForm,
  isTitleLengthReady,
  type VacancyFormErrors,
  type VacancyFormValues,
} from '@/lib/vacancy-form';
import { classifyCreateFailure, planFailure } from '@/lib/vacancy-form-failure';
import { parseVacancyForm } from '@/lib/vacancy-form-submit';
import {
  VACANCY_EMPLOYMENT_TYPES,
  VACANCY_LOCATION_MAX,
  VACANCY_PROBATION_MAX,
  VACANCY_PROBATION_MIN,
  VACANCY_SENIORITIES,
  VACANCY_WORK_FORMATS,
} from '@/lib/vacancy-options';
import { salaryFieldCode } from '@/lib/vacancy-form-parse';
import { serverTextLength } from '@/lib/text-length';
import { createTranslator } from 'next-intl';
import messages from '@/messages/uk.json';

const VERTICAL = '8b1f5a0e-0c2d-4f6e-9d7a-2b3c4d5e6f70';
const POSITION = '3f1e2d3c-4b5a-4968-8776-655443322110';
const form = (patch: Partial<VacancyFormValues> = {}): VacancyFormValues => ({
  ...emptyVacancyForm(VERTICAL),
  title: 'Медіабаєр — Facebook',
  ...patch,
});
const errorsOf = (
  values: VacancyFormValues,
  mode: 'DRAFT' | 'PUBLISH' = 'DRAFT',
): VacancyFormErrors => {
  const result = parseVacancyForm(values, mode);
  return result.ok ? {} : result.errors;
};
const bodyOf = (values: VacancyFormValues) => {
  const result = parseVacancyForm(values, 'DRAFT');
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.body;
};
const contractAccepts = (extra: object) =>
  createVacancySchema.safeParse({
    mode: 'DRAFT',
    verticalId: VERTICAL,
    title: 'Назва',
    ...extra,
  }).success;

describe('the lists and limits the form offers are enforced by the contract [D111, D116]', () => {
  it.each([
    ...VACANCY_SENIORITIES.map((value) => ['seniority', value] as const),
    ...VACANCY_EMPLOYMENT_TYPES.map(
      (value) => ['employmentType', value] as const,
    ),
    ...VACANCY_WORK_FORMATS.map((value) => ['workFormat', value] as const),
  ])('the schema accepts %s %s', (field, value) => {
    expect(contractAccepts({ [field]: value })).toBe(true);
  });

  it('the schema refuses a value outside the lists, so none is missing from them', () => {
    expect(contractAccepts({ seniority: 'Стажер' })).toBe(false);
    expect(contractAccepts({ employmentType: 'Фріланс' })).toBe(false);
    expect(contractAccepts({ workFormat: 'MARS' })).toBe(false);
  });

  it('the schema takes the probation range and the location limit of the form', () => {
    const min = VACANCY_PROBATION_MIN;
    const max = VACANCY_PROBATION_MAX;
    expect(contractAccepts({ probationDays: min })).toBe(true);
    expect(contractAccepts({ probationDays: max })).toBe(true);
    expect(contractAccepts({ probationDays: min - 1 })).toBe(false);
    expect(contractAccepts({ probationDays: max + 1 })).toBe(false);
    expect(
      contractAccepts({ location: 'к'.repeat(VACANCY_LOCATION_MAX) }),
    ).toBe(true);
    expect(
      contractAccepts({ location: 'к'.repeat(VACANCY_LOCATION_MAX + 1) }),
    ).toBe(false);
  });

  it.each([
    [{ salaryMinMinor: '0', salaryCurrency: 'USD' }, true],
    [{ salaryMaxMinor: '999999999999999', salaryCurrency: 'UAH' }, true],
    [{ salaryMaxMinor: '1000000000000000', salaryCurrency: 'UAH' }, false],
    [{ salaryMinMinor: '-1', salaryCurrency: 'USD' }, false],
    [{ salaryMinMinor: '01', salaryCurrency: 'USD' }, false],
    [{ salaryMinMinor: '1.5', salaryCurrency: 'USD' }, false],
    [{ salaryMinMinor: '', salaryCurrency: 'USD' }, false],
    [{ salaryMinMinor: '100' }, false],
    [{ salaryCurrency: 'USD' }, false],
    [
      { salaryMinMinor: '200', salaryMaxMinor: '100', salaryCurrency: 'USD' },
      false,
    ],
    [
      { salaryMinMinor: '100', salaryMaxMinor: '100', salaryCurrency: 'EUR' },
      true,
    ],
    [{ probationDays: '60' }, false],
    [{ probationDays: 60.5 }, false],
  ] as const)(
    'the contract itself answers %j with %s, whatever the form does',
    (extra, accepted) => {
      expect(contractAccepts(extra)).toBe(accepted);
    },
  );

  it('every offered currency has a label in the catalog, USD first (D116)', () => {
    expect(Object.keys(messages.vacancyForm.salary.currencies)).toEqual([
      'USD',
      'EUR',
      'UAH',
    ]);
  });
});

describe('«Умови» → create body [VAC-01, D115, D116]', () => {
  it('sends nothing for an untouched group', () => {
    expect(bodyOf(form())).toEqual({
      mode: 'DRAFT',
      verticalId: VERTICAL,
      title: 'Медіабаєр — Facebook',
      headcount: 1,
      priority: 'NORMAL',
    });
  });

  it('maps every filled field to its contract key and minor units', () => {
    expect(
      bodyOf(
        form({
          seniority: 'Мідл',
          workFormat: 'HYBRID',
          employmentType: 'Повна зайнятість',
          location: '  Київ   (офіс) ',
          salaryMin: '2 500',
          salaryMax: '4 000,50',
          salaryCurrency: 'USD',
          probationDays: '60',
        }),
      ),
    ).toMatchObject({
      seniority: 'Мідл',
      workFormat: 'HYBRID',
      employmentType: 'Повна зайнятість',
      location: 'Київ (офіс)',
      salaryMinMinor: '250000',
      salaryMaxMinor: '400050',
      salaryCurrency: 'USD',
      probationDays: 60,
    });
  });

  it('sends a single bound with its currency and omits the other key', () => {
    const body = bodyOf(form({ salaryMin: '1000', salaryCurrency: 'UAH' }));
    expect(body).toMatchObject({ salaryMinMinor: '100000' });
    expect(body).not.toHaveProperty('salaryMaxMinor');
    expect(
      bodyOf(form({ salaryMax: '1000', salaryCurrency: 'EUR' })),
    ).toMatchObject({ salaryMaxMinor: '100000', salaryCurrency: 'EUR' });
  });

  it('a whitespace-only location and an empty probation are left out, so the server keeps its default', () => {
    const body = bodyOf(form({ location: '   ', probationDays: '' }));
    expect(body).not.toHaveProperty('location');
    expect(body).not.toHaveProperty('probationDays');
  });

  it('sends the same keys on publish', () => {
    const result = parseVacancyForm(
      form({ positionId: POSITION, salaryMin: '10', salaryCurrency: 'USD' }),
      'PUBLISH',
    );
    expect(result.ok && result.body).toMatchObject({
      mode: 'PUBLISH',
      salaryMinMinor: '1000',
      salaryCurrency: 'USD',
    });
  });
});

describe('«Умови» validation [ux §4.1]', () => {
  it.each([
    [
      'text',
      { salaryMin: 'abc', salaryCurrency: 'USD' },
      { salaryMin: 'salaryNumber' },
    ],
    [
      'text in the maximum',
      { salaryMax: '1,2,3', salaryCurrency: 'USD' },
      { salaryMax: 'salaryNumber' },
    ],
    [
      'too many digits',
      { salaryMax: '99999999999999999', salaryCurrency: 'USD' },
      { salaryMax: 'salaryTooLarge' },
    ],
    [
      'an amount without a currency',
      { salaryMin: '100' },
      { salaryCurrency: 'salaryCurrencyRequired' },
    ],
    [
      'a maximum without a currency',
      { salaryMax: '100' },
      { salaryCurrency: 'salaryCurrencyRequired' },
    ],
    [
      'a currency without an amount',
      { salaryCurrency: 'EUR' },
      { salaryCurrency: 'salaryCurrencyNoAmount' },
    ],
    [
      'a malformed currency next to an amount (only the contract refuses it)',
      { salaryMin: '100', salaryCurrency: 'US' },
      { salaryCurrency: 'salaryCurrencyRequired' },
    ],
    [
      'a good minimum, text in the maximum and a currency',
      { salaryMin: '100', salaryMax: 'abc', salaryCurrency: 'USD' },
      { salaryMax: 'salaryNumber' },
    ],
    [
      'text in both bounds and no currency: the text still counts as an amount',
      { salaryMin: 'abc', salaryMax: 'abc' },
      {
        salaryMin: 'salaryNumber',
        salaryMax: 'salaryNumber',
        salaryCurrency: 'salaryCurrencyRequired',
      },
    ],
    [
      'a maximum below the minimum',
      { salaryMin: '500', salaryMax: '499,99', salaryCurrency: 'USD' },
      { salaryMax: 'salaryMaxBelowMin' },
    ],
    [
      'probation 29',
      { probationDays: '29' },
      { probationDays: 'probationRange' },
    ],
    [
      'probation 91',
      { probationDays: '91' },
      { probationDays: 'probationRange' },
    ],
    [
      'probation text',
      { probationDays: '9x' },
      { probationDays: 'probationRange' },
    ],
    [
      'probation 0',
      { probationDays: '0' },
      { probationDays: 'probationRange' },
    ],
    [
      'probation 28',
      { probationDays: '28' },
      { probationDays: 'probationRange' },
    ],
    [
      'probation 92',
      { probationDays: '92' },
      { probationDays: 'probationRange' },
    ],
    [
      'a negative probation',
      { probationDays: '-30' },
      { probationDays: 'probationRange' },
    ],
    [
      'a fractional probation',
      { probationDays: '30,5' },
      { probationDays: 'probationRange' },
    ],
    [
      'an exponent probation',
      { probationDays: '1e2' },
      { probationDays: 'probationRange' },
    ],
    [
      'a probation of six digits',
      { probationDays: '000060' },
      { probationDays: 'probationRange' },
    ],
    [
      'a negative minimum',
      { salaryMin: '-5', salaryCurrency: 'USD' },
      { salaryMin: 'salaryNumber' },
    ],
    [
      'a negative maximum',
      { salaryMax: '-0,01', salaryCurrency: 'USD' },
      { salaryMax: 'salaryNumber' },
    ],
    [
      'a 16-digit amount',
      { salaryMax: '1234567890123456', salaryCurrency: 'USD' },
      { salaryMax: 'salaryTooLarge' },
    ],
    [
      'a 16-digit minimum with a currency',
      { salaryMin: '9999999999999999', salaryCurrency: 'EUR' },
      { salaryMin: 'salaryTooLarge' },
    ],
    [
      'a 14-digit amount (one over the stored range)',
      { salaryMin: '10000000000000', salaryCurrency: 'UAH' },
      { salaryMin: 'salaryTooLarge' },
    ],
    [
      'a maximum of 0,01 below a minimum of 0,02',
      { salaryMin: '0,02', salaryMax: '0,01', salaryCurrency: 'USD' },
      { salaryMax: 'salaryMaxBelowMin' },
    ],
    [
      'a maximum below the minimum when both carry thousands separators',
      { salaryMin: '2 500,50', salaryMax: '2 500,49', salaryCurrency: 'USD' },
      { salaryMax: 'salaryMaxBelowMin' },
    ],
    [
      'a bad minimum and a maximum below it: only the text is reported',
      { salaryMin: 'x', salaryMax: '5', salaryCurrency: 'USD' },
      { salaryMin: 'salaryNumber' },
    ],
    [
      'two amounts without a currency',
      { salaryMin: '1', salaryMax: '2' },
      { salaryCurrency: 'salaryCurrencyRequired' },
    ],
    [
      'a whitespace-only amount with a currency',
      { salaryMin: '   ', salaryCurrency: 'USD' },
      { salaryCurrency: 'salaryCurrencyNoAmount' },
    ],
    [
      'a location of 201 characters',
      { location: 'к'.repeat(201) },
      { location: 'locationLong' },
    ],
    [
      'a location with a control character',
      { location: 'Київ\u0000' },
      { location: 'locationChars' },
    ],
    [
      'a seniority outside the list',
      { seniority: 'Стажер' },
      { seniority: 'optionInvalid' },
    ],
    [
      'a work format outside the list',
      { workFormat: 'MARS' },
      { workFormat: 'optionInvalid' },
    ],
    [
      'an employment type outside the list',
      { employmentType: 'Фріланс' },
      { employmentType: 'optionInvalid' },
    ],
  ] as const)('%s', (_name, patch, expected) => {
    expect(errorsOf(form(patch))).toEqual(expected);
  });

  it.each([
    [{ salaryMin: '500', salaryMax: '500', salaryCurrency: 'USD' }],
    [{ salaryMin: '0', salaryCurrency: 'USD' }],
    [{ probationDays: '30' }],
    [{ probationDays: '90' }],
    [{ probationDays: ' 60 ' }],
    [{ probationDays: '030' }],
    [{ salaryMin: '2 500,50', salaryMax: '2 500,50', salaryCurrency: 'USD' }],
    [{ salaryMin: '9999999999999,99', salaryCurrency: 'USD' }],
    [{ salaryMax: '0', salaryCurrency: 'UAH' }],
    [{ salaryMin: '0', salaryMax: '0', salaryCurrency: 'EUR' }],
    [{ location: 'к'.repeat(200) }],
  ])('accepts %j on both actions', (patch) => {
    expect(errorsOf(form(patch), 'DRAFT')).toEqual({});
    expect(
      errorsOf(form({ ...patch, positionId: POSITION }), 'PUBLISH'),
    ).toEqual({});
  });

  it('reports the salary and probation mistakes together with the others, in one pass', () => {
    expect(
      errorsOf(
        form({
          title: '',
          salaryMin: 'x',
          salaryCurrency: 'USD',
          probationDays: '5',
        }),
      ),
    ).toEqual({
      title: 'titleRequired',
      salaryMin: 'salaryNumber',
      probationDays: 'probationRange',
    });
  });
});

describe('server answer for the «Умови» fields [ux §4.1, §4.2]', () => {
  const refuse = (path: string, code: string) =>
    new ApiError(400, 'VALIDATION_FAILED', [{ path, code }]);

  it.each([
    ['body.location', 'too_big', 'location', 'locationLong'],
    ['body.location', 'custom', 'location', 'locationChars'],
    ['body.salaryMinMinor', 'invalid_format', 'salaryMin', 'salaryNumber'],
    ['body.salaryMaxMinor', 'invalid_format', 'salaryMax', 'salaryNumber'],
    ['body.salaryMaxMinor', 'custom', 'salaryMax', 'salaryMaxBelowMin'],
    ['body.salaryMaxMinor', 'invalid_salary', 'salaryMax', 'salaryMaxBelowMin'],
    ['body.probationDays', 'too_big', 'probationDays', 'probationRange'],
    ['body.probationDays', 'too_small', 'probationDays', 'probationRange'],
    ['body.seniority', 'invalid_value', 'seniority', 'optionInvalid'],
    ['body.workFormat', 'invalid_value', 'workFormat', 'optionInvalid'],
    ['body.employmentType', 'invalid_value', 'employmentType', 'optionInvalid'],
  ] as const)('%s %s lands on %s as %s', (path, code, field, message) => {
    expect(classifyCreateFailure(refuse(path, code))).toEqual({
      kind: 'fields',
      errors: { [field]: message },
    });
    expect(planFailure(refuse(path, code), false)).toEqual({
      type: 'fields',
      errors: { [field]: message },
    });
  });

  it('a currency error reads differently with and without an amount', () => {
    const error = refuse('body.salaryCurrency', 'custom');
    expect(classifyCreateFailure(error, { hasSalaryAmount: true })).toEqual({
      kind: 'fields',
      errors: { salaryCurrency: 'salaryCurrencyRequired' },
    });
    expect(classifyCreateFailure(error, { hasSalaryAmount: false })).toEqual({
      kind: 'fields',
      errors: { salaryCurrency: 'salaryCurrencyNoAmount' },
    });
  });

  it('several refused fields arrive together and keep the first code per field', () => {
    const error = new ApiError(400, 'VALIDATION_FAILED', [
      { path: 'body.salaryMaxMinor', code: 'custom' },
      { path: 'body.salaryMaxMinor', code: 'invalid_format' },
      { path: 'body.probationDays', code: 'too_big' },
    ]);
    expect(classifyCreateFailure(error)).toEqual({
      kind: 'fields',
      errors: {
        salaryMax: 'salaryMaxBelowMin',
        probationDays: 'probationRange',
      },
    });
  });
});

describe('salaryFieldCode: one reading of a salary refusal [ux §4.1]', () => {
  it.each([
    ['salaryMin', 'custom', true, 'salaryNumber'],
    ['salaryMin', 'invalid_format', false, 'salaryNumber'],
    ['salaryMax', 'invalid_format', true, 'salaryNumber'],
    ['salaryMax', 'custom', true, 'salaryMaxBelowMin'],
    ['salaryMax', 'invalid_salary', false, 'salaryMaxBelowMin'],
    ['salaryCurrency', 'custom', true, 'salaryCurrencyRequired'],
    ['salaryCurrency', 'custom', false, 'salaryCurrencyNoAmount'],
  ] as const)('%s %s (amount %s) → %s', (field, code, hasAmount, message) => {
    expect(salaryFieldCode(field, code, hasAmount)).toBe(message);
  });
});

describe('readiness «Назва» uses the length the server counts [VAC-01]', () => {
  it.each([
    ['', false],
    ['   ', false],
    ['а', false],
    ['аб', true],
    ['  а  ', false],
    ['а   б', true],
    ['😀', false],
    ['😀😀', true],
    ['к'.repeat(200), true],
    ['к'.repeat(201), false],
  ])('%j → %s', (title, ready) => {
    expect(isTitleLengthReady(serverTextLength(title))).toBe(ready);
  });
});

describe('the read-only probation line agrees the noun with the number [uk plural]', () => {
  const line = (days: number) =>
    createTranslator({ locale: 'uk', messages, namespace: 'vacancyForm' })(
      'probation.readOnly',
      { days },
    );
  it.each([
    [30, '30 днів'],
    [31, '31 день'],
    [32, '32 дні'],
    [35, '35 днів'],
    [90, '90 днів'],
  ])('%s → %s', (days, phrase) => {
    expect(line(days)).toContain(`— ${phrase}.`);
  });
});
