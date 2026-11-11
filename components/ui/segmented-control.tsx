'use client';

import { RadioGroup } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedOption {
  value: string;
  label: string;
}

/**
 * APG radio group drawn as segments: arrows move and select (wrapping), Tab enters on the checked item, so
 * there is always a value. Looks like the in-card `Tabs`; name it with `FormField layout="group"`.
 */
export function SegmentedControl({
  options,
  value,
  onValueChange,
  className,
  ...props
}: Pick<
  ComponentProps<'div'>,
  | 'id'
  | 'ref'
  | 'onBlur'
  | 'aria-label'
  | 'aria-labelledby'
  | 'aria-describedby'
  | 'aria-invalid'
  | 'aria-required'
> & {
  options: readonly SegmentedOption[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <RadioGroup.Root
      {...props}
      data-slot="segmented-control"
      value={value}
      onValueChange={onValueChange}
      className={cn(
        'bg-surface-muted aria-invalid:border-error grid auto-cols-fr grid-flow-col gap-1 rounded-xl border border-transparent p-1',
        className,
      )}
    >
      {options.map((option) => (
        <RadioGroup.Item
          key={option.value}
          value={option.value}
          className="text-muted-foreground data-[state=checked]:border-border data-[state=checked]:bg-surface data-[state=checked]:text-link dark:data-[state=checked]:bg-primary-subtle h-11 rounded-lg border border-transparent px-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 data-[state=checked]:shadow-sm md:h-10"
        >
          {option.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
