'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};
const client = () => true;
const server = () => false;

/** False on the server and during hydration, true afterwards. */
export const useHydrated = () =>
  useSyncExternalStore(subscribe, client, server);
