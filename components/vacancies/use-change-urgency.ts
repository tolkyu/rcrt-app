'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import { toast } from '@/lib/toast';
import type { VACANCY_PRIORITIES } from '@/lib/vacancy-filters';
import {
  announceUrgency,
  changeUrgency,
  type UrgencyChange,
} from '@/lib/vacancy-urgency-change';
import { useSubmissionLock } from './use-submission-lock';

type Priority = (typeof VACANCY_PRIORITIES)[number];

/** One press = one request. The value shown is the card's cache entry, which the optimistic update flips, so the control, the badge and the tint cannot disagree. */
export function useChangeUrgency(
  vacancy: Pick<VacancyDetail, 'id' | 'number' | 'priority' | 'version'>,
) {
  const t = useTranslations('vacancies.urgency');
  const queryClient = useQueryClient();
  const { mountedRef, busyRef, tryLock } = useSubmissionLock();
  const [pending, setPending] = useState(false);

  /** The retry re-reads the card: a failed change was rolled back, and a refetch may have brought a newer version. */
  const latest = (to: Priority): UrgencyChange => {
    const card = queryClient.getQueryData<VacancyDetail>(
      queryKeys.vacancy(vacancy.id),
    );
    return {
      id: vacancy.id,
      number: vacancy.number,
      from: card?.priority ?? vacancy.priority,
      to,
      version: card?.version ?? vacancy.version,
    };
  };

  /** A rejected run (anything the outcome does not describe) ends in a toast whose button starts over. */
  const start = (change: UrgencyChange): Promise<void> => {
    const retry = () => {
      start(latest(change.to)).catch(() => undefined);
    };
    return changeUrgency(queryClient, change)
      .then((outcome) => {
        if (outcome.status !== 'busy')
          announceUrgency(t, change, outcome, retry);
      })
      .catch(() =>
        toast.error(t('toast.failed'), {
          description: t('toast.failedDescription'),
          id: `urgency:${change.id}`,
          action: { label: t('toast.retry'), onAction: retry },
        }),
      );
  };

  const change = (to: Priority) => {
    if (to === vacancy.priority || !tryLock()) return;
    setPending(true);
    start(latest(to))
      .finally(() => {
        busyRef.current = false;
        if (mountedRef.current) setPending(false);
      })
      .catch(() => undefined);
  };

  return { pending, change };
}
