import { getTranslations } from 'next-intl/server';
import { FormSkeleton } from '@/components/ui/form-skeleton';
import {
  VACANCY_FORM_SKELETON,
  VACANCY_FORM_WIDTH,
} from '@/components/vacancies/vacancy-form-skeleton';

export default async function NewVacancyLoading() {
  const t = await getTranslations('vacancyForm');
  return (
    <div className={VACANCY_FORM_WIDTH}>
      <FormSkeleton
        title={t('title')}
        subtitle={t('subtitle')}
        back={{ href: '/vacancies', label: t('back') }}
        fields={VACANCY_FORM_SKELETON}
      />
    </div>
  );
}
