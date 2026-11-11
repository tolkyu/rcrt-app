'use client';

import { CircleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

function Summary({ count, className }: { count: number; className?: string }) {
  const t = useTranslations('form');
  return (
    <div
      role="alert"
      data-slot="form-error"
      className={cn(
        'bg-destructive-subtle text-error-text flex items-start gap-2 rounded-lg p-3 text-sm font-medium',
        className,
      )}
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {t('errorSummary', { count })}
    </div>
  );
}

/**
 * Submit-time summary, announced once per failed submit: render it with the invalid-field count taken at submit and
 * bump `attempt` on every failed submit so the same count is announced again; per-field errors speak for themselves after blur.
 */
export function FormError({
  count,
  attempt,
  className,
}: {
  count: number;
  attempt: number;
  className?: string;
}) {
  if (count < 1) return null;
  return <Summary key={attempt} count={count} className={className} />;
}
