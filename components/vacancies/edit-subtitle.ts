import { useFormatter, useTranslations } from 'next-intl';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import { DATE_TIME } from '@/lib/format';

/** «V-0015 · Гемблінг · Чернетка · Збережено 14.11.2026, 14:05»; shared by the form, its loading twin and the not-a-draft page so the heading never shifts. */
export function useEditSubtitle(
  vacancy: Pick<
    VacancyDetail,
    'number' | 'vertical' | 'status' | 'updatedAt'
  > | null,
) {
  const t = useTranslations('vacancyForm.edit');
  const tStatus = useTranslations('vacancies.status');
  const format = useFormatter();
  if (!vacancy) return undefined;
  const { number, vertical, status, updatedAt } = vacancy;
  return t('subtitle', {
    number,
    vertical: vertical.name,
    status: tStatus(status),
    saved: format.dateTime(new Date(updatedAt), DATE_TIME),
  });
}
