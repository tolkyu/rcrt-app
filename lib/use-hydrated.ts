'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};
const client = () => true;
const server = () => false;

/** Native controls must not accept edits before React can retain their events. */
export const useHydrated = () =>
  useSyncExternalStore(subscribe, client, server);
