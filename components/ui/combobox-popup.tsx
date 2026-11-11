'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Popover } from 'radix-ui';
import { useEffect, useRef, type RefObject } from 'react';
import { cn } from '@/lib/utils';
import { Avatar } from './avatar';
import { Badge } from './badge';
import { Button } from './button';
import type { ComboboxOption, ComboboxStatus } from './combobox-shared';

export type ComboboxDismissal = 'keyboard' | 'pointer';

interface ComboboxPopupProps {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  /** Keyboard-driven open and close skip the motion (frequent actions never animate). */
  instant: boolean;
  onDismiss: (by: ComboboxDismissal) => void;
  listId: string;
  label: string | undefined;
  labelledBy: string | undefined;
  options: readonly ComboboxOption[];
  status: ComboboxStatus;
  value: string;
  activeIndex: number;
  emptyText: string;
  onActivate: (index: number) => void;
  onChoose: (option: ComboboxOption) => void;
  onRetry: (() => void) | null;
}

export default function ComboboxPopup({
  anchor,
  open,
  instant,
  onDismiss,
  listId,
  label,
  labelledBy,
  options,
  status,
  value,
  activeIndex,
  emptyText,
  onActivate,
  onChoose,
  onRetry,
}: ComboboxPopupProps) {
  const t = useTranslations('common');

  const hovered = useRef(false);
  useEffect(() => {
    // A hovered option is already under the pointer; only keyboard moves and reloads scroll.
    if (hovered.current) {
      hovered.current = false;
      return;
    }
    if (open && activeIndex >= 0)
      document
        .getElementById(`${listId}-${activeIndex}`)
        ?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex, listId, options]);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onDismiss('pointer');
      }}
    >
      <Popover.Anchor virtualRef={anchor} />
      <Popover.Portal>
        <Popover.Content
          role="presentation"
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={8}
          data-slot="combobox-content"
          data-instant={instant ? '' : undefined}
          // Same z-index as Dialog; the later portal wins.
          className="border-border bg-popover text-popover-foreground motion-pop z-50 flex max-h-[min(60dvh,var(--radix-popover-content-available-height))] w-(--radix-popover-trigger-width) max-w-[calc(100vw-1rem)] min-w-56 flex-col overflow-hidden rounded-lg border shadow-md"
          // Focus stays in the input the whole time.
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            onDismiss('keyboard');
          }}
          onInteractOutside={(event) => {
            // The field handles its own presses; letting Radix dismiss first would close and reopen the list.
            if (anchor.current?.contains(event.target as Node))
              event.preventDefault();
          }}
        >
          <ul
            id={listId}
            role="listbox"
            aria-label={label}
            aria-labelledby={labelledBy}
            aria-busy={status === 'loading'}
            // Keep focus in the input so the mobile keyboard stays open while picking.
            onPointerDown={(event) => event.preventDefault()}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1 empty:hidden"
          >
            {options.map((option, index) => (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- combobox pattern: keys are handled on the input via aria-activedescendant; options never take focus.
              <li
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                aria-disabled={option.disabled || undefined}
                data-slot="combobox-option"
                onPointerMove={() => {
                  if (option.disabled || index === activeIndex) return;
                  hovered.current = true;
                  onActivate(index);
                }}
                onClick={() => onChoose(option)}
                className={cn(
                  'flex min-h-11 cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-base md:min-h-9 md:text-sm',
                  index === activeIndex && 'bg-accent',
                  option.disabled && 'opacity-50',
                )}
              >
                {option.avatar && (
                  <Avatar name={option.label} className="size-7 text-xs" />
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="line-clamp-2 break-words">
                    {option.label}
                  </span>
                  {option.description && (
                    <span className="text-muted-foreground line-clamp-2 text-xs break-words">
                      {option.description}
                    </span>
                  )}
                </span>
                {option.inactive && <Badge size="sm">{t('inactive')}</Badge>}
                {option.value === value && (
                  <>
                    <Check
                      className="text-link size-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span className="sr-only">{t('comboboxSelected')}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
          {status === 'loading' && (
            <p
              role="status"
              className="text-muted-foreground px-3 py-4 text-center text-sm"
            >
              {t('comboboxLoading')}
            </p>
          )}
          {status === 'ready' && options.length === 0 && (
            <p
              role="status"
              className="text-muted-foreground px-3 py-4 text-center text-sm"
            >
              {emptyText}
            </p>
          )}
          {status === 'error' && (
            <div
              role="alert"
              className="flex flex-col items-center gap-2 px-3 py-4 text-center text-sm"
            >
              <p className="text-error-text">{t('comboboxFailed')}</p>
              {onRetry && (
                <Button
                  variant="outline"
                  size="sm"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={onRetry}
                >
                  {t('retry')}
                </Button>
              )}
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
