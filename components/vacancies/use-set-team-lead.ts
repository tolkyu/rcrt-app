'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { teamLeadKeys } from '@/lib/queries/team-leads';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import { toast } from '@/lib/toast';
import { setTeamLeadRequest } from '@/lib/vacancy-team';
import {
  refusalNext,
  useSeenVersion,
  useTeamWrite,
  type TeamNext,
} from './use-team-write';

/** First Team Lead (D130-3). The server treats the same Team Lead again as a no-op, so a retry of a lost answer needs no adoption check here. */
export function useSetTeamLead(
  vacancy: Pick<VacancyDetail, 'id' | 'number' | 'version' | 'vertical'>,
) {
  const t = useTranslations('vacancies.team.teamLeadDialog');
  const tConflict = useTranslations('vacancies.teamConflicts');
  const queryClient = useQueryClient();
  const write = useTeamWrite(vacancy.id);
  const { version, catchUp } = useSeenVersion(vacancy);

  const set = async (teamLead: {
    id: string;
    fullName: string;
  }): Promise<TeamNext | null> => {
    const outcome = await write.run(() =>
      setTeamLeadRequest(vacancy.id, teamLead.id, version),
    );
    if (!outcome) return null;
    const id = `team:${vacancy.id}`;
    if (outcome.ok) {
      toast.success(t('done'), {
        description: t('doneDescription', {
          number: vacancy.number,
          name: teamLead.fullName,
        }),
        id,
      });
      return 'done';
    }
    if (outcome.failure === 'teamLeadSet') {
      toast.warning(tConflict('TEAM_LEAD_ALREADY_SET'), { id });
      return 'closed';
    }
    if (outcome.failure === 'stale') catchUp();
    // An ineligible pick means the Team Lead list is out of date; the dialog shows the fresh one without the pick.
    if (outcome.failure === 'invalid')
      void queryClient.invalidateQueries({
        queryKey: teamLeadKeys.assignable(vacancy.vertical.id),
      });
    return refusalNext(outcome.failure);
  };

  return { ...write, set };
}
