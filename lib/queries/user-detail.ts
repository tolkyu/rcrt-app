import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { ApiError, apiRequest } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

/** Imported only by the lazy user drawer, so these queries and their schemas stay out of the list bundle. */
const noRetryOnClientError = (count: number, error: Error) =>
  !(error instanceof ApiError && error.status < 500) && count < 2;

export const userDetailQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.settingsUser(id),
    retry: noRetryOnClientError,
    queryFn: ({ signal }) =>
      apiRequest(`/users/${id}`, {
        schema: async () =>
          (await import('@/lib/schemas/user')).userDetailSchema,
        signal,
      }),
  });

export const userEventsQuery = (id: string) =>
  infiniteQueryOptions({
    queryKey: queryKeys.settingsUserEvents(id),
    initialPageParam: null as string | null,
    retry: noRetryOnClientError,
    queryFn: ({ pageParam, signal }) =>
      apiRequest(
        `/users/${id}/events${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`,
        {
          schema: async () =>
            (await import('@/lib/schemas/user')).userEventPageSchema,
          signal,
        },
      ),
    getNextPageParam: (page) => page.nextCursor,
  });
