'use client';

import { useState, type KeyboardEvent, type PointerEvent } from 'react';

const OPEN_KEYS = new Set(['Enter', ' ', 'ArrowDown']);

/**
 * Shell menus render only their trigger until first use (PERF-04): the Radix menu code loads on
 * hover/focus and the menu opens on press, by pointer or keyboard, exactly as the Radix trigger would.
 */
export function useDeferredMenu(load: () => Promise<unknown>) {
  const [active, setActive] = useState(false);
  const preload = () => void load();
  const triggerProps = {
    'aria-haspopup': 'menu' as const,
    'aria-expanded': false,
    onPointerEnter: preload,
    onFocus: preload,
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0 || event.ctrlKey) return;
      event.preventDefault();
      setActive(true);
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (!OPEN_KEYS.has(event.key)) return;
      event.preventDefault();
      setActive(true);
    },
  };
  return { active, triggerProps };
}
