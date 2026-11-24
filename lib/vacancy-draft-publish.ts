/** Publishing a draft from a list row, the preview or the card, with an optimistic cache update and the toasts for every answer; loaded on the first press, outside the list's initial JavaScript (PERF-04). */
import type { QueryClient } from '@tanstack/react-query';
import type { useTranslations } from 'next-intl';
import { vacancyDetailQuery } from '@/lib/queries/vacancy-detail';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import { toast } from '@/lib/toast';
import { watchVacancyAccess } from '@/lib/vacancy-detail-cache';
import { vacancyEditHref } from '@/lib/vacancy-draft-actions';
import { applyOptimisticPublish } from '@/lib/vacancy-draft-optimistic';
import {
  createAttemptKeys,
  planEditFailure,
  refreshAfterFieldErrors,
  submitEdit,
  type EditFinalFailure,
} from '@/lib/vacancy-edit-submit';
import { publishBlocker } from '@/lib/vacancy-publish-rule';

export interface PublishedDraft {
  readonly id: string;
  readonly number: string;
  readonly title: string;
}

export type ListPublishOutcome =
  | { readonly status: 'published'; readonly draft: PublishedDraft }
  | { readonly status: 'busy' }
  | { readonly status: 'failed'; readonly effect: EditFinalFailure };

export interface PublishHooks {
  /** Called right after the row left the cached lists, before React renders without it. */
  readonly removed: () => void;
  /** Called after a refused publish put the row back. */
  readonly restored: () => void;
  /** Called when the publish went through: the list may forget this draft. */
  readonly settled: () => void;
}

/** Survives the unmount of the row that started the publish: a second press must not send a second request. */
const inFlight = new Set<string>();
const attempts = new Map<string, ReturnType<typeof createAttemptKeys>>();

/** The data changed under the user: lists, count and card read the server again. */
const refresh = (queryClient: QueryClient, id: string) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.vacanciesAll() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.vacancy(id) }),
  ]);

const attemptsOf = (id: string) => {
  const found = attempts.get(id) ?? createAttemptKeys();
  attempts.set(id, found);
  return found;
};

const failed = (effect: EditFinalFailure): ListPublishOutcome => ({
  status: 'failed',
  effect,
});

/** Detail first (the publish needs its version; usually cached by the hover prefetch), then the optimistic update, then the shared publish call of the edit form. */
export async function publishFromList(
  queryClient: QueryClient,
  id: string,
  hooks: PublishHooks,
): Promise<ListPublishOutcome> {
  // Set before the first await: a double press cannot slip past it.
  if (inFlight.has(id)) return { status: 'busy' };
  inFlight.add(id);
  const stillAllowed = watchVacancyAccess(queryClient, id);
  try {
    let draft: VacancyDetail;
    try {
      draft = await queryClient.ensureQueryData(vacancyDetailQuery(id));
    } catch (error) {
      return failed(planEditFailure(error, true));
    }
    if (draft.status !== 'DRAFT') {
      void refresh(queryClient, id);
      return failed({ type: 'notDraft' });
    }
    const blocked = publishBlocker(draft);
    if (blocked)
      return failed({ type: 'fields', errors: { positionId: blocked } });
    // A refetch landing after the optimistic write would put the row back.
    await Promise.all([
      queryClient.cancelQueries({ queryKey: queryKeys.vacanciesAll() }),
      // Exact: a cancelled first content read would stay idle if this write fails.
      queryClient.cancelQueries({
        queryKey: queryKeys.vacancy(id),
        exact: true,
      }),
    ]);
    const optimistic = applyOptimisticPublish(queryClient, id, stillAllowed);
    let outcome: Awaited<ReturnType<typeof submitEdit>>;
    // Everything after the optimistic write is inside this try, so nothing can leave it applied.
    try {
      hooks.removed();
      outcome = await submitEdit(
        queryClient,
        attemptsOf(id),
        {
          id,
          version: draft.version,
          action: 'PUBLISH',
          changes: null,
          everything: {},
          hasSalaryAmount: false,
        },
        stillAllowed,
      );
    } catch (error) {
      optimistic.restore();
      hooks.restored();
      throw error;
    }
    if (outcome.status !== 'failed') {
      optimistic.settle();
      hooks.settled();
      attempts.delete(id);
      return {
        status: 'published',
        draft: { id, number: draft.number, title: draft.title },
      };
    }
    optimistic.restore();
    hooks.restored();
    const { effect } = outcome;
    if (effect.type === 'fields')
      refreshAfterFieldErrors(queryClient, effect.errors);
    if (
      effect.type === 'stale' ||
      effect.type === 'notDraft' ||
      effect.type === 'gone'
    )
      void refresh(queryClient, id);
    // Only a failure the user may retry keeps its key; the retry then replays the same request.
    if (!(effect.type === 'toast' && effect.retry)) attempts.delete(id);
    return failed(effect);
  } finally {
    inFlight.delete(id);
  }
}

type Translate = ReturnType<typeof useTranslations<'vacancies.draft.actions'>>;

/** The toast is global, so a result still reaches the user after the row that started the publish unmounted (the optimistic update removes it). */
export function announcePublish(
  t: Translate,
  open: (href: string) => void,
  outcome: Exclude<ListPublishOutcome, { readonly status: 'busy' }>,
  draft: PublishedDraft,
  retry: () => void,
) {
  if (outcome.status === 'published') {
    toast.success(t('toast.published'), {
      description: t('toast.summary', {
        number: draft.number,
        title: draft.title,
      }),
      action: {
        label: t('toast.open'),
        onAction: () => open(`/vacancies/${draft.id}`),
      },
    });
    return;
  }
  const { effect } = outcome;
  const edit = {
    label: t('edit'),
    onAction: () => open(vacancyEditHref(draft.id)),
  };
  switch (effect.type) {
    case 'fields':
      toast.error(t('toast.failed'), {
        description: t('toast.refusedDescription'),
        action: edit,
      });
      return;
    case 'stale':
    case 'notDraft':
      toast.warning(t('toast.stale'), {
        description: t('toast.staleDescription'),
        id: `stale:vacancy:${draft.id}`,
        action: effect.type === 'stale' ? edit : undefined,
      });
      return;
    case 'gone':
      toast.error(t('toast.gone'), { description: t('toast.goneDescription') });
      return;
    case 'toast':
      toast[effect.tone](t(`toast.${effect.title}`), {
        description: effect.description && t(`toast.${effect.description}`),
        action: effect.retry
          ? { label: t('toast.retry'), onAction: retry }
          : undefined,
      });
  }
}
