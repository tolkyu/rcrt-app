import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="border-border bg-surface flex flex-col gap-5 rounded-xl border p-6 shadow-sm md:p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-display-xl text-foreground">{title}</h1>
        {description ? (
          <div className="text-muted-foreground text-sm">{description}</div>
        ) : null}
      </header>
      {children}
    </section>
  );
}

/** Inline status line; errors are announced to screen readers (role="alert"). */
export function FormMessage({
  tone,
  children,
  id,
}: {
  tone: 'error' | 'success' | 'info';
  children: ReactNode;
  id?: string;
}) {
  return (
    <p
      id={id}
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-lg border px-3 py-2 text-sm',
        tone === 'error' &&
          'border-error bg-destructive-subtle text-error-text',
        tone === 'success' && 'border-success bg-surface text-success-text',
        tone === 'info' &&
          'border-border bg-surface-muted text-muted-foreground-strong',
      )}
    >
      {children}
    </p>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="text-muted-foreground flex items-center gap-3 text-sm"
    >
      <span
        aria-hidden="true"
        className="border-border border-t-primary size-4 animate-spin rounded-full border-2 motion-reduce:animate-none"
      />
      {label}
    </div>
  );
}
