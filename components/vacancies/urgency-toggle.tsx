'use client';

import { useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import { VACANCY_PRIORITIES } from '@/lib/vacancy-filters';
import { UrgencyControl } from './urgency-control';
import { useChangeUrgency } from './use-change-urgency';

/** The lazy half of the «Терміновість» section: the control with its change hook and toasts, so none of it is in the card's first JavaScript (PERF-04). */
export default function UrgencyToggle({
  vacancy,
  controlProps,
}: {
  vacancy: Pick<VacancyDetail, 'id' | 'number' | 'priority' | 'version'>;
  controlProps: Omit<
    ComponentProps<typeof UrgencyControl>,
    'options' | 'value' | 'onValueChange' | 'aria-busy'
  >;
}) {
  const t = useTranslations('vacancies.urgency');
  const { pending, change } = useChangeUrgency(vacancy);
  return (
    <UrgencyControl
      {...controlProps}
      options={VACANCY_PRIORITIES.map((value) => ({
        value,
        label: t(value),
      }))}
      value={vacancy.priority}
      aria-busy={pending || undefined}
      onValueChange={(value) => {
        const priority = VACANCY_PRIORITIES.find((item) => item === value);
        if (priority) change(priority);
      }}
    />
  );
}
