import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { notFound, unstable_rethrow } from 'next/navigation';
import type { ReactNode } from 'react';
import { queryKeys } from '@/lib/query-keys';
import { describeError, logger } from '@/server/observability/logger';
import { getQueryClient } from '@/server/query/query-client';
import { loadVacancyContent } from '../../_lib/vacancy-content';
import { loadVacancy } from '../../_lib/vacancy';

/** Seeds the card's cache with metadata and content, loaded together; a content 404 is a real 404, any other failure is logged and left to the client's section retry (ADR-020). */
export default async function VacancyCardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ vacancyId: string }>;
}) {
  const { vacancyId } = await params;
  const [vacancy, content] = await Promise.all([
    loadVacancy(vacancyId),
    loadVacancyContent(vacancyId).catch((error: unknown) => {
      unstable_rethrow(error);
      logger.error(
        { err: describeError(error) },
        'vacancy card content read failed',
      );
      return undefined;
    }),
  ]);
  if (!vacancy) return children;
  if (content === null) notFound();
  const queryClient = getQueryClient();
  queryClient.setQueryData(queryKeys.vacancy(vacancy.id), vacancy);
  if (content)
    queryClient.setQueryData(queryKeys.vacancyContent(vacancy.id), content);
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
