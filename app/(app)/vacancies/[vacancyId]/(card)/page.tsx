import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { VacancyDetailView } from '@/components/vacancies/vacancy-detail-view';
import { authorsAnywhere } from '@/server/authz/vacancy-author';
import { requireSession } from '../../../_lib/session';
import { loadVacancy } from '../../_lib/vacancy';

type Props = { params: Promise<{ vacancyId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [vacancy, t] = await Promise.all([
    params.then(({ vacancyId }) => loadVacancy(vacancyId)),
    getTranslations('vacancies'),
  ]);
  return {
    title: vacancy ? `${vacancy.number} ${vacancy.title}` : t('metaTitle'),
  };
}

/** Full read-only vacancy card (STORY-VAC-04-2); the layout has already resolved scope. */
export default async function VacancyPage({ params }: Props) {
  const [{ vacancyId }, ctx] = await Promise.all([params, requireSession()]);
  return (
    <VacancyDetailView
      id={vacancyId.toLowerCase()}
      canAuthorDrafts={authorsAnywhere(ctx.auth)}
    />
  );
}
