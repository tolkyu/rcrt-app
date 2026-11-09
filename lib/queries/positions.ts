import { queryOptions } from '@tanstack/react-query';
import { ApiError, apiRequest } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export interface PositionsFilters {
  readonly status: 'active' | 'all';
  readonly verticalId?: string;
}

/** The manager page always loads `status: 'all'`; the vertical and inactive toggles filter that list on the client. The view removes it on unmount (SEC-POS-10); `gcTime: 0` would drop the hydrated list while a large page is still hydrating, before any observer subscribes. */
export const positionsQuery = (filters: PositionsFilters) =>
  queryOptions({
    queryKey: queryKeys.positions(filters),
    retry: (count, error) =>
      !(error instanceof ApiError && error.status < 500) && count < 2,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ status: filters.status });
      if (filters.verticalId) params.set('verticalId', filters.verticalId);
      return apiRequest(`/positions?${params}`, {
        schema: async () =>
          (await import('@/lib/schemas/position')).positionListSchema,
        signal,
        background: true,
      });
    },
  });

export const MANAGER_POSITIONS: PositionsFilters = { status: 'all' };
