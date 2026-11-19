'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/** Dot plus text, never colour alone; inactive uses the dashed slate chip of deactivated users. */
export function PositionStatusChip({ active }: { active: boolean }) {
  const t = useTranslations('positions.status');
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap',
        active
          ? 'bg-success-subtle text-success-text'
          : 'border-border bg-surface-muted text-muted-foreground-strong border border-dashed',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-1.5 rounded-full',
          active ? 'bg-current' : 'border border-current',
        )}
      />
      {t(active ? 'active' : 'inactive')}
    </span>
  );
}
