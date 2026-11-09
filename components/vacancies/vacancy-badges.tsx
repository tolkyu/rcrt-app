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

/** D97: urgency stops being actionable once a vacancy is closed, so only the red styling (not the label) depends on status. */
export const isUrgentHighlighted = (
  vacancy: Pick<VacancySummary, 'priority' | 'status'>,
) =>
  vacancy.priority === 'URGENT' &&
  vacancy.status !== 'FILLED' &&
  vacancy.status !== 'CANCELLED';

/** Red accent edge for list rows and cards; the badge carries the text so colour is never the only signal. */
export const urgentEdge = (
  vacancy: Pick<VacancySummary, 'priority' | 'status'>,
) =>
  isUrgentHighlighted(vacancy)
    ? 'shadow-[inset_3px_0_0_0_var(--destructive)]'
    : undefined;

export function VacancyFlags({ vacancy }: { vacancy: VacancySummary }) {
  const t = useTranslations('vacancies');
  const highlighted = isUrgentHighlighted(vacancy);
  return (
    <>
      {vacancy.priority === 'URGENT' && (
        <span
          data-urgent={highlighted}
          className={cn(
            'rounded-md px-2 py-0.5 text-xs font-medium',
            highlighted
              ? 'bg-destructive-subtle text-error-text'
              : 'bg-surface-muted text-muted-foreground-strong',
          )}
        >
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
