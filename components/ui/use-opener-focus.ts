import { useCallback, useRef } from 'react';
import { lastFocusedElement } from '@/lib/last-focus';

type FocusEventHandler = (event: Event) => void;

/** Radix labels a menu's content with its trigger's id, which outlives the chosen item; a submenu's trigger is an item of its parent, so climb to the first trigger outside any menu. */
const menuTrigger = (element: Element | null): HTMLElement | null => {
  const id = element?.closest('[role="menu"]')?.getAttribute('aria-labelledby');
  const trigger = id ? document.getElementById(id) : null;
  return trigger?.closest('[role="menu"]') ? menuTrigger(trigger) : trigger;
};

const usable = (element: Element | null): element is HTMLElement =>
  element instanceof HTMLElement &&
  element.isConnected &&
  element !== document.body;

/**
 * Radix hands focus back only to a `Trigger` it renders; ours are mostly plain buttons that set `open`, where focus
 * would drop to <body>. The element that held focus as the modal mounted (or, for a modal that mounted after its opener
 * was hidden, the last one that did) gets it back, unless the caller already handled the event (`preventDefault`) or
 * that element is gone; a modal opened from a menu item then falls back to the menu's trigger. Spread the result onto
 * the Radix `Content`.
 */
export function useOpenerFocus({
  onOpenAutoFocus,
  onCloseAutoFocus,
}: {
  onOpenAutoFocus?: FocusEventHandler;
  onCloseAutoFocus?: FocusEventHandler;
}) {
  const opener = useRef<Element | null>(null);
  const fallback = useRef<HTMLElement | null>(null);
  const onOpen = useCallback(
    (event: Event) => {
      const active = document.activeElement;
      opener.current =
        active && active !== document.body ? active : lastFocusedElement();
      fallback.current = menuTrigger(opener.current);
      onOpenAutoFocus?.(event);
    },
    [onOpenAutoFocus],
  );
  const onClose = useCallback(
    (event: Event) => {
      onCloseAutoFocus?.(event);
      if (event.defaultPrevented) return;
      const target = [opener.current, fallback.current].find(usable);
      if (target) {
        event.preventDefault();
        target.focus();
      }
    },
    [onCloseAutoFocus],
  );
  return { onOpenAutoFocus: onOpen, onCloseAutoFocus: onClose };
}
