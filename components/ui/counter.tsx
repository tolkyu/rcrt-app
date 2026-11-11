'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/** The visual «120/500» is hidden from assistive tech; the full sentence is read once as the field description, not on every keystroke. */
export function Counter({
  id,
  count,
  max,
  className,
}: {
  id?: string;
  count: number;
  max: number;
  className?: string;
}) {
  const t = useTranslations('form');
  const over = count > max;
  return (
    <span
      id={id}
      data-slot="counter"
      data-over={over ? '' : undefined}
      className={cn(
        'text-muted-foreground data-over:text-error-text text-xs tabular-nums data-over:font-medium',
        className,
      )}
    >
      <span aria-hidden="true">{t('counter', { count, max })}</span>
      <span className="sr-only">
        {t(over ? 'counterOver' : 'counterSr', { count, max })}
      </span>
    </span>
  );
}
