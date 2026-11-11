'use client';

import { X } from 'lucide-react';
import { Dialog as SheetPrimitive } from 'radix-ui';
import { useCallback, useRef, type ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { overlayClass } from './modal-surface';
import { keepOpenOnToast } from './toast-guard';
import { useOpenerFocus } from './use-opener-focus';

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

/** Drawer widths of the right side: 360 preview, 400 candidate drawer, 480 wide forms (ui-foundation G18). */
const widths = {
  sm: 'sm:w-[22.5rem]',
  md: 'sm:w-[25rem]',
  lg: 'sm:w-[30rem]',
} as const;

export type SheetSize = keyof typeof widths;

const sideClass = {
  right:
    'motion-sheet-side inset-y-0 right-0 h-full w-full pr-[env(safe-area-inset-right)] sm:border-l',
  left: 'motion-sheet-side inset-y-0 left-0 h-full w-[min(20rem,85vw)] border-r pl-[env(safe-area-inset-left)] [--motion-dir:-1]',
  bottom:
    'motion-sheet-up inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl border-t pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]',
} as const;

/** `size` sets the width of a right sheet only; left and bottom sheets keep their own geometry. */
export function SheetContent({
  className,
  children,
  side = 'left',
  size = 'lg',
  closeLabel,
  ref,
  onEscapeKeyDown,
  onInteractOutside,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: ComponentProps<typeof SheetPrimitive.Content> & {
  side?: keyof typeof sideClass;
  size?: SheetSize;
  closeLabel: string;
}) {
  const openerFocus = useOpenerFocus({ onOpenAutoFocus, onCloseAutoFocus });
  const content = useRef<HTMLDivElement | null>(null);
  // Stable: a new callback ref each render would detach and re-register the Radix layer.
  const setContent = useCallback(
    (node: HTMLDivElement | null) => {
      content.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className={overlayClass} />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'border-border bg-surface z-dialog fixed flex flex-col gap-2 overflow-y-auto shadow-lg',
          sideClass[side],
          side === 'right' && widths[size],
          className,
        )}
        {...props}
        ref={setContent}
        onInteractOutside={keepOpenOnToast(onInteractOutside)}
        {...openerFocus}
        onEscapeKeyDown={(event) => {
          const target = event.target;
          // Radix moves the Escape listener to a nested dialog only after a re-render; until then its keys arrive here.
          if (
            target instanceof Element &&
            target !== target.ownerDocument.body &&
            !content.current?.contains(target)
          ) {
            event.preventDefault();
            return;
          }
          onEscapeKeyDown?.(event);
        }}
      >
        {children}
        <SheetPrimitive.Close
          aria-label={closeLabel}
          className="text-muted-foreground hover:bg-surface-muted absolute top-2 right-2 inline-flex size-11 items-center justify-center rounded-md"
        >
          <X className="size-5" aria-hidden="true" />
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export function SheetTitle({
  className,
  ...props
}: ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('text-heading-lg text-foreground', className)}
      {...props}
    />
  );
}

export function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}
