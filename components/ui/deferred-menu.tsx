'use client';

import {
  startTransition,
  Suspense,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { LoadBoundary } from './load-boundary';

export type MenuOpenedBy = 'keyboard' | 'pointer';

const OPEN_KEYS = new Set(['Enter', ' ', 'ArrowDown']);

/**
 * Shell menus render only their trigger until first use (PERF-04): the Radix menu chunk loads on
 * hover/focus and the menu opens on press. If the chunk is gone (a tab older than the last deploy),
 * the trigger stays and the next press reloads the page instead of crashing the shell.
 */
type DeferredTriggerProps = ReturnType<typeof useDeferredMenu>['triggerProps'];

export function useDeferredMenu(load: () => Promise<unknown>) {
  const [openedBy, setOpenedBy] = useState<MenuOpenedBy | null>(null);
  const [failed, setFailed] = useState(false);
  const preload = () => {
    load().catch(() => undefined);
  };
  const open = (by: MenuOpenedBy) => {
    if (failed) return window.location.reload();
    // A transition keeps the focused trigger on screen until the chunk is ready.
    startTransition(() => setOpenedBy(by));
  };
  const triggerProps = {
    'aria-haspopup': 'menu' as const,
    'aria-expanded': false,
    onPointerEnter: preload,
    onFocus: preload,
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0 || event.ctrlKey) return;
      event.preventDefault();
      open('pointer');
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (!OPEN_KEYS.has(event.key)) return;
      event.preventDefault();
      open('keyboard');
    },
  };
  return {
    openedBy,
    triggerProps,
    fail: () => {
      setOpenedBy(null);
      setFailed(true);
    },
  };
}

/** One stable tree: static trigger → lazily loaded Radix menu, with the trigger as the load/error fallback. */
export function DeferredMenu({
  menu,
  trigger,
  children,
}: {
  menu: ReturnType<typeof useDeferredMenu>;
  trigger: (
    props: DeferredTriggerProps | Record<string, never>,
  ) => ReactElement;
  children: (openedBy: MenuOpenedBy, trigger: ReactElement) => ReactNode;
}) {
  const fallback = trigger(menu.triggerProps);
  return (
    <LoadBoundary fallback={fallback} onError={menu.fail}>
      <Suspense fallback={fallback}>
        {menu.openedBy ? children(menu.openedBy, trigger({})) : fallback}
      </Suspense>
    </LoadBoundary>
  );
}

function focusFirstMenuItem(event: Event) {
  event.preventDefault();
  (event.currentTarget as HTMLElement | null)
    ?.querySelector<HTMLElement>('[role^="menuitem"]:not([data-disabled])')
    ?.focus();
}

/** Menu-button pattern: opening from the keyboard focuses the first item, as the Radix trigger would. */
export function menuAutoFocus(openedBy: MenuOpenedBy) {
  return openedBy === 'keyboard' ? { onOpenAutoFocus: focusFirstMenuItem } : {};
}
