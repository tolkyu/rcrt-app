'use client';

import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Label } from './label';

/** Name the group with `FormField layout="group"` (it supplies `aria-labelledby`). */
export function RadioGroup({
  className,
  ...props
}: ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn('group flex flex-col gap-0.5', className)}
      {...props}
    />
  );
}

/** One 44 px row (hit area a true 44 px, no colour transition; an invalid group shows through the root's `aria-invalid`): the label is part of the item, so a radio is never unlabelled; `id` is explicit for `<label for>`. */
export function RadioGroupItem({
  id,
  label,
  className,
  ...props
}: Omit<ComponentProps<typeof RadioGroupPrimitive.Item>, 'children'> & {
  id: string;
  label: ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center gap-3">
      <RadioGroupPrimitive.Item
        id={id}
        data-slot="radio-group-item"
        className={cn(
          'border-input bg-surface data-[state=checked]:border-primary group-aria-invalid:border-error relative flex size-5 shrink-0 items-center justify-center rounded-full border after:absolute after:-inset-[13px] disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
        {...props}
      >
        <RadioGroupPrimitive.Indicator className="bg-primary size-2.5 rounded-full" />
      </RadioGroupPrimitive.Item>
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}
