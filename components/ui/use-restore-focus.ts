import { useCallback, useRef } from 'react';

/** A trigger that had focus is replaced when its lazy chunk arrives; the replacement takes the focus back once, unless it moved on. */
export function useRestoreFocus(pending: boolean) {
  const flag = useRef(pending);
  return useCallback((node: HTMLElement | null) => {
    if (!node || !flag.current) return;
    flag.current = false;
    if (document.activeElement === document.body)
      node.focus({ preventScroll: true });
  }, []);
}
