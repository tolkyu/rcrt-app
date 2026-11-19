'use client';

import { useTranslations } from 'next-intl';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import { toast } from '@/lib/toast';
import {
  assignRecruitersRequest,
  removeRecruiterRequest,
} from '@/lib/vacancy-team';
import {
  refusalNext,
  useSeenVersion,
  useTeamWrite,
  type TeamNext,
} from './use-team-write';

type Target = Pick<VacancyDetail, 'id' | 'number' | 'version'>;

/** Manager adds recruiters (STORY-VAC-03-2); `names` is the already-formatted list for the toast. */
export function useAssignRecruiters(vacancy: Target) {
  const t = useTranslations('vacancies.team.assignDialog');
  const write = useTeamWrite(vacancy.id);
  const { version, catchUp } = useSeenVersion(vacancy);

  const assign = async (
    ids: readonly string[],
    names: string,
  ): Promise<TeamNext | null> => {
    const outcome = await write.run(
      () => assignRecruitersRequest(vacancy.id, ids, version),
      (current) =>
        current.version === version + 1 &&
        ids.every((id) =>
          current.recruiters.some((person) => person.id === id),
        ),
    );
    if (!outcome) return null;
    if (outcome.ok) {
      toast.success(
        ids.length === 1 ? t('doneOne') : t('doneMany', { count: ids.length }),
        {
          description: t('doneDescription', { number: vacancy.number, names }),
          id: `team:${vacancy.id}`,
        },
      );
      return 'done';
    }
    if (outcome.failure === 'stale') catchUp();
    return refusalNext(outcome.failure);
  };

  return { ...write, assign };
}

/** Manager removes one recruiter; a stale card or a closed vacancy ends the dialog with a toast, the card refetches. */
export function useRemoveRecruiter(vacancy: Target) {
  const t = useTranslations('vacancies.team.removeDialog');
  const tConflict = useTranslations('vacancies.teamConflicts');
  const write = useTeamWrite(vacancy.id);
  const { version } = useSeenVersion(vacancy);

  const remove = async (
    userId: string,
    name: string,
  ): Promise<TeamNext | null> => {
    const outcome = await write.run(
      () => removeRecruiterRequest(vacancy.id, userId, version),
      (current) =>
        current.version === version + 1 &&
        !current.recruiters.some((person) => person.id === userId),
    );
    if (!outcome) return null;
    const id = `team:${vacancy.id}`;
    if (outcome.ok) {
      toast.success(t('done'), {
        description: t('doneDescription', { number: vacancy.number, name }),
        id,
      });
      return 'done';
    }
    if (outcome.failure === 'stale' || outcome.failure === 'closed') {
      toast.warning(
        outcome.failure === 'stale' ? t('stale') : tConflict('VACANCY_CLOSED'),
        { id },
      );
      return 'closed';
    }
    return refusalNext(outcome.failure);
  };

  return { ...write, remove };
}
