const RELOAD_KEY = 'chunk-reload-at';
const RELOAD_WINDOW_MS = 30_000;

/**
 * Loads an on-demand chunk; a tab older than the last deploy cannot fetch it, so reload once to get the
 * current build. A second failure within 30 s (or no sessionStorage) rethrows to the error boundary
 * instead of reloading forever (SEC-AAF-01).
 */
export function loadOrReload<T>(
  load: () => Promise<T>,
  now: () => number = Date.now,
): Promise<T> {
  return load().catch((error: unknown) => {
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY));
      if (last && now() - last < RELOAD_WINDOW_MS) throw error;
      sessionStorage.setItem(RELOAD_KEY, String(now()));
    } catch {
      throw error;
    }
    window.location.reload();
    return new Promise<never>(() => undefined);
  });
}
