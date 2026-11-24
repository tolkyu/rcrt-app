'use client';

import { usePathname } from 'next/navigation';
import { lazy, Suspense } from 'react';

const LostClaimNotice = lazy(() => import('./lost-claim-notice'));
const CARD =
  /^\/vacancies\/([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})\/?$/i;

/** The 404 a card URL shows after the access-loss reload of a lost claim (D132); the reader loads only on a card URL, so other 404s stay free of it. */
export function LostClaimCardNotice() {
  const id = CARD.exec(usePathname())?.[1];
  if (!id) return null;
  return (
    <Suspense fallback={null}>
      <LostClaimNotice id={id} />
    </Suspense>
  );
}
