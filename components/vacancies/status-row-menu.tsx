'use client';

import { lazy, Suspense, useState } from 'react';
import { LoadBoundary } from '@/components/ui/load-boundary';
import type { VacancySummary } from '@/lib/schemas/vacancy';
import type { VacancyStatusAction } from '@/server/domain/vacancy-status/transitions';
import { MenuPlaceholder } from './draft-row-menu';

const StatusRowActions = lazy(() => import('./status-row-actions'));

/**
 * Status items of a list row. The chunk loads only for a row the viewer can act on, and stays mounted afterwards: a cancelled
 * row has no items, yet its dialog must outlive the item that opened it. A failed chunk leaves the title link available.
 */
export function StatusRowMenu({
  vacancy,
  actions,
}: {
  vacancy: VacancySummary;
  actions: readonly VacancyStatusAction[];
}) {
  const [live, setLive] = useState(false);
  if (!live && actions.length > 0) setLive(true);
  if (!live) return null;
  return (
    <LoadBoundary fallback={null}>
      <Suspense fallback={actions.length > 0 ? <MenuPlaceholder /> : null}>
        <StatusRowActions vacancy={vacancy} actions={actions} />
      </Suspense>
    </LoadBoundary>
  );
}
