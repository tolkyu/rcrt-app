'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { denialReloadStarted } from '@/lib/denial-log';
import type { VacancySummary } from '@/lib/schemas/vacancy';
import { toast } from '@/lib/toast';
import { claimVacancyRequest, classifyTeamFailure } from '@/lib/vacancy-team';
import { forgetLostClaim, rememberLostClaim } from './lost-claim-notice';
import { refusalNext, useTeamWrite, type TeamNext } from './use-team-write';

/** «Взяти вакансію»: no version to send, the vacancy row lock decides the race (ADR-017); the winner's retry is a server no-op. */
export function useClaimVacancy(
  vacancy: Pick<VacancySummary, 'id' | 'number'>,
) {
  const t = useTranslations('vacancies.team.claimDialog');
  const queryClient = useQueryClient();
  const write = useTeamWrite(vacancy.id);
  const lost = { id: vacancy.id, number: vacancy.number };

  /** The note is stored before the write awaits its re-read, because a 404 there reloads the page mid-await (D132). */
  const request = async () => {
    try {
      return await claimVacancyRequest(vacancy.id);
    } catch (error) {
      if (classifyTeamFailure(error) === 'taken') rememberLostClaim(lost);
      throw error;
    }
  };

  const claim = async (): Promise<TeamNext | null> => {
    const outcome = await write.run(request);
    if (!outcome) return null;
    const id = `claim:${vacancy.id}`;
    const number = vacancy.number;
    if (outcome.ok) {
      toast.success(t('done'), {
        description: t('doneDescription', { number }),
        id,
      });
      return 'done';
    }
    if (outcome.failure === 'taken') {
      // No reload followed, so this toast is the only notice and the note must not outlive it.
      if (!denialReloadStarted(queryClient)) forgetLostClaim();
      toast.warning(t('lost'), {
        description: t('lostDescription', { number }),
        id,
        duration: 6000,
      });
      return 'lost';
    }
    return refusalNext(outcome.failure);
  };

  return { ...write, claim };
}
