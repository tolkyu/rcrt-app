import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { VacancyContentEditForm } from '@/components/vacancies/vacancy-content-edit-form';
import { requireSession } from '../../../../_lib/session';
import { loadVacancy } from '../../../_lib/vacancy';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('vacancies.contentEdit');
  return { title: t('metaTitle') };
}

/** «Опис і вимоги» of a published vacancy (VAC-08, D133): the layout already refused hidden ones; the form decides eligibility itself from a fresh authoritative read. */
export default async function ContentEditPage({
  params,
}: {
  params: Promise<{ vacancyId: string }>;
}) {
  const [, vacancy] = await Promise.all([
    requireSession(),
    params.then(({ vacancyId }) => loadVacancy(vacancyId)),
  ]);
  if (!vacancy) notFound();
  return (
    <VacancyContentEditForm
      vacancy={{ id: vacancy.id, number: vacancy.number, title: vacancy.title }}
    />
  );
}
