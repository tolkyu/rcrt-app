/** Everything the form needs only after the user acts (validate, send, react to the answer); loaded on mount, outside the page's initial JavaScript (PERF-04). */
import type { QueryClient } from '@tanstack/react-query';
import type { useTranslations } from 'next-intl';
import type {
  FieldErrors,
  ResolverResult,
  UseFormReturn,
} from 'react-hook-form';
import { apiRequest } from '@/lib/api-client';
import { activePositionsQuery } from '@/lib/queries/positions';
import {
  assignableTeamLeadsQuery,
  teamLeadKeys,
} from '@/lib/queries/team-leads';
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
  type FilledField,
  type VacancyFormErrors,
  type VacancyFormMode,
  type VacancyFormValues,
} from '@/lib/vacancy-form';
import { planFailure, type FailureEffect } from '@/lib/vacancy-form-failure';
import { parseVacancyForm } from '@/lib/vacancy-form-parse';
import {
  applyCreatedVacancy,
  type createAttemptKeys,
} from '@/lib/vacancy-create-result';
import { normalizeSalaryText } from '@/lib/vacancy-salary';

export { parseVacancyForm };
/** The lazy submit chunk is the surface the create and edit hooks and `vacancy-edit-submit` (`export *`) read. */
export {
  applyCreatedVacancy,
  createAttemptKeys,
} from '@/lib/vacancy-create-result';
export { serverTextLength } from '@/lib/text-length';
export { normalizeSalaryText };

/** List the user lands on after saving a draft: «Чернетки» of the draft's own vertical with the new draft selected (D83 would otherwise hide it). */
export const vacancyDraftLandingHref = (
  verticalId: string,
  vacancyId: string,
) =>
  `/vacancies?${vacancyPageUrlSearch({
    filters: { status: 'DRAFT', vertical: verticalId },
    selected: vacancyId,
  })}`;

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
      const effect = planFailure(error, retried, {
        hasSalaryAmount:
          body.salaryMinMinor != null || body.salaryMaxMinor != null,
      });
      if (effect.type !== 'retry') return { status: 'failed', effect };
      attempts.reset();
    }
  }
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

/** The server's 409 proves the author holds the maximum, so the cached count follows and the draft button explains itself; a refetch corrects it once drafts are removed. */
export async function applyDraftLimitHit(queryClient: QueryClient) {
  const queryKey = queryKeys.vacancyDraftCount();
  // A count request still in flight would land after the write and undo it.
  await queryClient.cancelQueries({ queryKey });
  queryClient.setQueryData(queryKey, { count: VACANCY_DRAFT_LIMIT });
}

/** After the server refused a Team Lead the cached list is stale: the person may have been deactivated or moved. */
export const refreshAssignableTeamLeads = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: teamLeadKeys.all });

/** A refused position or Team Lead means the cached picker lists are out of date. */
export function refreshAfterFieldErrors(
  queryClient: QueryClient,
  errors: VacancyFormErrors,
) {
  if (errors.positionId === 'positionInactive')
    void queryClient.invalidateQueries({ queryKey: queryKeys.positionsAll() });
  if (errors.teamLeadId) void refreshAssignableTeamLeads(queryClient);
}

export const fetchAssignableTeamLeads = (
  queryClient: QueryClient,
  verticalId: string,
) => queryClient.fetchQuery(assignableTeamLeadsQuery(verticalId));

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
  filled: readonly FilledField[] = [],
): ResolverResult<VacancyFormValues> {
  const result = parseVacancyForm(values, mode, filled);
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
