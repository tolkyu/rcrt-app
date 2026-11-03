'use client';

import { ChevronDown, X } from 'lucide-react';
import {
  useId,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type RefObject,
} from 'react';
import { cn } from '@/lib/utils';

export function AuditFilterTrigger<Props extends object>({
  label,
  value,
  selected,
  summaryId,
  controls,
  clearLabel,
  className,
  preload,
  onClear,
  picker: Picker,
  pickerProps,
}: {
  label: string;
  value: ReactNode;
  selected: boolean;
  summaryId?: string;
  controls?: boolean;
  clearLabel: string;
  className: string;
  preload: () => void;
  onClear: () => void;
  picker: ComponentType<
    Props & {
      id: string;
      anchor: RefObject<HTMLButtonElement | null>;
      open: boolean;
      onOpenChange: (open: boolean) => void;
    }
  >;
  pickerProps: Props;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState<boolean>();
  return (
    <div className="relative flex min-w-0 flex-col gap-1">
      <label
        id={`${id}-label`}
        htmlFor={id}
        className="text-foreground text-xs font-medium"
      >
        {label}
      </label>
      <div
        className={cn(
          className,
          'relative flex h-auto items-center px-0 md:h-10',
        )}
      >
        <button
          ref={trigger}
          id={id}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={!!open}
          aria-controls={controls ? `${id}-dialog` : undefined}
          aria-labelledby={`${id}-label ${id}`}
          aria-describedby={selected ? summaryId : undefined}
          onPointerEnter={preload}
          onFocus={preload}
          onClick={() => setOpen(!open)}
          className={`min-h-11 min-w-0 flex-1 rounded-lg px-3 text-left md:h-full md:min-h-0 ${selected ? '' : 'pr-10'}`}
        >
          <span className="block truncate">{value}</span>
        </button>
        {selected ? (
          <button
            type="button"
            aria-label={clearLabel}
            onClick={() => {
              onClear();
              trigger.current?.focus();
            }}
            className="hover:bg-surface-muted inline-flex size-11 shrink-0 items-center justify-center rounded-md md:mr-1 md:size-8"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : (
          <ChevronDown
            className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
        )}
      </div>
      {open !== undefined && (
        <Picker
          {...pickerProps}
          id={`${id}-dialog`}
          anchor={trigger}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </div>
  );
}
