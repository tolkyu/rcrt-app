'use client';

import { useTranslations } from 'next-intl';
import type { VacancySummary } from '@/lib/schemas/vacancy';
import { cn } from '@/lib/utils';

const statusStyles = {
  DRAFT: 'bg-surface-muted text-muted-foreground-strong',
  OPEN: 'bg-success-subtle text-success-text',
  ON_HOLD: 'bg-warning-subtle text-warning-text',
  FILLED: 'bg-primary-subtle text-link',
  CANCELLED: 'bg-surface-muted text-muted-foreground-strong',
} as const;

export function VacancyStatus({
  status,
}: {
  status: VacancySummary['status'];
}) {
  const t = useTranslations('vacancies.status');
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap',
        statusStyles[status],
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {t(status)}
    </span>
  );
}

export function VacancyFlags({ vacancy }: { vacancy: VacancySummary }) {
  const t = useTranslations('vacancies');
  return (
    <>
      {vacancy.priority === 'URGENT' && (
        <span className="bg-warning-subtle text-warning-text rounded-md px-2 py-0.5 text-xs font-medium">
          {t('urgent')}
        </span>
      )}
      {vacancy.source === 'TELEGRAM_BOT' && (
        <span className="bg-primary-subtle text-link rounded-md px-2 py-0.5 text-xs font-medium">
          {t('fromBot')}
        </span>
      )}
    </>
  );
}
