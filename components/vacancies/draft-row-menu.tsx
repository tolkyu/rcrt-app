'use client';

import { lazy, Suspense } from 'react';
import { LoadBoundary } from '@/components/ui/load-boundary';
import type { VacancySummary } from '@/lib/schemas/vacancy';
import { ownDraftActions } from '@/lib/vacancy-draft-actions';

/** Same box as the `⋯` button (32 px, 44 px on touch), so the row does not move when the menu code arrives. */
const MenuPlaceholder = () => (
  <span
    aria-hidden="true"
    className="inline-block size-8 shrink-0 pointer-coarse:size-11"
  />
);
const DraftMenu = lazy(() => import('./draft-menu'));

/** `⋯` of an own draft row (spec §6.1): «Редагувати» and «Опублікувати»; cancel and delete arrive with S3.5. The gate is synchronous, so rows that are not own drafts load nothing; if the chunk cannot load the row simply has no menu (its title still opens the card). */
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
