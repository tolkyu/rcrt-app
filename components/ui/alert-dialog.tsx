'use client';

import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import {
  ModalFooter,
  modalClass,
  overlayClass,
  type ModalSize,
} from './modal-surface';
import { useOpenerFocus } from './use-opener-focus';

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogCancel = AlertDialogPrimitive.Cancel;

/**
 * Confirmation without a close icon: centered on desktop, bottom sheet below 768 px (wireframe settings-admin §1.9).
 * Radix ignores outside presses for alert dialogs; `onOverlayPress` opts a caller into overlay-cancels.
 */
export function AlertDialogContent({
  className,
  children,
  size = 'sm',
  onOverlayPress,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Content> & {
  size?: ModalSize;
  onOverlayPress?: () => void;
}) {
  const openerFocus = useOpenerFocus({ onOpenAutoFocus, onCloseAutoFocus });
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay
        className={overlayClass}
        onClick={onOverlayPress}
      />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={modalClass(size, className)}
        {...props}
        {...openerFocus}
      >
        {children}
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Portal>
  );
}

export function AlertDialogTitle({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn(
        'text-heading-lg text-foreground text-balance [overflow-wrap:anywhere]',
        className,
      )}
      {...props}
    />
  );
}

export function AlertDialogDescription({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

export function AlertDialogFooter(props: ComponentProps<'div'>) {
  return <ModalFooter data-slot="alert-dialog-footer" {...props} />;
}
