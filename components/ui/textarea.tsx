import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * Grows with its content through CSS `field-sizing` (no JS measuring, no height animation); browsers without it keep
 * a scrolling box of the 3-row minimum. No `maxLength`: typing past the limit must show the counter, not drop characters.
 */
export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'border-input bg-surface text-foreground placeholder:text-muted-foreground disabled:bg-surface-muted disabled:text-muted-foreground-strong aria-invalid:border-error block field-sizing-content max-h-80 min-h-[calc(3lh+1.5rem+2px)] w-full min-w-0 resize-none rounded-lg border px-3 py-3 text-base transition-colors duration-120 disabled:cursor-not-allowed aria-invalid:transition-none md:text-sm',
        className,
      )}
      {...props}
    />
  );
}
