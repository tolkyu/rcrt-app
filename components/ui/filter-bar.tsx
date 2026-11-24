'use client';

import {
  useEffect,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

/** Grid contract: one column on mobile; at md+ search 2fr | select 1fr, full-width children (chips) add `md:col-span-2`. */
export function FilterBar({
  label,
  children,
  reset,
}: {
  label: string;
  children: ReactNode;
  reset?: ReactNode;
}) {
  return (
    <section aria-label={label} data-slot="filter-bar" className="mb-4 min-w-0">
      <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {children}
      </div>
      {reset && <div className="mt-3">{reset}</div>}
    </section>
  );
}

/** Keep controls and preview outside this region so a slow filter dims only its results. */
export function FilterBarResults({
  busy = false,
  className,
  ...props
}: ComponentProps<'section'> & { busy?: boolean }) {
  const [delayed, setDelayed] = useState(false);
  if (!busy && delayed) setDelayed(false);
  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => setDelayed(true), 150);
    return () => clearTimeout(timer);
  }, [busy]);

  return (
    <section
      {...props}
      aria-busy={busy}
      data-slot="filter-bar-results"
      data-dimmed={busy && delayed}
      className={cn(
        'min-w-0 outline-none',
        busy && delayed && 'opacity-60',
        className,
      )}
    />
  );
}
