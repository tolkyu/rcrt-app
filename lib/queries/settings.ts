import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { ApiError, apiRequest } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { AuditQuery } from '@/lib/schemas/audit';

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

export type AuditFilterValues = Readonly<Omit<AuditQuery, 'cursor' | 'limit'>>;

export const auditQuery = (filters: AuditFilterValues) =>
  infiniteQueryOptions({
    queryKey: queryKeys.settingsAudit(filters),
    initialPageParam: null as string | null,
    maxPages: 2,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters))
        if (value) params.set(key, value);
      if (pageParam) params.set('cursor', pageParam);
      return apiRequest(`/audit?${params}`, {
        schema: async () =>
          (await import('@/lib/schemas/audit')).auditPageSchema,
        signal,
        background: pageParam === null,
      });
    },
    getNextPageParam: (page) => page.nextCursor,
  });

export const auditRecordQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.settingsAuditRecord(id),
    retry: (count, error) =>
      !(error instanceof ApiError && error.status < 500) && count < 2,
    queryFn: ({ signal }) =>
      apiRequest(`/audit/${id}`, {
        schema: async () =>
          (await import('@/lib/schemas/audit')).auditRecordSchema,
        signal,
      }),
  });
