/** Everything the form needs only after the user acts (validate, send, react to the answer); loaded on mount, outside the page's initial JavaScript (PERF-04). */
import type { QueryClient } from '@tanstack/react-query';
import type { useTranslations } from 'next-intl';
import type {
  FieldErrors,
  ResolverResult,
  UseFormReturn,
} from 'react-hook-form';
import { apiRequest, ApiError } from '@/lib/api-client';
import { activePositionsQuery } from '@/lib/queries/positions';
import type { PositionList } from '@/lib/schemas/position';
import { queryKeys } from '@/lib/query-keys';
import {
  vacancyDetailSchema,
  type CreateVacancyBody,
} from '@/lib/schemas/vacancy';
import { toast } from '@/lib/toast';
import { vacancyPageUrlSearch } from '@/lib/vacancy-filters';
import {
  savedVacancyListSearch,
  vacancyListHref,
} from '@/lib/vacancy-list-memory';
import { VACANCY_DRAFT_LIMIT } from '@/lib/vacancy-limits';
import {
  type VacancyFormErrorCode,
  type VacancyFormErrors,
  type VacancyFormField,
  type VacancyFormMode,
  type VacancyFormValues,
} from '@/lib/vacancy-form';
import { parseVacancyForm, titleCode } from '@/lib/vacancy-form-parse';

export { parseVacancyForm };
export { serverTextLength } from '@/lib/text-length';

/** List the user lands on after saving a draft: «Чернетки» of the draft's own vertical with the new draft selected (D83 would otherwise hide it). */
export const vacancyDraftLandingHref = (
  verticalId: string,
  vacancyId: string,
) =>
  `/vacancies?${vacancyPageUrlSearch({
    filters: { status: 'DRAFT', vertical: verticalId },
    selected: vacancyId,
  })}`;

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
};

function fieldCode(
  field: VacancyFormField,
  code: string,
): VacancyFormErrorCode {
  if (field === 'verticalId') return 'verticalRequired';
  if (field === 'headcount') return 'headcountRange';
  if (field === 'positionId')
    return code === 'invalid_position'
      ? 'positionInvalid'
      : code === 'position_inactive'
        ? 'positionInactive'
        : 'positionRequired';
  return titleCode(false, [code]);
}

