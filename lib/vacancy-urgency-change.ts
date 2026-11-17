/** Changing the urgency of an open vacancy from the card or the preview: optimistic cache update, the PUT, and a toast for every answer (STORY-VAC-08-2, ADR-016). Loaded with the control, outside the card's initial JavaScript (PERF-04). */
import type { QueryClient } from '@tanstack/react-query';
import type { useTranslations } from 'next-intl';
import { ApiError, apiRequest } from '@/lib/api-client';
import { vacancyDetailQuery } from '@/lib/queries/vacancy-detail';
import { queryKeys } from '@/lib/query-keys';
import type {
  SetVacancyUrgencyInput,
  VacancyDetail,
} from '@/lib/schemas/vacancy';
import { toast } from '@/lib/toast';
import type { VACANCY_PRIORITIES } from '@/lib/vacancy-filters';
import { applyOptimisticUrgency } from '@/lib/vacancy-urgency-optimistic';

type Priority = (typeof VACANCY_PRIORITIES)[number];

/** What the press saw: the version the server compares, and the value that is put back on failure. */
export interface UrgencyChange {
  readonly id: string;
  readonly number: string;
  readonly from: Priority;
  readonly to: Priority;
  readonly version: number;
}

export type UrgencyFailure =
  | { readonly kind: 'stale'; readonly current: Priority | null }
  | { readonly kind: 'locked' | 'forbidden' | 'gone' | 'rateLimited' }
  | { readonly kind: 'network' | 'failed' };

export type UrgencyOutcome =
  | { readonly status: 'changed'; readonly detail: VacancyDetail }
  | { readonly status: 'busy' }
  | { readonly status: 'failed'; readonly failure: UrgencyFailure };

/** Survives the unmount of the card that started the call: a second press on the same vacancy must not send a second request. */
const inFlight = new Set<string>();

export const putUrgency = (id: string, body: SetVacancyUrgencyInput) =>
  apiRequest(`/vacancies/${encodeURIComponent(id)}/urgency`, {
    method: 'PUT',
    body,
    schema: async () =>
      (await import('@/lib/schemas/vacancy')).vacancyDetailSchema,
  });

/** 409 carries two meanings (stale version, closed vacancy); anything that is not an API answer is a lost connection. */
export function classifyUrgencyFailure(error: unknown): UrgencyFailure['kind'] {
  if (!(error instanceof ApiError)) return 'network';
  if (error.status === 409 && error.code === 'STALE_STATE') return 'stale';
  if (error.status === 409 && error.code === 'VACANCY_URGENCY_LOCKED')
    return 'locked';
  if (error.status === 401 || error.status === 403) return 'forbidden';
  if (error.status === 404) return 'gone';
  if (error.status === 429) return 'rateLimited';
  return 'failed';
}

const refresh = (queryClient: QueryClient, id: string) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.vacanciesAll() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.vacancy(id) }),
  ]).then(
    () => undefined,
    () => undefined,
  );

/** The server's current card, bypassing the cache; null when it cannot be read (the caller still has the failure to show). */
async function readCurrent(
  queryClient: QueryClient,
  id: string,
): Promise<VacancyDetail | null> {
  try {
    return await queryClient.fetchQuery({
      ...vacancyDetailQuery(id),
      staleTime: 0,
      retry: false,
    });
  } catch {
    return null;
  }
}

/** The flag is flipped before the first await that talks to the server; everything after the optimistic write is inside the `try`, so no path leaves it applied. */
export async function changeUrgency(
  queryClient: QueryClient,
  change: UrgencyChange,
): Promise<UrgencyOutcome> {
  const { id, from, to, version } = change;
  // Set before the first await: a double press cannot slip past it.
  if (inFlight.has(id)) return { status: 'busy' };
  inFlight.add(id);
  try {
    // A refetch landing after the optimistic write would put the old flag back.
    await Promise.all([
      queryClient.cancelQueries({ queryKey: queryKeys.vacanciesAll() }),
      queryClient.cancelQueries({ queryKey: queryKeys.vacancy(id) }),
    ]);
    const optimistic = applyOptimisticUrgency(queryClient, id, from, to);
    try {
      const detail = await putUrgency(id, {
        priority: to,
        expectedVersion: version,
      });
      optimistic.settle();
      queryClient.setQueryData(queryKeys.vacancy(id), detail);
      void refresh(queryClient, id);
      return { status: 'changed', detail };
    } catch (error) {
      optimistic.restore();
      const kind = classifyUrgencyFailure(error);
      if (kind !== 'stale') {
        if (kind !== 'rateLimited') void refresh(queryClient, id);
        return { status: 'failed', failure: { kind } };
      }
      const current = await readCurrent(queryClient, id);
      void refresh(queryClient, id);
      // A lost answer: the first attempt committed (exactly one write since our version) and the retry meets that write, so there is nothing to warn about.
      if (current && current.priority === to && current.version === version + 1)
        return { status: 'changed', detail: current };
      return {
        status: 'failed',
        failure: { kind: 'stale', current: current?.priority ?? null },
      };
    }
  } finally {
    inFlight.delete(id);
  }
}

type Translate = ReturnType<typeof useTranslations<'vacancies.urgency'>>;

const toastId = (id: string) => `urgency:${id}`;

/** The toast is global, so the answer still reaches the user when the card that started the change is gone (a list selection moved on). */
export function announceUrgency(
  t: Translate,
  change: UrgencyChange,
  outcome: Exclude<UrgencyOutcome, { readonly status: 'busy' }>,
  retry: () => void,
) {
  if (outcome.status === 'changed') {
    toast.success(t('toast.changed'), {
      description: t('toast.summary', {
        number: change.number,
        from: t(change.from),
        to: t(change.to),
      }),
      id: toastId(change.id),
    });
    return;
  }
  const { failure } = outcome;
  const id = toastId(change.id);
  const again = { label: t('toast.retry'), onAction: retry };
  switch (failure.kind) {
    case 'stale':
      toast.warning(t('toast.stale'), {
        description: failure.current
          ? t('toast.staleDescription', { value: t(failure.current) })
          : t('toast.staleUnknown'),
        id: `stale:vacancy:${change.id}`,
      });
      return;
    case 'locked':
      toast.error(t('toast.failed'), {
        description: t('toast.lockedDescription'),
        id,
      });
      return;
    case 'forbidden':
      toast.error(t('toast.forbidden'), { id });
      return;
    case 'gone':
      toast.error(t('toast.gone'), { id });
      return;
    case 'rateLimited':
      toast.warning(t('toast.rateLimited'), { id });
      return;
    case 'network':
      toast.error(t('toast.noConnection'), {
        description: t('toast.noConnectionDescription'),
        id,
        action: again,
      });
      return;
    case 'failed':
      toast.error(t('toast.failed'), {
        description: t('toast.failedDescription'),
        id,
        action: again,
      });
      return;
    default:
      return failure satisfies never;
  }
}
