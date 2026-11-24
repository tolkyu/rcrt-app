'use client';

import type { ComponentProps, MouseEvent } from 'react';
import { cn } from '@/lib/utils';

/** Radix Label's behaviour without its Primitive (PERF-04): a double click does not select the label text. */
export function Label({
  className,
  onMouseDown,
  ...props
}: ComponentProps<'label'>) {
  const handleMouseDown = (event: MouseEvent<HTMLLabelElement>) => {
    if (
      event.target instanceof Element &&
      event.target.closest('button, input, select, textarea')
    )
      return;
    onMouseDown?.(event);
    if (!event.defaultPrevented && event.detail > 1) event.preventDefault();
  };
  return (
    // eslint-disable-next-line jsx-a11y/label-has-associated-control, jsx-a11y/no-noninteractive-element-interactions -- callers associate the control through `htmlFor` or nesting; pinned by tests/unit/ui/label.test.ts.
    <label
      data-slot="label"
      className={cn('text-foreground text-sm font-medium', className)}
      {...props}
      onMouseDown={handleMouseDown}
    />
  );
}
