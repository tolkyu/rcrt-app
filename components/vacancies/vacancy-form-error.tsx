'use client';

import { useTranslations } from 'next-intl';
import { FormError } from '@/components/ui/form-error';
import type { FieldSummary } from '@/components/vacancies/use-field-summary';
import {
  VACANCY_FIELD_IDS,
  VACANCY_FIELD_LABEL_KEYS,
} from '@/lib/vacancy-form';

/** The submit summary of both vacancy forms, naming the invalid fields as links that focus them. */
export function VacancyFormError({ summary }: { summary: FieldSummary }) {
  const t = useTranslations('vacancyForm');
  const seen = new Set<string>();
  const links = summary.fields.flatMap((field) => {
    const label = t(VACANCY_FIELD_LABEL_KEYS[field]);
    if (seen.has(label)) return [];
    seen.add(label);
    return [{ id: VACANCY_FIELD_IDS[field], label }];
  });
  return (
    <FormError count={summary.count} attempt={summary.attempt} links={links} />
  );
}
