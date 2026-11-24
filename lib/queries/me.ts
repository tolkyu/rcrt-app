import { queryOptions } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

/** Client side of the shared queries: the RSC prefetch fills the same keys from the services (ADR-007). */
export const meQuery = () =>
  queryOptions({
    queryKey: queryKeys.me(),
    queryFn: ({ signal }) =>
      apiRequest('/me', {
        schema: async () => (await import('@/lib/schemas/me')).meSchema,
        signal,
        background: true,
      }),
  });
