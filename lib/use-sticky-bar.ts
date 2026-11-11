import { useCallback, type RefCallback } from 'react';

const PROPERTY = '--sticky-bar-bottom';

/**
 * Ref for a bar that sticks above the bottom chrome: while mounted it publishes its height plus `gap` on <html>,
 * so toasts (sonner-runtime) stack above it instead of covering its action. `gap` is the bar's own distance from the chrome.
 */
export function useStickyBar(gap = 0): RefCallback<HTMLElement> {
  return useCallback(
    (node) => {
      if (!node) return;
      const root = document.documentElement;
      const publish = () => {
        // A bar hidden at this breakpoint (display: none) reserves nothing.
        const height = node.offsetHeight;
        root.style.setProperty(PROPERTY, `${height > 0 ? height + gap : 0}px`);
      };
      publish();
      const observer = new ResizeObserver(publish);
      observer.observe(node);
      return () => {
        observer.disconnect();
        root.style.removeProperty(PROPERTY);
      };
    },
    [gap],
  );
}
