import { queryOptions } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { retryServerErrors } from './vacancy-detail';

export const vacancyContentQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.vacancyContent(id),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: retryServerErrors,
    queryFn: ({ signal }) =>
      apiRequest(`/vacancies/${encodeURIComponent(id.toLowerCase())}/content`, {
        schema: async () =>
          (await import('@/lib/schemas/vacancy-content'))
            .vacancyContentReadSchema,
        signal,
        background: true,
      }),
  });
