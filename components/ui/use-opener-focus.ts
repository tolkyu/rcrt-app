import { useCallback, useRef } from 'react';
import { lastFocusedElement } from '@/lib/last-focus';

type FocusEventHandler = (event: Event) => void;

/**
 * Radix hands focus back only to a `Trigger` it renders; ours are mostly plain buttons that set `open`, where focus
 * would drop to <body>. The element that held focus as the modal mounted (or, for a modal that mounted after its opener was hidden, the last one that did) gets it back, unless the caller already
 * handled the event (`preventDefault`) or that element is gone. Spread the result onto the Radix `Content`.
 */
export function useOpenerFocus({
  onOpenAutoFocus,
  onCloseAutoFocus,
}: {
  onOpenAutoFocus?: FocusEventHandler;
  onCloseAutoFocus?: FocusEventHandler;
}) {
  const opener = useRef<Element | null>(null);
  const onOpen = useCallback(
    (event: Event) => {
      const active = document.activeElement;
      opener.current =
        active && active !== document.body ? active : lastFocusedElement();
      onOpenAutoFocus?.(event);
    },
    [onOpenAutoFocus],
  );
  const onClose = useCallback(
    (event: Event) => {
      onCloseAutoFocus?.(event);
      const target = opener.current;
      if (event.defaultPrevented) return;
      if (
        target instanceof HTMLElement &&
        target.isConnected &&
        target !== document.body
      ) {
        event.preventDefault();
        target.focus();
      }
    },
    [onCloseAutoFocus],
  );
  return { onOpenAutoFocus: onOpen, onCloseAutoFocus: onClose };
}
