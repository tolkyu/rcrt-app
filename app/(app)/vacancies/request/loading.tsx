import { getTranslations } from 'next-intl/server';
import { FormSkeleton } from '@/components/ui/form-skeleton';
import {
  REQUEST_BUTTON_WIDTHS,
  vacancyRequestSkeleton,
} from '@/components/vacancies/vacancy-request-skeleton';

export default async function RequestVacancyLoading() {
  const t = await getTranslations('vacancyRequest');
  return (
    <div className="max-w-[45rem]">
      <FormSkeleton
        title={t('title')}
        subtitle={t('subtitle')}
        back={{ href: '/vacancies', label: t('back') }}
        fields={vacancyRequestSkeleton}
        buttonWidths={REQUEST_BUTTON_WIDTHS}
      />
    </div>
  );
}
