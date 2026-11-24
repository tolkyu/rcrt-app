'use client';

import { useSyncExternalStore } from 'react';

const query = '(min-width: 1280px)';
const subscribe = (changed: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener('change', changed);
  return () => media.removeEventListener('change', changed);
};

/** Side panels exist only from the `xl` breakpoint; below it the server snapshot and the detail link apply. */
export const useWideScreen = () =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
