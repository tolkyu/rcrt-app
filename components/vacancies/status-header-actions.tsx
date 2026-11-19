'use client';

import { lazy, Suspense, useState } from 'react';
import { LoadBoundary } from '@/components/ui/load-boundary';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import { MenuPlaceholder } from './draft-row-menu';

const StatusActions = lazy(() => import('./status-actions'));

/** The final blocks with the real layout classes, so the header keeps its height while the code arrives. */
const Placeholder = ({ preview }: { preview: boolean }) => (
  <div className="flex basis-full gap-2 max-md:justify-end md:contents">
    {!preview && (
      <span
        aria-hidden="true"
        className="h-11 max-md:min-w-0 max-md:flex-1 md:w-32"
      />
    )}
    <MenuPlaceholder />
  </div>
);

/**
 * Header actions of a published vacancy. The chunk loads only for a viewer who has a status action or a step-up to one (D63), and stays mounted
 * afterwards: a cancelled vacancy has none, yet its dialog must outlive the button that opened it. Without the chunk the
 * card stays readable; the next load tries again.
 */
export function StatusHeaderActions({
  vacancy,
  preview,
}: {
  vacancy: VacancyDetail;
  preview: boolean;
}) {
  const [actionable, setActionable] = useState(false);
  if (!actionable && (vacancy.statusActions.length > 0 || vacancy.needsMfa))
    setActionable(true);
  if (!actionable) return null;
  return (
    <LoadBoundary fallback={null}>
      <Suspense fallback={<Placeholder preview={preview} />}>
        <StatusActions vacancy={vacancy} preview={preview} />
      </Suspense>
    </LoadBoundary>
  );
}
