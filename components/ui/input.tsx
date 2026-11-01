import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Input({
  className,
  type = 'text',
  ...props
}: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'border-input bg-surface text-foreground placeholder:text-muted-foreground disabled:bg-surface-muted disabled:text-muted-foreground-strong aria-invalid:border-error h-11 w-full min-w-0 rounded-lg border px-3 text-base transition-colors duration-120 disabled:cursor-not-allowed md:h-10 md:text-sm',
        className,
      )}
      {...props}
    />
  );
}
