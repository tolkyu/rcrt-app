import { queryOptions } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

/** Role-visible verticals; the app layout seeds this key from the same service that feeds the shell switcher. */
export const verticalsQuery = () =>
  queryOptions({
    queryKey: queryKeys.verticals(),
    queryFn: ({ signal }) =>
      apiRequest('/verticals', {
        schema: async () =>
          (await import('@/lib/schemas/vertical')).verticalListSchema,
        signal,
        background: true,
      }),
  });
