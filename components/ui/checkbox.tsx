'use client';

import { Check } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * 20 px box with a true 44 px touch target (the `after` layer is inset from the padding box, so -13 px, not -12);
 * two states only. Name it through `FormField layout="inline"` or `<Label htmlFor>`. No colour transition: a state change must be instant.
 */
export function Checkbox({
  className,
  onCheckedChange,
  ...props
}: Omit<
  ComponentProps<typeof CheckboxPrimitive.Root>,
  'checked' | 'defaultChecked' | 'onCheckedChange'
> & {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'border-input bg-surface data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground aria-invalid:border-error relative flex size-5 shrink-0 items-center justify-center rounded-[4px] border after:absolute after:-inset-[13px] disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      onCheckedChange={(next) => onCheckedChange?.(next === true)}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
