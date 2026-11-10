'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Select as SelectPrimitive } from 'radix-ui';
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useRestoreFocus } from './use-restore-focus';
import {
  findOption,
  NO_OPTIONS_VALUE,
  fromInternalValue,
  toInternalValue,
  triggerClass,
  valueClass,
  type SelectFieldProps,
  type SelectOpenedBy,
  type SelectOption,
} from './select-shared';

const itemClass =
  'relative flex min-h-11 cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-base outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[state=checked]:text-link md:min-h-9 md:text-sm';

function OptionItem({ option }: { option: SelectOption }) {
  return (
    <SelectPrimitive.Item
      value={toInternalValue(option.value)}
      disabled={option.disabled}
      className={itemClass}
    >
      <SelectPrimitive.ItemText>
        <span className="flex min-w-0 flex-col">
          <span className="line-clamp-2 break-words">{option.label}</span>
          {option.description && (
            <span className="text-muted-foreground line-clamp-2 text-xs break-words">
              {option.description}
            </span>
          )}
        </span>
      </SelectPrimitive.ItemText>
      <span className="absolute right-2 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="text-link size-4" aria-hidden="true" />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  );
}

interface SelectContentProps extends Omit<SelectFieldProps, 'name'> {
  /** The press or key that asked for the chunk opens the list at once. */
  open: boolean;
  openedBy: SelectOpenedBy;
  /** The static trigger had keyboard focus when it was replaced. */
  refocus: boolean;
}

export default function SelectContent({
  options,
  value,
  onValueChange,
  placeholder,
  disabled,
  className,
  id,
  onBlur,
  open,
  openedBy,
  refocus,
  ...aria
}: SelectContentProps) {
  const t = useTranslations('common');
  const [instant, setInstant] = useState(open && openedBy === 'keyboard');
  const via = useRef<SelectOpenedBy>(openedBy);
  const selected = findOption(options, value);

  const attach = useRestoreFocus(refocus);

  return (
    <SelectPrimitive.Root
      defaultOpen={open}
      value={selected ? toInternalValue(selected.value) : ''}
      onValueChange={(next) => onValueChange(fromInternalValue(next))}
      onOpenChange={(next) => {
        if (next) setInstant(via.current === 'keyboard');
      }}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        {...aria}
        id={id}
        ref={attach}
        data-slot="select-trigger"
        title={selected?.label}
        className={cn(triggerClass, className)}
        onBlur={onBlur}
        onPointerDown={() => {
          via.current = 'pointer';
        }}
        onKeyDown={() => {
          via.current = 'keyboard';
        }}
      >
        <SelectPrimitive.Value placeholder={placeholder} className={valueClass}>
          {selected?.label}
        </SelectPrimitive.Value>
        <SelectPrimitive.Icon asChild>
          <ChevronDown
            aria-hidden="true"
            className="text-muted-foreground size-4 shrink-0"
          />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          collisionPadding={8}
          data-slot="select-content"
          data-instant={instant ? '' : undefined}
          className="border-border bg-popover text-popover-foreground motion-pop z-30 max-h-(--radix-select-content-available-height) max-w-[min(var(--radix-select-content-available-width),22rem)] min-w-(--radix-select-trigger-width) overflow-hidden rounded-lg border shadow-md"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.length === 0 ? (
              <SelectPrimitive.Item
                value={NO_OPTIONS_VALUE}
                disabled
                className={itemClass}
              >
                <SelectPrimitive.ItemText>
                  {t('selectEmpty')}
                </SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ) : (
              options.map((option) => (
                <OptionItem key={option.value} option={option} />
              ))
            )}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
