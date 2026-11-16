import { getTranslations } from 'next-intl/server';
import { FormSkeleton } from '@/components/ui/form-skeleton';
import {
  vacancyFormSkeleton,
  VACANCY_FORM_WIDTH,
} from '@/components/vacancies/vacancy-form-skeleton';
import { teamLeadFieldShown } from '@/lib/vacancy-form';
import { getCreateFormVerticals } from '../../_lib/create-form-verticals';

export default async function NewVacancyLoading() {
  // Session and verticals are already resolved for this request (layout, shell), so these are cache hits.
  const [t, { verticals, verticalId }] = await Promise.all([
    getTranslations('vacancyForm'),
    getCreateFormVerticals(),
  ]);
  return (
    <div className={VACANCY_FORM_WIDTH}>
      <FormSkeleton
        title={t('title')}
        subtitle={t('subtitle')}
        back={{ href: '/vacancies', label: t('back') }}
        fields={vacancyFormSkeleton(teamLeadFieldShown(verticals, verticalId))}
      />
    </div>
  );
}
