'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { queryKeys } from '@/lib/query-keys';
import { hasOnlyReasonChars } from '@/lib/reason-text';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import { toast } from '@/lib/toast';
import {
  announceToggle,
  putStatus,
  toggleStatus,
  type ToggleAction,
  type ToggleChange,
} from '@/lib/vacancy-status-change';
import type { TeamOutcome } from '@/lib/vacancy-team';
import { useSubmissionLock } from './use-submission-lock';
import {
  refusalNext,
  useFailureText,
  useSeenVersion,
  useTeamWrite,
  type TeamNext,
} from './use-team-write';

export type StatusSubject = Pick<
  VacancyDetail,
  | 'id'
  | 'number'
  | 'title'
  | 'status'
  | 'version'
  | 'headcount'
  | 'vertical'
  | 'recruiters'
>;

type SeenCard = Pick<VacancyDetail, 'version' | 'recruiters'>;

/** One press = one request. The change reads the card's cache entry, which the optimistic update flips, so a retry after a rollback carries the version a refetch may have moved; `seen` is the fallback when the cache has none. */
export function useStatusToggle(id: string, number: string) {
  const t = useTranslations('vacancies.statusMenu.toast');
  const tTeam = useTranslations('vacancies.team.toast');
  const tStatus = useTranslations('vacancies.status');
  const queryClient = useQueryClient();
  const { mountedRef, busyRef, tryLock } = useSubmissionLock();
  const [pending, setPending] = useState(false);

  const latest = (action: ToggleAction, seen: SeenCard): ToggleChange => {
    const card =
      queryClient.getQueryData<VacancyDetail>(queryKeys.vacancy(id)) ?? seen;
    return {
      id,
      number,
      action,
      version: card.version,
      unassigned: card.recruiters.length === 0,
    };
  };

  /** A rejected run (anything the outcome does not describe) ends in a toast whose button starts over. */
  const start = (change: ToggleChange, seen: SeenCard): Promise<void> => {
    const retry = () => {
      start(latest(change.action, seen), seen).catch(() => undefined);
    };
    const announce = (outcome: Parameters<typeof announceToggle>[4]) =>
      announceToggle(t, tTeam, tStatus, change, outcome, retry);
    return toggleStatus(queryClient, change)
      .then((outcome) => {
        if (outcome.status !== 'busy') announce(outcome);
      })
      .catch(() =>
        announce({ status: 'failed', failure: 'failed', current: null }),
      );
  };

  const toggle = (action: ToggleAction, seen: SeenCard) => {
    if (!tryLock()) return;
    setPending(true);
    start(latest(action, seen), seen)
      .finally(() => {
        busyRef.current = false;
        if (mountedRef.current) setPending(false);
      })
      .catch(() => undefined);
  };

  return { pending, toggle };
}

export function useToggleStatus(vacancy: StatusSubject) {
  const { pending, toggle } = useStatusToggle(vacancy.id, vacancy.number);
  return {
    pending,
    toggle: (action: ToggleAction) => toggle(action, vacancy),
  };
}

/** Cancel and reopen: one request per dialog, the version is the one the dialog opened with, and every refusal has its place (inline text, or the shared toast that ends the dialog). */
export function useStatusWrite(vacancy: StatusSubject) {
  const t = useTranslations('vacancies.statusMenu');
  const failureText = useFailureText();
  const tConflict = useTranslations('vacancies.teamConflicts');
  const tStatus = useTranslations('vacancies.status');
  const tReason = useTranslations('vacancies.draft.close.error');
  const write = useTeamWrite(vacancy.id);
  const { version, catchUp } = useSeenVersion(vacancy);
  const [badReason, setBadReason] = useState(false);

  const settle = (
    outcome: TeamOutcome | null,
    announce: () => void,
  ): TeamNext | null => {
    if (!outcome) return null;
    if (outcome.ok) {
      announce();
      return 'done';
    }
    if (outcome.failure === 'stale') catchUp();
    return refusalNext(outcome.failure);
  };

  const cancel = async (reason: string): Promise<TeamNext | null> => {
    if (!hasOnlyReasonChars(reason)) {
      setBadReason(true);
      return 'stay';
    }
    setBadReason(false);
    const outcome = await write.run(() =>
      putStatus(vacancy.id, {
        action: 'CANCEL',
        reason,
        expectedVersion: version,
      }),
    );
    return settle(outcome, () =>
      toast.success(t('cancelDialog.done'), {
        description: t('cancelDialog.doneDescription', {
          number: vacancy.number,
        }),
        id: `status:${vacancy.id}`,
      }),
    );
  };

  const reopen = async (headcount: number): Promise<TeamNext | null> => {
    const changed = headcount !== vacancy.headcount;
    const outcome = await write.run(() =>
      putStatus(vacancy.id, {
        action: 'REOPEN',
        expectedVersion: version,
        ...(changed ? { headcount } : {}),
      }),
    );
    return settle(outcome, () => {
      const base = { number: vacancy.number, status: tStatus('OPEN') };
      toast.success(t('reopenDialog.done'), {
        description: changed
          ? t('reopenDialog.doneChanged', {
              ...base,
              from: vacancy.headcount,
              to: headcount,
            })
          : t('reopenDialog.doneDescription', base),
        id: `status:${vacancy.id}`,
      });
    });
  };

  const error = badReason
    ? tReason('invalid')
    : failureText(
        write.failure,
        {
          stale: t('stale'),
          statusInvalid: tConflict('VACANCY_STATUS_INVALID'),
        },
        ['gone', 'forbidden', 'rateLimited'],
      );

  return { ...write, error, cancel, reopen };
}
