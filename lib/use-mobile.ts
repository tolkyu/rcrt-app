'use client';

import { useSyncExternalStore } from 'react';

const query = '(max-width: 767px)';
const subscribe = (changed: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener('change', changed);
  return () => media.removeEventListener('change', changed);
};

/** Render one responsive list presentation; the server snapshot matches the first hydration pass. */
export const useMobile = () =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
