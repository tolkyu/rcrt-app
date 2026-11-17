'use client';

import { useTranslations } from 'next-intl';
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from 'react';
import type { ToasterProps } from 'sonner';
import {
  connectToasts,
  subscribeToToasts,
  toastRequested,
  type ToastNotification,
} from '@/lib/toast';
import { Button } from './button';
import { LoadBoundary } from './load-boundary';

type Runtime = ComponentType<ToasterProps>;

/** Without the runtime chunk the latest result still reaches the user: plain markup, latest notice only, no auto-dismiss or tone. */
function ToastFallback() {
  const t = useTranslations('common');
  const [notice, setNotice] = useState<ToastNotification | null>(null);
  useEffect(() => connectToasts(setNotice), []);
  const action = notice?.action;
  return (
    <div
      role="status"
      aria-label={t('notifications')}
      className="fixed right-3 bottom-3 left-3 md:right-6 md:bottom-6 md:left-auto md:w-96"
      style={{ zIndex: 'var(--z-toast)' }}
    >
      {notice && (
        <div className="bg-surface text-foreground border-border flex items-start gap-3 rounded-lg border p-3 shadow-lg">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="text-sm leading-5 font-semibold [overflow-wrap:anywhere]">
              {notice.title}
            </p>
            {notice.description && (
              <p className="text-muted-foreground text-sm leading-5 [overflow-wrap:anywhere]">
                {notice.description}
              </p>
            )}
            {action && (
              <Button
                variant="secondary"
                size="sm"
                className="mt-2 h-11 self-start md:h-8"
                onClick={() => {
                  setNotice(null);
                  action.onAction();
                }}
              >
                {action.label}
              </Button>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-11 md:h-8"
            onClick={() => setNotice(null)}
          >
            {t('close')}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Runtime chunk goes into state, not `React.lazy`: a toast raised with `router.refresh()` was lost in the transition (BUG-S3-14). */
export function Toaster(props: ToasterProps) {
  const requested = useSyncExternalStore(
    subscribeToToasts,
    toastRequested,
    () => false,
  );
  const [Runtime, setRuntime] = useState<Runtime | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!requested) return;
    let active = true;
    import('./sonner-runtime').then(
      (loaded) => {
        if (active) setRuntime(() => loaded.default);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [requested]);
  if (failed) return <ToastFallback />;
  return Runtime ? (
    <LoadBoundary fallback={null} onError={() => setFailed(true)}>
      <Runtime {...props} />
    </LoadBoundary>
  ) : null;
}
