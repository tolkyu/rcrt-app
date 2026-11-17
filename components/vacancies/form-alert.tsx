import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const TONES = {
  error: 'bg-destructive-subtle text-error-text',
  warning: 'bg-warning-subtle text-warning-text',
} as const;

/** Inline answer that a field cannot carry: server pages and the lazy feedback modules both draw it; the tone changes the colours only. */
export function FormAlert({
  children,
  action,
  tone = 'error',
}: {
  children: ReactNode;
  action?: ReactNode;
  tone?: keyof typeof TONES;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-wrap items-start gap-x-2 gap-y-1 rounded-lg p-3 text-sm font-medium',
        TONES[tone],
      )}
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  );
}
