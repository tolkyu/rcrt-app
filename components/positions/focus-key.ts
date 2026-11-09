/** Duplicate keys are expected: the table and the cards render the same key and only one of them is visible. Moves focus to the visible element carrying `data-focus-key`; retries a few frames because the row may render after a cache write or still be disabled by its pending mutation. */
export function focusByKey(key: string, attempts = 10): void {
  const target = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-focus-key="${key}"]`),
  ).find((element) => element.getClientRects().length > 0);
  target?.focus();
  if (target && document.activeElement === target) return;
  if (attempts > 0) requestAnimationFrame(() => focusByKey(key, attempts - 1));
}