/** Server answer → what the form shows; the code set is the one of `POST /vacancies` (S1 contract). */
export function classifyCreateFailure(error: unknown): CreateFailure {
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
      if (field && !errors[field]) errors[field] = fieldCode(field, code);
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

const GENERIC_FAILURE: FailureEffect = {
  type: 'toast',
  tone: 'error',
  title: 'failed',
  description: 'failedDescription',
  retry: true,
};

/** What the form does with a failed create; a reused idempotency key gets one silent retry under a fresh key, then the generic error. */
export function planFailure(error: unknown, retried: boolean): FailureEffect {
  const failure = classifyCreateFailure(error);
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

/** One key per attempt: a retry of the same body reuses it (the server replays the first result), any change gets a new one. */
export function createAttemptKeys(
  newKey: () => string = () => crypto.randomUUID(),
) {
  let current: { signature: string; key: string } | null = null;
  return {
    keyFor(body: unknown): string {
      const signature = JSON.stringify(body);
      if (current?.signature !== signature)
        current = { signature, key: newKey() };
      return current.key;
    },
    reset() {
      current = null;
    },
  };
}

export const createVacancy = (body: CreateVacancyBody, key: string) =>
  apiRequest('/vacancies', {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': key },
    schema: vacancyDetailSchema,
  });

type CreatedVacancy = Awaited<ReturnType<typeof createVacancy>>;

export type FinalFailure = Exclude<FailureEffect, { readonly type: 'retry' }>;

export type CreateOutcome =
  | { readonly status: 'created'; readonly created: CreatedVacancy }
  | { readonly status: 'failed'; readonly effect: FinalFailure };

/** The caches are updated here, before the page may have gone away: a created vacancy must reach the lists even if the form unmounted meanwhile. */
export async function submitCreate(
  queryClient: QueryClient,
  attempts: ReturnType<typeof createAttemptKeys>,
  body: CreateVacancyBody,
): Promise<CreateOutcome> {
  for (let retried = false; ; retried = true) {
    try {
      const created = await createVacancy(body, attempts.keyFor(body));
      applyCreatedVacancy(queryClient, created);
      return { status: 'created', created };
    } catch (error) {
      const effect = planFailure(error, retried);
      if (effect.type !== 'retry') return { status: 'failed', effect };
      attempts.reset();
    }
  }
}

/** Seeds the card cache and refreshes every vacancy list, which also refreshes the «Чернетки» count (`['vacancies', 'draft-count']`). */
export function applyCreatedVacancy(
  queryClient: QueryClient,
  created: CreatedVacancy,
) {
  queryClient.setQueryData(queryKeys.vacancy(created.id), created);
  void queryClient.invalidateQueries({ queryKey: ['vacancies'] });
}

export interface PositionsSeed {
  readonly list: PositionList;
  readonly loadedAt: number;
}

/** The server-loaded list of the preset vertical enters the cache with its own age, so staleness counts from the page load, not from the first search. */
export function fetchActivePositions(
  queryClient: QueryClient,
  verticalId: string,
  initialVerticalId: string,
  seed: PositionsSeed | undefined,
) {
  const { queryKey } = activePositionsQuery(verticalId);
  if (
    seed &&
    verticalId === initialVerticalId &&
    !queryClient.getQueryData(queryKey)
  )
    queryClient.setQueryData(queryKey, seed.list, { updatedAt: seed.loadedAt });
  return queryClient.fetchQuery(activePositionsQuery(verticalId));
}

export const cachedPositionName = (
  queryClient: QueryClient,
  verticalId: string,
  positionId: string,
) =>
  queryClient
    .getQueryData(activePositionsQuery(verticalId).queryKey)
    ?.items.find((position) => position.id === positionId)?.name;

const toFieldErrors = (
  errors: VacancyFormErrors,
): FieldErrors<VacancyFormValues> =>
  Object.fromEntries(
    Object.entries(errors).map(([field, code]) => [
      field,
      { type: 'validate', message: code },
    ]),
  );

/** The result shape react-hook-form expects from a resolver; the error message carries the field code. */
export function resolveVacancyForm(
  values: VacancyFormValues,
  mode: VacancyFormMode,
): ResolverResult<VacancyFormValues> {
  const result = parseVacancyForm(values, mode);
  return result.ok
    ? { values, errors: {} }
    : { values: {}, errors: toFieldErrors(result.errors) };
}

/** The title follows the position only while it is empty or still the auto-filled text; a title the user typed is never overwritten. Returns the auto-filled title now in the field. */
export function applyPosition(
  {
    getValues,
    setValue,
  }: Pick<UseFormReturn<VacancyFormValues>, 'getValues' | 'setValue'>,
  errors: FieldErrors<VacancyFormValues>,
  autoTitle: string,
  id: string,
  name: string | undefined,
): string {
  setValue('positionId', id, {
    shouldDirty: true,
    shouldTouch: true,
    shouldValidate: Boolean(errors.positionId),
  });
  const current = getValues('title');
  if (id && name && (current === '' || current === autoTitle)) {
    setValue('title', name, {
      shouldDirty: true,
      shouldValidate: Boolean(errors.title),
    });
    return name;
  }
  if (!id && autoTitle && current === autoTitle) {
    setValue('title', '', { shouldDirty: true });
    return '';
  }
  return autoTitle;
}

type Translate = ReturnType<typeof useTranslations<'vacancyForm'>>;

/** The toast of a failed create; `retry` is offered only where the same body may be sent again. */
export function showFailureToast(
  t: Translate,
  effect: Extract<FinalFailure, { readonly type: 'toast' }>,
  retry: () => void,
) {
  toast[effect.tone](t(`toast.${effect.title}`), {
    description: effect.description && t(`toast.${effect.description}`),
    action: effect.retry
      ? { label: t('toast.retry'), onAction: retry }
      : undefined,
  });
}

/** Announces the saved vacancy and returns where the form goes next: the card after a publish, the author's «Чернетки» after a draft. */
export function announceCreated(
  t: Translate,
  body: CreateVacancyBody,
  created: CreatedVacancy,
): string {
  toast.success(
    t(body.mode === 'PUBLISH' ? 'toast.created' : 'toast.draftSaved'),
    {
      description: t('toast.summary', {
        number: created.number,
        title: created.title,
      }),
    },
  );
  return body.mode === 'PUBLISH'
    ? `/vacancies/${created.id}`
    : vacancyDraftLandingHref(created.vertical.id, created.id);
}

/** The inline alerts need their own chunk; when it is missing the same message goes out as a toast, so a refusal never goes unseen. */
export const showAlertToast = (
  t: Translate,
  tVacancies: ReturnType<typeof useTranslations<'vacancies'>>,
  alert: 'draftLimit' | 'verticalUnavailable',
) =>
  toast.error(
    alert === 'draftLimit'
      ? tVacancies('createErrors.draftLimitReached', {
          count: VACANCY_DRAFT_LIMIT,
        })
      : t('alerts.verticalUnavailable'),
  );

/** The list the form's back link and «Скасувати» return to: the one the user came from. */
export const rememberedListHref = () =>
  vacancyListHref(savedVacancyListSearch());
