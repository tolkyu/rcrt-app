'use client';

import { useState, useSyncExternalStore } from 'react';

const initial = { ready: false, token: null } as const;
type TokenSnapshot = { ready: boolean; token: string | null };

/** Capture an external, single-use URL credential after hydration and remove it from browser history. */
export function useFragmentToken(
  name: string,
  pattern: RegExp,
  allowQuery = false,
): TokenSnapshot {
  const [store] = useState(() => {
    let snapshot: TokenSnapshot = initial;
    const listeners = new Set<() => void>();
    return {
      getSnapshot: () => snapshot,
      subscribe(listener: () => void) {
        listeners.add(listener);
        if (!snapshot.ready) {
          const hash = new URLSearchParams(window.location.hash.slice(1)).get(
            name,
          );
          const query = allowQuery
            ? new URLSearchParams(window.location.search).get(name)
            : null;
          window.history.replaceState(null, '', window.location.pathname);
          const value = hash ?? query;
          snapshot = {
            ready: true,
            token: value && pattern.test(value) ? value : null,
          };
          for (const notify of listeners) notify();
        }
        return () => {
          listeners.delete(listener);
        };
      },
    };
  });
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => initial,
  );
}
