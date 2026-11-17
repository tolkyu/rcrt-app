'use client';

import { Bot, Flame } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { VacancySummary } from '@/lib/schemas/vacancy';

const statusBadge = {
  DRAFT: { tone: 'neutral', dashed: true, outline: true },
  OPEN: { tone: 'success' },
  ON_HOLD: { tone: 'warning' },
  FILLED: { tone: 'brand' },
  CANCELLED: { tone: 'neutral' },
} as const satisfies Record<
  VacancySummary['status'],
  Pick<BadgeProps, 'tone' | 'dashed' | 'outline'>
>;

export function VacancyStatus({
  status,
}: {
  status: VacancySummary['status'];
}) {
  const t = useTranslations('vacancies.status');
  return (
    <Badge dot {...statusBadge[status]}>
      {t(status)}
    </Badge>
  );
}

/** D97: urgency stops being actionable once a vacancy is closed, so only the red styling (not the label) depends on status. */
export const isUrgentHighlighted = (
  vacancy: Pick<VacancySummary, 'priority' | 'status'>,
) =>
  vacancy.priority === 'URGENT' &&
  vacancy.status !== 'FILLED' &&
  vacancy.status !== 'CANCELLED';

/** Red tint, hover and edge for list rows and cards; the badge carries the text so colour is never the only signal. A selected row keeps the red edge beside the brand bar; undefined leaves the caller's base hover in place. */
export const urgentRow = (
  vacancy: Pick<VacancySummary, 'priority' | 'status'>,
  selected = false,
) => {
  if (!isUrgentHighlighted(vacancy)) return undefined;
  // Strong muted text keeps number, dates and names at 4.5:1 on the tint; class names stay literal so Tailwind can see them.
  return selected
    ? 'bg-primary-subtle shadow-[inset_3px_0_0_var(--destructive),inset_5px_0_0_var(--brand)] [--muted-foreground:var(--muted-foreground-strong)]'
    : 'bg-destructive-subtle hover:bg-destructive-subtle-hover active:bg-destructive-subtle-hover shadow-[inset_3px_0_0_var(--destructive)] [--muted-foreground:var(--muted-foreground-strong)]';
};

export function VacancyFlags({ vacancy }: { vacancy: VacancySummary }) {
  const t = useTranslations('vacancies');
  const highlighted = isUrgentHighlighted(vacancy);
  return (
    <>
      {vacancy.priority === 'URGENT' && (
        <Badge
          size="sm"
          icon={Flame}
          tone={highlighted ? 'danger' : 'neutral'}
          outline={highlighted}
          title={highlighted ? undefined : t('urgentClosed')}
          data-urgent={highlighted}
        >
          {t('urgent')}
        </Badge>
      )}
      {vacancy.source === 'TELEGRAM_BOT' && (
        <Badge size="sm" icon={Bot} tone="info" outline>
          {t('fromBot')}
        </Badge>
      )}
    </>
  );
}
