'use client';

import { RadioGroup } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import {
  SEGMENTED_CHECKED_RADIX_CLASS,
  SEGMENTED_GROUP_CLASS,
  SEGMENTED_ITEM_CLASS,
} from './segmented-classes';

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
      className={cn(SEGMENTED_GROUP_CLASS, className)}
    >
      {options.map((option) => (
        <RadioGroup.Item
          key={option.value}
          value={option.value}
          className={cn(SEGMENTED_ITEM_CLASS, SEGMENTED_CHECKED_RADIX_CLASS)}
        >
          {option.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
