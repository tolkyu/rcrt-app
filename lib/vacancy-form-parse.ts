/** Kept apart from the rest of the form logic because it pulls Zod (~28 kB gz): the form loads it on its first validation, not with the page (PERF-04). */
import { normalizePositionName } from '@/lib/position-name';
import {
  createVacancySchema,
  type CreateVacancyBody,
} from '@/lib/schemas/vacancy';
import {
  type VacancyFormErrorCode,
  type VacancyFormErrors,
  type VacancyFormMode,
  type VacancyFormValues,
} from '@/lib/vacancy-form';
import { parseSalaryAmount } from '@/lib/vacancy-salary';

/** Invalid characters outrank length, and an empty title reads as «required» rather than «too short». */
export function titleCode(
  empty: boolean,
  codes: readonly string[],
): VacancyFormErrorCode {
  if (codes.includes('custom')) return 'titleChars';
  if (empty) return 'titleRequired';
  return codes.includes('too_big') ? 'titleLong' : 'titleShort';
}

/** Location is optional, so only its two refusals exist: too long, or characters the contract rejects. */
export const locationCode = (codes: readonly string[]): VacancyFormErrorCode =>
  codes.includes('custom') || !codes.includes('too_big')
    ? 'locationChars'
    : 'locationLong';

export type SalaryFormField = 'salaryMin' | 'salaryMax' | 'salaryCurrency';

/** Contract path of each salary input. */
const SALARY_FIELD_OF_KEY: Readonly<Record<string, SalaryFormField>> = {
  salaryMinMinor: 'salaryMin',
  salaryMaxMinor: 'salaryMax',
  salaryCurrency: 'salaryCurrency',
};

/** One reading of a salary refusal for the client rules and the server answer; the currency text depends on whether an amount is present. */
export function salaryFieldCode(
  field: SalaryFormField,
  code: string,
  hasAmount: boolean,
): VacancyFormErrorCode {
  if (field === 'salaryMin') return 'salaryNumber';
  if (field === 'salaryMax')
    return code === 'invalid_format' ? 'salaryNumber' : 'salaryMaxBelowMin';
  return hasAmount ? 'salaryCurrencyRequired' : 'salaryCurrencyNoAmount';
}

const DIGITS = /^\d{1,5}$/;

interface SalaryOutcome {
  readonly minor: { salaryMinMinor?: string; salaryMaxMinor?: string };
  readonly errors: VacancyFormErrors;
  readonly hasAmount: boolean;
}

/** Salary rules of the form (ux §2, §4.1): each amount must parse, a currency goes with an amount and only with one, and the maximum never undercuts the minimum. */
function readSalary(values: VacancyFormValues): SalaryOutcome {
  const errors: VacancyFormErrors = {};
  const minor: { salaryMinMinor?: string; salaryMaxMinor?: string } = {};
  for (const [field, key] of [
    ['salaryMin', 'salaryMinMinor'],
    ['salaryMax', 'salaryMaxMinor'],
  ] as const) {
    const text = values[field].trim();
    if (!text) continue;
    const amount = parseSalaryAmount(text);
    if (amount.ok) minor[key] = amount.minor;
    else errors[field] = amount.error;
  }
  const hasAmount =
    values.salaryMin.trim() !== '' || values.salaryMax.trim() !== '';
  if (hasAmount && !values.salaryCurrency)
    errors.salaryCurrency = 'salaryCurrencyRequired';
  if (!hasAmount && values.salaryCurrency)
    errors.salaryCurrency = 'salaryCurrencyNoAmount';
  if (
    minor.salaryMinMinor !== undefined &&
    minor.salaryMaxMinor !== undefined &&
    BigInt(minor.salaryMinMinor) > BigInt(minor.salaryMaxMinor)
  )
    errors.salaryMax = 'salaryMaxBelowMin';
  return { minor, errors, hasAmount };
}

/** Only what the user filled in is sent: an empty position, headcount, Team Lead, option or probation is left out, so the server default or its own error applies. */
function toInput(
  values: VacancyFormValues,
  mode: VacancyFormMode,
  salary: SalaryOutcome,
): unknown {
  const headcount = values.headcount.trim();
  const probation = values.probationDays.trim();
  const location = values.location.trim();
  return {
    mode,
    verticalId: values.verticalId || undefined,
    ...(values.positionId ? { positionId: values.positionId } : {}),
    title: values.title,
    ...(headcount
      ? { headcount: DIGITS.test(headcount) ? Number(headcount) : NaN }
      : {}),
    priority: values.priority,
    ...(values.teamLeadId ? { teamLeadId: values.teamLeadId } : {}),
    ...(values.seniority ? { seniority: values.seniority } : {}),
    ...(values.workFormat ? { workFormat: values.workFormat } : {}),
    ...(values.employmentType ? { employmentType: values.employmentType } : {}),
    ...(location ? { location } : {}),
    ...salary.minor,
    ...(values.salaryCurrency ? { salaryCurrency: values.salaryCurrency } : {}),
    ...(probation
      ? { probationDays: DIGITS.test(probation) ? Number(probation) : NaN }
      : {}),
  };
}

/** The shared create schema decides; this only turns its issues into field codes. DRAFT needs vertical and title, PUBLISH also the position and the headcount. */
export function parseVacancyForm(
  values: VacancyFormValues,
  mode: VacancyFormMode,
):
  | { readonly ok: true; readonly body: CreateVacancyBody }
  | { readonly ok: false; readonly errors: VacancyFormErrors } {
  const salary = readSalary(values);
  const result = createVacancySchema.safeParse(toInput(values, mode, salary));
  const errors: VacancyFormErrors = { ...salary.errors };
  const textRefused = Boolean(
    salary.errors.salaryMin || salary.errors.salaryMax,
  );
  if (mode === 'PUBLISH' && !values.headcount.trim())
    errors.headcount = 'headcountRange';
  if (!result.success) {
    const titleCodes: string[] = [];
    const locationCodes: string[] = [];
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if (field === 'verticalId') errors.verticalId = 'verticalRequired';
      else if (field === 'positionId') errors.positionId = 'positionRequired';
      else if (field === 'headcount') errors.headcount = 'headcountRange';
      else if (field === 'teamLeadId') errors.teamLeadId = 'teamLeadInvalid';
      else if (field === 'title') titleCodes.push(issue.code);
      else if (field === 'location') locationCodes.push(issue.code);
      else if (
        field === 'seniority' ||
        field === 'workFormat' ||
        field === 'employmentType'
      )
        errors[field] = 'optionInvalid';
      else if (field === 'probationDays')
        errors.probationDays = 'probationRange';
      else {
        // The salary rules ran above; the schema speaks only if the two ever drift apart.
        const salaryField = SALARY_FIELD_OF_KEY[String(field)];
        if (salaryField && !errors[salaryField] && !textRefused)
          errors[salaryField] = salaryFieldCode(
            salaryField,
            issue.code,
            salary.hasAmount,
          );
      }
    }
    if (titleCodes.length > 0)
      errors.title = titleCode(
        normalizePositionName(values.title) === '',
        titleCodes,
      );
    if (locationCodes.length > 0) errors.location = locationCode(locationCodes);
  }
  return result.success && Object.keys(errors).length === 0
    ? { ok: true, body: result.data }
    : { ok: false, errors };
}
