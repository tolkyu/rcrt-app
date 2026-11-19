/** How a failed create maps to field codes and form effects; shares the lazy parse module's code readers (PERF-04). */
import { ApiError } from '@/lib/api-client';
import {
  type VacancyFormErrorCode,
  type VacancyFormErrors,
  type VacancyFormField,
} from '@/lib/vacancy-form';
import {
  locationCode,
  salaryFieldCode,
  titleCode,
} from '@/lib/vacancy-form-parse';

export type CreateFailure =
  | { readonly kind: 'fields'; readonly errors: VacancyFormErrors }
  | { readonly kind: 'draftLimit' }
  | { readonly kind: 'verticalUnavailable' }
  | { readonly kind: 'rateLimited' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'keyReused' }
  | { readonly kind: 'network' }
  | { readonly kind: 'failed' };

const FIELD_OF_PATH: Readonly<Record<string, VacancyFormField>> = {
  'body.verticalId': 'verticalId',
  'body.positionId': 'positionId',
  'body.title': 'title',
  'body.headcount': 'headcount',
  'body.teamLeadId': 'teamLeadId',
  'body.seniority': 'seniority',
  'body.workFormat': 'workFormat',
  'body.employmentType': 'employmentType',
  'body.location': 'location',
  'body.salaryMinMinor': 'salaryMin',
  'body.salaryMaxMinor': 'salaryMax',
  'body.salaryCurrency': 'salaryCurrency',
  'body.probationDays': 'probationDays',
};

/** What a failed attempt carried that the answer's codes do not say: a currency error reads differently with and without an amount. */
export interface FailureContext {
  readonly hasSalaryAmount: boolean;
}

const NO_CONTEXT: FailureContext = { hasSalaryAmount: false };

function fieldCode(
  field: VacancyFormField,
  code: string,
  { hasSalaryAmount }: FailureContext,
): VacancyFormErrorCode {
  if (field === 'verticalId') return 'verticalRequired';
  if (field === 'headcount') return 'headcountRange';
  if (field === 'teamLeadId') return 'teamLeadInvalid';
  if (
    field === 'seniority' ||
    field === 'workFormat' ||
    field === 'employmentType'
  )
    return 'optionInvalid';
  if (field === 'location') return locationCode([code]);
  if (
    field === 'salaryMin' ||
    field === 'salaryMax' ||
    field === 'salaryCurrency'
  )
    return salaryFieldCode(field, code, hasSalaryAmount);
  if (field === 'probationDays') return 'probationRange';
  if (field === 'positionId')
    return code === 'invalid_position'
      ? 'positionInvalid'
      : code === 'position_inactive'
        ? 'positionInactive'
        : 'positionRequired';
  return titleCode(false, [code]);
}

/** Server answer → what the form shows; the code set is the one of `POST /vacancies` (S1 contract). */
export function classifyCreateFailure(
  error: unknown,
  context: FailureContext = NO_CONTEXT,
): CreateFailure {
  if (!(error instanceof ApiError)) return { kind: 'network' };
  if (error.status === 429) return { kind: 'rateLimited' };
  if (error.status === 403) return { kind: 'forbidden' };
  if (error.status === 404) return { kind: 'verticalUnavailable' };
  if (error.code === 'DRAFT_LIMIT_REACHED') return { kind: 'draftLimit' };
  if (error.code === 'IDEMPOTENCY_KEY_REUSED') return { kind: 'keyReused' };
  if (error.code === 'POSITION_INACTIVE')
    return { kind: 'fields', errors: { positionId: 'positionInactive' } };
  if (error.status === 400 || error.status === 409) {
    const errors: VacancyFormErrors = {};
    for (const { path, code } of error.fieldErrors) {
      const field = FIELD_OF_PATH[path];
      if (field && !errors[field])
        errors[field] = fieldCode(field, code, context);
    }
    if (Object.keys(errors).length > 0) return { kind: 'fields', errors };
  }
  return { kind: 'failed' };
}

export type FailureEffect =
  | { readonly type: 'fields'; readonly errors: VacancyFormErrors }
  | {
      readonly type: 'alert';
      readonly alert: 'draftLimit' | 'verticalUnavailable';
    }
  | { readonly type: 'retry' }
  | {
      readonly type: 'toast';
      readonly tone: 'warning' | 'error';
      readonly title: 'rateLimited' | 'forbidden' | 'noConnection' | 'failed';
      readonly description?: 'noConnectionDescription' | 'failedDescription';
      readonly retry: boolean;
    };

const GENERIC_FAILURE = {
  type: 'toast',
  tone: 'error',
  title: 'failed',
  description: 'failedDescription',
  retry: true,
} as const;

/** What the form does with a failed create; a reused idempotency key gets one silent retry under a fresh key, then the generic error. */
export function planFailure(
  error: unknown,
  retried: boolean,
  context: FailureContext = NO_CONTEXT,
): FailureEffect {
  const failure = classifyCreateFailure(error, context);
  switch (failure.kind) {
    case 'fields':
      return { type: 'fields', errors: failure.errors };
    case 'draftLimit':
    case 'verticalUnavailable':
      return { type: 'alert', alert: failure.kind };
    case 'rateLimited':
      return {
        type: 'toast',
        tone: 'warning',
        title: failure.kind,
        retry: false,
      };
    case 'forbidden':
      return {
        type: 'toast',
        tone: 'error',
        title: failure.kind,
        retry: false,
      };
    case 'keyReused':
      return retried ? GENERIC_FAILURE : { type: 'retry' };
    case 'network':
      return {
        type: 'toast',
        tone: 'error',
        title: 'noConnection',
        description: 'noConnectionDescription',
        retry: true,
      };
    case 'failed':
      return GENERIC_FAILURE;
  }
}

export type EditFailureEffect =
  | Exclude<FailureEffect, { readonly type: 'alert' }>
  | { readonly type: 'stale' }
  | { readonly type: 'notDraft' }
  | { readonly type: 'gone' };

/** What the edit form does with a failed PATCH or publish: the draft-specific answers first, then the create rules (their create-only alerts cannot come from a draft, so they read as a generic failure). */
export function planEditFailure(
  error: unknown,
  retried: true,
  context?: FailureContext,
): Exclude<EditFailureEffect, { readonly type: 'retry' }>;
export function planEditFailure(
  error: unknown,
  retried: boolean,
  context?: FailureContext,
): EditFailureEffect;
export function planEditFailure(
  error: unknown,
  retried: boolean,
  context: FailureContext = NO_CONTEXT,
): EditFailureEffect {
  if (error instanceof ApiError) {
    if (error.status === 404) return { type: 'gone' };
    if (error.code === 'STALE_STATE') return { type: 'stale' };
    if (error.code === 'VACANCY_NOT_DRAFT') return { type: 'notDraft' };
  }
  const effect = planFailure(error, retried, context);
  return effect.type === 'alert' ? GENERIC_FAILURE : effect;
}
