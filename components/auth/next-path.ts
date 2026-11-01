const KEY = 'hris.auth.next';
const MAX_AGE_MS = 15 * 60 * 1000;

/** Return path survives the trip through the mailbox on the same device; the server re-validates it (DG-15). */
export function rememberNextPath(path: string | null) {
  try {
    if (path)
      localStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() }));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage can be unavailable (private mode); the user then lands on the home page.
  }
}

export function takeNextPath(): string | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    if (!raw) return undefined;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return undefined;
    const path = Reflect.get(value, 'path');
    const at = Reflect.get(value, 'at');
    return typeof path === 'string' &&
      typeof at === 'number' &&
      Date.now() - at < MAX_AGE_MS
      ? path
      : undefined;
  } catch {
    return undefined;
  }
}
