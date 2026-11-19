import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { hasAnyGrant } from '@/server/authz/can';
import { requireSession } from '../_lib/session';

/** Above every loading boundary, so a role without vacancy access gets a real HTTP 404 (VIS-02). */
export default async function VacanciesLayout({
  children,
}: {
  children: ReactNode;
}) {
  const ctx = await requireSession();
  if (!hasAnyGrant(ctx.auth, 'vacancy.read')) notFound();
  return children;
}
