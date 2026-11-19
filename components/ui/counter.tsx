'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/** The visual «120/500» is hidden from assistive tech: the sentence is read once as the field description, not on every keystroke. */
export function Counter({
  id,
  count,
  max,
  warnFrom,
  className,
}: {
  id?: string;
  count: number;
  max: number;
  warnFrom?: number;
  className?: string;
}) {
  const t = useTranslations('form');
  const over = count > max;
  const warn = !over && warnFrom !== undefined && count >= warnFrom;
  const atLimit = warn && count === max;
  return (
    <span
      id={id}
      data-slot="counter"
      data-over={over ? '' : undefined}
      data-warn={warn ? '' : undefined}
      className={cn(
        'text-muted-foreground data-over:text-error-text data-warn:text-warning-text text-xs tabular-nums data-over:font-medium data-warn:font-medium',
        className,
      )}
    >
      <span aria-hidden="true">{t('counter', { count, max })}</span>
      <span className="sr-only">
        {t(over ? 'counterOver' : atLimit ? 'counterLimit' : 'counterSr', {
          count,
          max,
        })}
      </span>
    </span>
  );
}
