'use client';

import { X } from 'lucide-react';
import { Dialog as SheetPrimitive } from 'radix-ui';
import { useCallback, useRef, type ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

const sideClass = {
  right:
    'inset-y-0 right-0 h-full w-full pr-[env(safe-area-inset-right)] sm:w-[30rem] sm:border-l data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
  left: 'inset-y-0 left-0 h-full w-[min(20rem,85vw)] border-r pl-[env(safe-area-inset-left)] data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left',
  bottom:
    'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl border-t pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
} as const;

export function SheetContent({
  className,
  children,
  side = 'left',
  closeLabel,
  ref,
  onEscapeKeyDown,
  ...props
}: ComponentProps<typeof SheetPrimitive.Content> & {
  side?: keyof typeof sideClass;
  closeLabel: string;
}) {
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
      <SheetPrimitive.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 fixed inset-0 z-40 bg-black/40" />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'border-border bg-surface data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-40 flex flex-col gap-2 overflow-y-auto shadow-lg duration-200 ease-out motion-reduce:duration-0',
          sideClass[side],
          className,
        )}
        {...props}
        ref={setContent}
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
