let last: HTMLElement | null = null;
let tracking = false;

/**
 * A lazily loaded modal mounts after its opener was hidden (and so blurred) by the Suspense boundary, when
 * `document.activeElement` is already <body>; this remembers the element that held focus before that. Install it from
 * an always-loaded client component, otherwise the first click happens before the listener exists.
 */
export function trackLastFocus() {
  if (tracking || typeof document === 'undefined') return;
  tracking = true;
  document.addEventListener(
    'focusin',
    (event) => {
      if (event.target instanceof HTMLElement) last = event.target;
    },
    true,
  );
}

export const lastFocusedElement = (): HTMLElement | null => last;
