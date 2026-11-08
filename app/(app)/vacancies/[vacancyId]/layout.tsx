import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { queryKeys } from '@/lib/query-keys';
import { getQueryClient } from '@/server/query/query-client';
import { loadVacancy } from '../_lib/vacancy';

/** The 404 is decided above this segment's loading boundary, so a missing or forbidden vacancy is an actual HTTP 404. */
export default async function VacancyLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ vacancyId: string }>;
}) {
  const vacancy = await loadVacancy((await params).vacancyId);
  if (!vacancy) notFound();
  const queryClient = getQueryClient();
  queryClient.setQueryData(queryKeys.vacancy(vacancy.id), vacancy);
  return (
    <HydrationBoundary
      state={dehydrate(queryClient, {
        shouldDehydrateQuery: (query) =>
          query.queryKey[0] === 'vacancy' && query.state.status === 'success',
      })}
    >
      {children}
    </HydrationBoundary>
  );
}
