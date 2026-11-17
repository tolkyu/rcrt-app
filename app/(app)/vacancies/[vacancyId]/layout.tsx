import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { loadVacancy } from '../_lib/vacancy';

/** The 404 is decided above this segment's loading boundaries, so a missing or forbidden vacancy is an actual HTTP 404. The card's data is hydrated by `(card)/layout.tsx`, so no other child (the edit page) ever carries it. */
export default async function VacancyLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ vacancyId: string }>;
}) {
  if (!(await loadVacancy((await params).vacancyId))) notFound();
  return children;
}
