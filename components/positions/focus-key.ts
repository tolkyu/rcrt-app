/** Duplicate keys are expected: `create` appears in the header, the sticky mobile button and possibly the empty state, so only the visible element is focused. Moves focus to the visible element carrying `data-focus-key`; retries a few frames because the row may render after a cache write or still be disabled by its pending mutation. */
export function focusByKey(key: string, attempts = 10): void {
  const target = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-focus-key="${key}"]`),
  ).find((element) => element.getClientRects().length > 0);
  target?.focus();
  if (target && document.activeElement === target) return;
  if (attempts > 0) requestAnimationFrame(() => focusByKey(key, attempts - 1));
}
