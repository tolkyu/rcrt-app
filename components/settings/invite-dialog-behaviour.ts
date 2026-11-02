'use client';

import { useTranslations } from 'next-intl';
import { useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ApiError } from '@/lib/api-client';
import { toast } from '@/lib/toast';

/**
 * Toasts a failed invite action (resend, revoke, re-invite, change email). Returns true when the server
 * answered with a state change (roles gone, user moved on, version stale, not found): the caller closes,
 * refetches and focuses the card heading. False means a transport/server error: keep the dialog and input.
 */
export function useInviteFailure() {
  const t = useTranslations('settings.users.drawer');
  const tCommon = useTranslations('settings.common');
  return (error: Error): boolean => {
    if (error instanceof ApiError && error.code === 'INVITE_ROLES_INVALID') {
      toast.error(t('rolesInvalid'));
      return true;
    }
    if (
      error instanceof ApiError &&
      (error.status === 409 || error.status === 404)
    ) {
      toast.error(tCommon('conflict'));
      return true;
    }
    toast.error(tCommon('saveFailed'));
    return false;
  };
}

/**
 * A dialog opened over the user card: Escape closes only this dialog (never the Sheet behind it), and
 * focus returns to the heading once `focusHeadingRef` is set (server answered), else to `onFocusFallback`
 * or Radix's default.
 */
export function useNestedDialog({
  busy,
  close,
  onFocusHeading,
  onFocusFallback,
}: {
  busy: boolean;
  close: () => void;
  onFocusHeading: () => void;
  onFocusFallback?: () => void;
}) {
  const focusHeadingRef = useRef(false);
  const contentProps = {
    onEscapeKeyDown: (event: KeyboardEvent) => event.preventDefault(),
    // Radix attaches its Escape listener to a new layer only after a re-render, so a fast Escape would be lost.
    onKeyDown: (event: ReactKeyboardEvent) => {
      if (event.key !== 'Escape' || busy) return;
      focusHeadingRef.current = false;
      close();
    },
    onCloseAutoFocus: (event: Event) => {
      if (focusHeadingRef.current) {
        event.preventDefault();
        onFocusHeading();
      } else if (onFocusFallback) {
        event.preventDefault();
        onFocusFallback();
      }
    },
  };
  return { focusHeadingRef, contentProps };
}
