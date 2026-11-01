import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import { LOGIN_HISTORY_PAGE, queryKeys } from '@/lib/query-keys';

/** Client side of the shared queries: the RSC prefetch fills the same keys from the services (ADR-007). */
export const meQuery = () =>
  queryOptions({
    queryKey: queryKeys.me(),
    queryFn: ({ signal }) =>
      apiRequest('/me', {
        schema: async () => (await import('@/lib/schemas/me')).meSchema,
        signal,
      }),
  });

export const mySessionsQuery = () =>
  queryOptions({
    queryKey: queryKeys.mySessions(),
    queryFn: ({ signal }) =>
      apiRequest('/auth/sessions', {
        schema: async () =>
          (await import('@/lib/schemas/auth')).sessionListSchema,
        signal,
      }),
  });

export const myMfaQuery = () =>
  queryOptions({
    queryKey: queryKeys.myMfa(),
    queryFn: ({ signal }) =>
      apiRequest('/auth/mfa', {
        schema: async () =>
          (await import('@/lib/schemas/auth')).mfaStatusResponseSchema,
        signal,
      }),
  });

export const myLoginHistoryQuery = () =>
  infiniteQueryOptions({
    queryKey: queryKeys.myLoginHistory(),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: String(LOGIN_HISTORY_PAGE) });
      if (pageParam) params.set('cursor', pageParam);
      return apiRequest(`/auth/login-history?${params}`, {
        schema: async () =>
          (await import('@/lib/schemas/auth')).loginHistorySchema,
        signal,
      });
    },
    getNextPageParam: (page) => page.nextCursor,
  });
