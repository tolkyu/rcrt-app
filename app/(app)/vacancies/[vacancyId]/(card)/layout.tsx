import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { queryKeys } from '@/lib/query-keys';
import { getQueryClient } from '@/server/query/query-client';
import { loadVacancy } from '../../_lib/vacancy';

/** Seeds the card's query cache from the scoped read the parent layout already made (a cache hit); only the card receives the vacancy, never `/edit`. */
export default async function VacancyCardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ vacancyId: string }>;
}) {
  const vacancy = await loadVacancy((await params).vacancyId);
  if (!vacancy) return children;
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
