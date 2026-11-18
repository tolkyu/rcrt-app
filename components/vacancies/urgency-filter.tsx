'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { FilterSelectField } from '@/components/ui/filter-select-field';
import type { VacancyListQuery } from '@/lib/schemas/vacancy';
import { VACANCY_PRIORITIES } from '@/lib/vacancy-filters';

const URGENCY_ORDER = [
  'URGENT',
  'NORMAL',
] as const satisfies readonly NonNullable<VacancyListQuery['priority']>[];

/** «Терміновість» (VAC-04-4): the urgency flag of the vacancy, never the Team Lead priority. */
export function UrgencyFilter({
  value,
  onChange,
}: {
  value: VacancyListQuery['priority'];
  onChange: (value: VacancyListQuery['priority']) => void;
}) {
  const t = useTranslations('vacancies');
  const options = useMemo(
    () => [
      { value: '', label: t('all') },
      ...URGENCY_ORDER.map((priority) => ({
        value: priority,
        label: t(`filters.urgencyOptions.${priority}`),
      })),
    ],
    [t],
  );
  return (
    <div className="min-w-0 md:col-span-2 md:max-w-64">
      <FilterSelectField
        id="vacancies-filter-urgency"
        label={t('filters.urgency')}
        value={value ?? ''}
        onChange={(next) =>
          onChange(VACANCY_PRIORITIES.find((priority) => priority === next))
        }
        options={options}
      />
    </div>
  );
}
