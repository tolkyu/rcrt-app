import { useCallback, useRef, type RefObject } from 'react';

/**
 * Records whether the trigger held focus as React removed it. Ref cleanups run before the node is detached,
 * the last point where `document.activeElement` still names it; afterwards focus is on `body` whichever
 * element was removed, so a sibling swapped in the same commit could not tell whose focus was lost.
 */
export function useFocusHold() {
  const held = useRef(false);
  const track = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    return () => {
      held.current = document.activeElement === node;
    };
  }, []);
  return { held, track };
}

/** The replacement of a focused trigger takes the focus back once, and only if its own predecessor held it. */
export function useRestoreFocus(pending: boolean, held: RefObject<boolean>) {
  const flag = useRef(pending);
  return useCallback(
    (node: HTMLElement | null) => {
      if (!node || !flag.current) return;
      flag.current = false;
      if (held.current) node.focus({ preventScroll: true });
    },
    [held],
  );
}
