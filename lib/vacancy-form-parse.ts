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

/** Invalid characters outrank length, and an empty title reads as «required» rather than «too short». */
export function titleCode(
  empty: boolean,
  codes: readonly string[],
): VacancyFormErrorCode {
  if (codes.includes('custom')) return 'titleChars';
  if (empty) return 'titleRequired';
  return codes.includes('too_big') ? 'titleLong' : 'titleShort';
}

const DIGITS = /^\d{1,5}$/;

/** Only what the user filled in is sent: an empty position, headcount or Team Lead is left out, so the server default or its own error applies. */
function toInput(values: VacancyFormValues, mode: VacancyFormMode): unknown {
  const headcount = values.headcount.trim();
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
  };
}

/** The shared create schema decides; this only turns its issues into field codes. DRAFT needs vertical and title, PUBLISH also the position and the headcount. */
export function parseVacancyForm(
  values: VacancyFormValues,
  mode: VacancyFormMode,
):
  | { readonly ok: true; readonly body: CreateVacancyBody }
  | { readonly ok: false; readonly errors: VacancyFormErrors } {
  const result = createVacancySchema.safeParse(toInput(values, mode));
  const errors: VacancyFormErrors = {};
  if (mode === 'PUBLISH' && !values.headcount.trim())
    errors.headcount = 'headcountRange';
  if (!result.success) {
    const titleCodes: string[] = [];
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if (field === 'verticalId') errors.verticalId = 'verticalRequired';
      else if (field === 'positionId') errors.positionId = 'positionRequired';
      else if (field === 'headcount') errors.headcount = 'headcountRange';
      else if (field === 'teamLeadId') errors.teamLeadId = 'teamLeadInvalid';
      else if (field === 'title') titleCodes.push(issue.code);
    }
    if (titleCodes.length > 0)
      errors.title = titleCode(
        normalizePositionName(values.title) === '',
        titleCodes,
      );
  }
  return result.success && Object.keys(errors).length === 0
    ? { ok: true, body: result.data }
    : { ok: false, errors };
}
