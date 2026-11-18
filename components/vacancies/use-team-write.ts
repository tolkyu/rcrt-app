'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, type RefObject } from 'react';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import { toast } from '@/lib/toast';
import {
  attemptTeamWrite,
  type TeamFailure,
  type TeamOutcome,
} from '@/lib/vacancy-team';
import { useSubmissionLock } from './use-submission-lock';

/** What the dialog does next: `done` saved, `lost` the claim race was lost, `closed` refused with a toast, `stay` keeps the dialog open (inline error or retry). */
export type TeamNext = 'done' | 'lost' | 'closed' | 'stay';

type ToastText = ReturnType<typeof useTranslations<'vacancies.team.toast'>>;

/** Failures every team write announces the same way (a toast); the rest are the caller's. Returns whether it spoke. */
function announceShared(t: ToastText, id: string, failure: TeamFailure) {
  const options = { id: `team:${id}` };
  if (failure === 'gone') toast.error(t('gone'), options);
  else if (failure === 'forbidden') toast.error(t('forbidden'), options);
  else if (failure === 'rateLimited') toast.warning(t('rateLimited'), options);
  else return false;
  return true;
}

/**
 * One request per dialog. The lock is set before the first await and a success keeps it until the dialog unmounts;
 * a failure releases it. `failure` is what the dialog shows inline.
 */
export function useTeamWrite(id: string) {
  const t = useTranslations('vacancies.team.toast');
  const queryClient = useQueryClient();
  const { mountedRef, busyRef, tryLock } = useSubmissionLock();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<TeamFailure | null>(null);

  const run = async (
    request: () => Promise<VacancyDetail>,
    adopted?: (current: VacancyDetail) => boolean,
  ): Promise<TeamOutcome | null> => {
    if (!tryLock()) return null;
    setPending(true);
    setFailure(null);
    const outcome = await attemptTeamWrite(queryClient, id, request, adopted);
    if (outcome.ok) return outcome;
    busyRef.current = false;
    if (!announceShared(t, id, outcome.failure) && mountedRef.current)
      setFailure(outcome.failure);
    if (mountedRef.current) setPending(false);
    return outcome;
  };

  return { pending, failure, run, mountedRef };
}

/**
 * Inline text for a failure that leaves the dialog open: the dialog's own wording where it has one, a lost connection
 * for network and 5xx, and a generic line for anything the dialog did not expect. `silent` failures end the dialog with a toast instead.
 */
export function useFailureText() {
  const t = useTranslations('vacancies.team');
  return (
    failure: TeamFailure | null,
    own: Partial<Record<TeamFailure, string>> = {},
    silent: readonly TeamFailure[] = [],
  ): string | undefined => {
    if (!failure || silent.includes(failure)) return undefined;
    return (
      own[failure] ??
      (failure === 'network' || failure === 'failed'
        ? t('noConnection')
        : t('unexpected'))
    );
  };
}

/** `gone` and `forbidden` end the dialog (the card or the right is gone); a rate limit keeps it for another try. */
export const refusalNext = (failure: TeamFailure): TeamNext =>
  failure === 'gone' || failure === 'forbidden' ? 'closed' : 'stay';

/** The version the user saw when the dialog opened; a stale answer moves it to the card the refetch brought, so the next confirm is a deliberate second look. */
export function useSeenVersion(vacancy: Pick<VacancyDetail, 'id' | 'version'>) {
  const queryClient = useQueryClient();
  const [version, setVersion] = useState(vacancy.version);
  const catchUp = () => {
    const card = queryClient.getQueryData<VacancyDetail>(
      queryKeys.vacancy(vacancy.id),
    );
    if (card) setVersion(card.version);
  };
  return { version, catchUp };
}

export interface TeamDialogProps {
  /** `null` = dismissed without a write. */
  onClose: (next: TeamNext | null) => void;
  /** The host decides where focus goes; the opener may be gone (the button disappears after a claim). */
  onCloseAutoFocus: (event: Event) => void;
}

/** Closes the dialog once a write ended it; `stay` and a dialog that already unmounted do nothing. */
export function closeWhenDone(
  next: Promise<TeamNext | null>,
  mounted: RefObject<boolean>,
  onClose: TeamDialogProps['onClose'],
) {
  next
    .then((result) => {
      if (result && result !== 'stay' && mounted.current) onClose(result);
    })
    .catch(() => undefined);
}
