import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { safeNextPath } from '@/server/auth/safe-redirect';
import { hasAnyGrant } from '@/server/authz/can';
import { requireSession } from '../_lib/session';

/** Above every loading boundary, so a role without vacancy access gets a real HTTP 404 (VIS-02); a read withheld until aal2 goes to the 2FA step-up instead (D63). */
export default async function VacanciesLayout({
  children,
}: {
  children: ReactNode;
}) {
  const ctx = await requireSession();
  if (!hasAnyGrant(ctx.auth, 'vacancy.read')) {
    if (!ctx.auth.mfaWithheld.has('vacancy.read')) notFound();
    const next = safeNextPath((await headers()).get('x-pathname'), '');
    redirect(
      next ? `/mfa/verify?next=${encodeURIComponent(next)}` : '/mfa/verify',
    );
  }
  return children;
}
