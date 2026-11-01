import { queryOptions } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export const settingsVerticalsQuery = () =>
  queryOptions({
    queryKey: queryKeys.settingsVerticals(),
    queryFn: ({ signal }) =>
      apiRequest('/settings/verticals', {
        schema: async () =>
          (await import('@/lib/schemas/vertical')).settingsVerticalListSchema,
        signal,
        background: true,
      }),
  });
