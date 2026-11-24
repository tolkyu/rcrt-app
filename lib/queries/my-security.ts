import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import { retryServerErrors } from '@/lib/queries/vacancy-detail';
import { LOGIN_HISTORY_PAGE, queryKeys } from '@/lib/query-keys';

/** Profile-only reads, kept out of `me.ts` because the app shell loads that on every route (PERF-04). */
export const mySessionsQuery = () =>
  queryOptions({
    queryKey: queryKeys.mySessions(),
    retry: retryServerErrors,
    queryFn: ({ signal }) =>
      apiRequest('/auth/sessions', {
        schema: async () =>
          (await import('@/lib/schemas/auth')).sessionListSchema,
        signal,
        background: true,
      }),
  });

export const myMfaQuery = () =>
  queryOptions({
    queryKey: queryKeys.myMfa(),
    retry: retryServerErrors,
    queryFn: ({ signal }) =>
      apiRequest('/auth/mfa', {
        schema: async () =>
          (await import('@/lib/schemas/auth')).mfaStatusResponseSchema,
        signal,
        background: true,
      }),
  });

export const myLoginHistoryQuery = () =>
  infiniteQueryOptions({
    queryKey: queryKeys.myLoginHistory(),
    retry: retryServerErrors,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: String(LOGIN_HISTORY_PAGE) });
      if (pageParam) params.set('cursor', pageParam);
      return apiRequest(`/auth/login-history?${params}`, {
        schema: async () =>
          (await import('@/lib/schemas/auth')).loginHistorySchema,
        signal,
        background: pageParam === null,
      });
    },
    getNextPageParam: (page) => page.nextCursor,
  });
