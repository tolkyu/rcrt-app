import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Static block in the final layout box; wrap groups in `skeleton-delayed` so they show only after 150 ms. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('bg-surface-muted rounded-md', className)}
      {...props}
    />
  );
}
