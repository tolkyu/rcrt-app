'use client';

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from 'react';
import type { ToasterProps } from 'sonner';
import { subscribeToToasts, toastRequested } from '@/lib/toast';
import { LoadBoundary } from './load-boundary';

type Runtime = ComponentType<ToasterProps>;

/** Runtime chunk goes into state, not `React.lazy`: a toast raised with `router.refresh()` was lost in the transition (BUG-S3-14). */
export function Toaster(props: ToasterProps) {
  const requested = useSyncExternalStore(
    subscribeToToasts,
    toastRequested,
    () => false,
  );
  const [Runtime, setRuntime] = useState<Runtime | null>(null);
  useEffect(() => {
    if (!requested) return;
    let active = true;
    import('./sonner-runtime').then(
      (loaded) => {
        if (active) setRuntime(() => loaded.default);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [requested]);
  return Runtime ? (
    <LoadBoundary fallback={null}>
      <Runtime {...props} />
    </LoadBoundary>
  ) : null;
}
