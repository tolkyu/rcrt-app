'use client';

import { lazy, Suspense, useSyncExternalStore } from 'react';
import type { ToasterProps } from 'sonner';
import { subscribeToToasts, toastRequested } from '@/lib/toast';

const ToastRuntime = lazy(() => import('./sonner-runtime'));

/** Toasts per 01-components §05: surface card, radius 12, shadow lg, above dialogs (z 50). */
export function Toaster(props: ToasterProps) {
  const requested = useSyncExternalStore(
    subscribeToToasts,
    toastRequested,
    () => false,
  );
  return requested ? (
    <Suspense fallback={null}>
      <ToastRuntime {...props} />
    </Suspense>
  ) : null;
}
