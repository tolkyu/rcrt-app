/** Status writes of the card and the preview (ADR-017 slice 6): pause and resume are optimistic like urgency, cancel and reopen go through the dialogs' pessimistic path. Loaded with the status control (PERF-04). */
import type { QueryClient } from '@tanstack/react-query';
import type { useTranslations } from 'next-intl';
import { apiRequest } from '@/lib/api-client';
import type { ChangeVacancyStatusInput } from '@/lib/schemas/vacancy-status';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import { toast } from '@/lib/toast';
import { readCurrentVacancy, refreshVacancy } from '@/lib/vacancy-refresh';
import { applyOptimisticFlip, type Flip } from '@/lib/vacancy-optimistic-flip';
import {
  classifyTeamFailure,
  detailSchema,
  type TeamFailure,
} from '@/lib/vacancy-team';
import { queryKeys } from '@/lib/query-keys';
import { VACANCY_TRANSITIONS } from '@/server/domain/vacancy-status/transitions';

export type ToggleAction = 'HOLD' | 'RESUME';
type Status = VacancyDetail['status'];

export const putStatus = (id: string, body: ChangeVacancyStatusInput) =>
  apiRequest(`/vacancies/${encodeURIComponent(id)}/status`, {
    method: 'PUT',
    body,
    schema: detailSchema,
  });

/** What the press saw: the version the server compares and whether the vacancy had nobody to work on it. */
export interface ToggleChange {
  readonly id: string;
  readonly number: string;
  readonly action: ToggleAction;
  readonly version: number;
  readonly unassigned: boolean;
}

export type ToggleOutcome =
  | { readonly status: 'changed'; readonly detail: VacancyDetail }
  | { readonly status: 'busy' }
  | {
      readonly status: 'failed';
      readonly failure: TeamFailure;
      readonly current: Status | null;
    };

/** Survives the unmount of the card that started the call: a second press on the same vacancy must not send a second request. */
const inFlight = new Set<string>();

const INVERSE = { HOLD: 'RESUME', RESUME: 'HOLD' } as const;

/** The card's action list moves with the status, so the button flips in the same frame as the chip; the origin is where the inverse action leads. */
const statusFlip = (action: ToggleAction): Flip => {
  const inverse = INVERSE[action];
  const value = (side: 'from' | 'to') =>
    VACANCY_TRANSITIONS[side === 'to' ? action : inverse].to;
  return {
    shows: (item, side) => item.status === value(side),
    put: (item, side) => {
      const [out, next] = side === 'to' ? [action, inverse] : [inverse, action];
      return {
        ...item,
        status: value(side),
        ...('statusActions' in item
          ? {
              statusActions: item.statusActions.map((entry) =>
                entry === out ? next : entry,
              ),
            }
          : {}),
      };
    },
  };
};

/** The flag is flipped before the first await that talks to the server; everything after the optimistic write is inside the `try`, so no path leaves it applied. */
export async function toggleStatus(
  queryClient: QueryClient,
  change: ToggleChange,
): Promise<ToggleOutcome> {
  const { id, action, version } = change;
  // Set before the first await: a double press cannot slip past it.
  if (inFlight.has(id)) return { status: 'busy' };
  inFlight.add(id);
  try {
    // A refetch landing after the optimistic write would put the old status back.
    await Promise.all([
      queryClient.cancelQueries({ queryKey: queryKeys.vacanciesAll() }),
      queryClient.cancelQueries({ queryKey: queryKeys.vacancy(id) }),
    ]);
    const optimistic = applyOptimisticFlip(queryClient, id, statusFlip(action));
    try {
      const detail = await putStatus(id, { action, expectedVersion: version });
      optimistic.settle();
      queryClient.setQueryData(queryKeys.vacancy(id), detail);
      void refreshVacancy(queryClient, id);
      return { status: 'changed', detail };
    } catch (error) {
      optimistic.restore();
      const failure = classifyTeamFailure(error);
      if (failure === 'rateLimited' || failure === 'network')
        return { status: 'failed', failure, current: null };
      const current = await readCurrentVacancy(queryClient, id);
      void refreshVacancy(queryClient, id);
      // A lost answer: the first attempt committed (one write since our version), so the retry meets it and there is nothing to warn about.
      if (
        failure === 'stale' &&
        current?.status === VACANCY_TRANSITIONS[action].to &&
        current.version === version + 1
      )
        return { status: 'changed', detail: current };
      return {
        status: 'failed',
        failure,
        current: current?.status ?? null,
      };
    }
  } finally {
    inFlight.delete(id);
  }
}

type Translate = ReturnType<
  typeof useTranslations<'vacancies.statusMenu.toast'>
>;
type TeamToast = ReturnType<typeof useTranslations<'vacancies.team.toast'>>;

/** The toast is global, so the answer still reaches the user when the card that started the change is gone (a list selection moved on). */
export function announceToggle(
  t: Translate,
  tTeam: TeamToast,
  tStatus: (status: Status) => string,
  change: ToggleChange,
  outcome: Exclude<ToggleOutcome, { readonly status: 'busy' }>,
  retry: () => void,
) {
  const id = `status:${change.id}`;
  const { number } = change;
  if (outcome.status === 'changed') {
    // The server answered a repeat (another tab did it first): nothing changed, nothing to announce.
    if (outcome.detail.version === change.version) return;
    if (change.action === 'HOLD')
      toast.success(t('held'), {
        description: change.unassigned
          ? t('heldFree', { number })
          : t('heldDescription', { number }),
        id,
        duration: 3000,
      });
    else
      toast.success(t('resumed'), {
        description: t('resumedDescription', {
          number,
          status: tStatus('OPEN'),
        }),
        id,
        duration: 3000,
      });
    return;
  }
  const { failure, current } = outcome;
  const again = { label: t('retry'), onAction: retry };
  if (failure === 'stale' || failure === 'statusInvalid')
    toast.warning(t('stale'), {
      description: current
        ? t('staleDescription', { value: tStatus(current) })
        : t('staleUnknown'),
      id: `stale:vacancy:${change.id}`,
    });
  else if (failure === 'forbidden') toast.error(tTeam('forbidden'), { id });
  else if (failure === 'gone') toast.error(tTeam('gone'), { id });
  else if (failure === 'rateLimited')
    toast.warning(tTeam('rateLimited'), { id });
  else if (failure === 'network')
    toast.error(t('noConnection'), {
      description: t('noConnectionDescription'),
      id,
      action: again,
    });
  else
    toast.error(t('failed'), {
      description: t('failedDescription'),
      id,
      action: again,
    });
}
