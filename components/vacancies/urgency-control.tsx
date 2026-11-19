'use client';

import type { ComponentProps } from 'react';
import {
  SEGMENTED_CHECKED_NATIVE_CLASS,
  SEGMENTED_GROUP_CLASS,
  SEGMENTED_ITEM_CLASS,
} from '@/components/ui/segmented-classes';
import { cn } from '@/lib/utils';

export interface UrgencyOption {
  value: string;
  label: string;
}

/**
 * The `SegmentedControl` look on native radios: the browser already gives arrows that move and select (wrapping) and Tab
 * onto the checked item, so the create form ships no Radix radio/roving-focus code (PERF-04). Name it with `FormField layout="group"`.
 * `disabled` is `aria-disabled` plus ignored changes, so a press in flight does not drop keyboard focus.
 */
export function UrgencyControl({
  id,
  options,
  value,
  onValueChange,
  disabled,
  ...props
}: Pick<
  ComponentProps<'div'>,
  | 'onBlur'
  | 'aria-labelledby'
  | 'aria-describedby'
  | 'aria-invalid'
  | 'aria-required'
  | 'aria-busy'
> & {
  id: string;
  options: readonly UrgencyOption[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div
      {...props}
      id={id}
      role="radiogroup"
      aria-disabled={disabled || undefined}
      data-slot="segmented-control"
      className={cn('group', SEGMENTED_GROUP_CLASS)}
    >
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            SEGMENTED_ITEM_CLASS,
            SEGMENTED_CHECKED_NATIVE_CLASS,
            'relative flex items-center justify-center',
            'has-focus-visible:outline-ring has-focus-visible:outline-2 has-focus-visible:outline-offset-2',
          )}
        >
          <input
            type="radio"
            name={id}
            value={option.value}
            checked={value === option.value}
            className="sr-only"
            onChange={() => {
              if (!disabled) onValueChange(option.value);
            }}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}
