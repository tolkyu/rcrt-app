let last: HTMLElement | null = null;
let tracking = false;

// Safari and macOS Firefox do not focus a clicked button, so `focusin` alone misses the very click that opens a modal.
const OPENER =
  'button, [role="button"], [role="menuitem"], a[href], [tabindex]:not([tabindex="-1"])';

/**
 * A lazily loaded modal mounts after its opener was hidden (and so blurred) by the Suspense boundary, when
 * `document.activeElement` is already <body>; this remembers the element that held focus (or was pressed) before that.
 * Install it from an always-loaded client component, otherwise the first click happens before the listener exists.
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
  document.addEventListener(
    'pointerdown',
    (event) => {
      const pressed =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(OPENER)
          : null;
      if (pressed) last = pressed;
    },
    true,
  );
}

export const lastFocusedElement = (): HTMLElement | null => last;
