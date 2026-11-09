'use client';

import { useSyncExternalStore } from 'react';

export type ListLayout = 'table' | 'cards';

let media: MediaQueryList | undefined;
const desktopQuery = () => (media ??= window.matchMedia('(min-width: 768px)'));

const subscribe = (changed: () => void) => {
  const list = desktopQuery();
  list.addEventListener('change', changed);
  return () => list.removeEventListener('change', changed);
};
const current = (): ListLayout => (desktopQuery().matches ? 'table' : 'cards');

/** One DOM layout per viewport; the server hint is the first-paint snapshot so hydration and the markup agree. */
export const useListLayout = (serverHint: ListLayout): ListLayout =>
  useSyncExternalStore(subscribe, current, () => serverHint);
