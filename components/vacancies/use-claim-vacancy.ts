'use client';

import { useTranslations } from 'next-intl';
import type { VacancySummary } from '@/lib/schemas/vacancy';
import { toast } from '@/lib/toast';
import { claimVacancyRequest } from '@/lib/vacancy-team';
import { rememberLostClaim } from './lost-claim-notice';
import { refusalNext, useTeamWrite, type TeamNext } from './use-team-write';

/** «Взяти вакансію»: no version to send, the vacancy row lock decides the race (ADR-017); the winner's retry is a server no-op. */
export function useClaimVacancy(
  vacancy: Pick<VacancySummary, 'id' | 'number'>,
) {
  const t = useTranslations('vacancies.team.claimDialog');
  const write = useTeamWrite(vacancy.id);

  const claim = async (): Promise<TeamNext | null> => {
    const outcome = await write.run(() => claimVacancyRequest(vacancy.id));
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
      // The refresh that follows may prove the card unreadable and reload the page, which would drop this toast.
      rememberLostClaim({ id: vacancy.id, number });
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
