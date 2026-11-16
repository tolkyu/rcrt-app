import { useCallback, type RefCallback } from 'react';

const BAR_PROPERTY = '--sticky-bar-bottom';
/** A sticky form footer sits in the page flow: it lifts the toasts without padding `<main>`, and only while it is pinned to the bottom edge. */
export const FOOTER_PROPERTY = '--sticky-footer-bottom';

const publish = (property: string, height: number, gap: number) =>
  document.documentElement.style.setProperty(
    property,
    `${height > 0 ? height + gap : 0}px`,
  );

/**
 * Ref for a fixed bar above the bottom chrome: while mounted it publishes its height plus `gap` on <html>,
 * so toasts (sonner-runtime) stack above it instead of covering its action. `gap` is the bar's own distance from the chrome.
 */
export function useStickyBar(gap = 0): RefCallback<HTMLElement> {
  return useCallback(
    (node) => {
      if (!node) return;
      // A bar hidden at this breakpoint (display: none) reserves nothing.
      const update = () => publish(BAR_PROPERTY, node.offsetHeight, gap);
      update();
      const resize = new ResizeObserver(update);
      resize.observe(node);
      return () => {
        resize.disconnect();
        document.documentElement.style.removeProperty(BAR_PROPERTY);
      };
    },
    [gap],
  );
}

/** In the flow a short form's footer ends mid-page, clear of the toast corner; it covers it only once it sticks. */
function pinnedToBottom(node: HTMLElement): boolean {
  const { top, bottom } = node.getBoundingClientRect();
  const inset = Number.parseFloat(getComputedStyle(node).bottom) || 0;
  return top < window.innerHeight && bottom >= window.innerHeight - inset - 1;
}

/**
 * Ref for a form footer with `position: sticky`: publishes its height only while it is pinned to the bottom edge,
 * re-evaluated on scroll, window resize and when the footer or its form changes size.
 */
export function useStickyFooter(): RefCallback<HTMLElement> {
  return useCallback((node) => {
    if (!node) return;
    const update = () =>
      publish(FOOTER_PROPERTY, pinnedToBottom(node) ? node.offsetHeight : 0, 0);
    update();
    const resize = new ResizeObserver(update);
    resize.observe(node);
    if (node.parentElement) resize.observe(node.parentElement);
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      resize.disconnect();
      document.documentElement.style.removeProperty(FOOTER_PROPERTY);
    };
  }, []);
}
