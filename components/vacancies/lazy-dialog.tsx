'use client';

import { useTranslations } from 'next-intl';
import { lazy, Suspense, useState, type ReactNode } from 'react';
import { LoadBoundary } from '@/components/ui/load-boundary';
import { toast } from '@/lib/toast';

/** One chunk for the panel and the list rows. */
export const LazyClaimDialog = lazy(() => import('./claim-vacancy-dialog'));

/**
 * Mounts a lazily loaded dialog only while it is open. A chunk that cannot load (offline, deploy skew) closes the
 * request with a toast, so the card stays usable and the next press tries again with a fresh boundary.
 */
export function LazyDialog({
  open,
  onFailed,
  children,
}: {
  open: boolean;
  onFailed: () => void;
  children: ReactNode;
}) {
  const t = useTranslations('vacancies.team');
  const [attempt, setAttempt] = useState(0);
  if (!open) return null;
  return (
    <LoadBoundary
      key={attempt}
      fallback={null}
      onError={() => {
        toast.error(t('loadFailed'), { id: 'team:chunk' });
        setAttempt((current) => current + 1);
        onFailed();
      }}
    >
      <Suspense fallback={null}>{children}</Suspense>
    </LoadBoundary>
  );
}
