'use client';

import { lazy, Suspense } from 'react';
import { LoadBoundary } from '@/components/ui/load-boundary';
import type { VacancySummary } from '@/lib/schemas/vacancy';
import { ownDraftActions } from '@/lib/vacancy-draft-actions';

/** Same box as the `⋯` button (32 px, 44 px on touch), so the row does not move when the menu code arrives. */
export const MenuPlaceholder = () => (
  <span
    aria-hidden="true"
    className="inline-block size-8 shrink-0 pointer-coarse:size-11"
  />
);
const DraftMenu = lazy(() => import('./draft-menu'));

/** Only own private drafts load the menu; a failed chunk leaves the title link available. */
export function DraftRowMenu({
  vacancy,
  canAuthorDrafts,
}: {
  vacancy: VacancySummary;
  canAuthorDrafts: boolean;
}) {
  const plan = ownDraftActions(vacancy, canAuthorDrafts);
  if (!plan) return null;
  return (
    <LoadBoundary fallback={null}>
      <Suspense fallback={<MenuPlaceholder />}>
        <DraftMenu vacancy={vacancy} plan={plan} />
      </Suspense>
    </LoadBoundary>
  );
}
