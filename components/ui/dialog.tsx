'use client';

import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  ModalFooter,
  modalClass,
  overlayClass,
  type ModalSize,
} from './modal-surface';
import { keepOpenOnToast } from './toast-guard';
import { useOpenerFocus } from './use-opener-focus';

export const Dialog = DialogPrimitive.Root;

/** Centered dialog on desktop (`size` sets the width: sm 28 / md 36 / lg 48 rem), bottom sheet below 768 px (wireframe settings-admin §2.3). */
export function DialogContent({
  className,
  children,
  closeLabel,
  size = 'sm',
  onInteractOutside,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  closeLabel: string;
  size?: ModalSize;
}) {
  const openerFocus = useOpenerFocus({ onOpenAutoFocus, onCloseAutoFocus });
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClass} />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={modalClass(size, className)}
        {...props}
        onInteractOutside={keepOpenOnToast(onInteractOutside)}
        {...openerFocus}
      >
        {children}
        <DialogPrimitive.Close
          aria-label={closeLabel}
          className="text-muted-foreground hover:bg-surface-muted absolute top-2 right-2 inline-flex size-11 items-center justify-center rounded-md"
        >
          <X className="size-5" aria-hidden="true" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        'text-heading-lg text-foreground pr-10 text-balance [overflow-wrap:anywhere]',
        className,
      )}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

/** Title with an optional icon tile and a subtitle, as in the invitation mockup; the subtitle is the dialog's accessible description. */
export function DialogHeader({
  icon,
  title,
  subtitle,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex items-start gap-3 pr-10', className)}
    >
      {icon && (
        <span
          aria-hidden="true"
          className="bg-primary-subtle text-brand flex size-11 shrink-0 items-center justify-center rounded-xl md:size-12 [&_svg]:size-6"
        >
          {icon}
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-0.5">
        <DialogTitle className="pr-0">{title}</DialogTitle>
        {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
      </div>
    </div>
  );
}

export function DialogFooter(props: ComponentProps<'div'>) {
  return <ModalFooter data-slot="dialog-footer" {...props} />;
}
