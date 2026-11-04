import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { ApiError, apiRequest } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type {
  AuditDirection,
  AuditPage,
  AuditQuery,
} from '@/lib/schemas/audit';

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

export type AuditFilterValues = Readonly<
  Omit<AuditQuery, 'cursor' | 'direction' | 'limit'>
>;

/** `null` = newest page; otherwise one side of a row's keyset cursor (STORY-AUD-4). */
export type AuditPageParam = {
  readonly cursor: string;
  readonly direction: AuditDirection;
} | null;

export const nextAuditPageParam = (page: AuditPage): AuditPageParam =>
  page.nextCursor ? { cursor: page.nextCursor, direction: 'older' } : null;

export const previousAuditPageParam = (page: AuditPage): AuditPageParam =>
  page.prevCursor ? { cursor: page.prevCursor, direction: 'newer' } : null;

/** A window that is not just the newest page must restart there when its filters are chosen again. */
export const auditWindowMoved = (data: {
  readonly pageParams: readonly unknown[];
}): boolean => data.pageParams.length > 1 || data.pageParams[0] != null;

export function auditPageSearch(
  filters: AuditFilterValues,
  pageParam: AuditPageParam,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (value) params.set(key, value);
  if (pageParam) {
    params.set('cursor', pageParam.cursor);
    if (pageParam.direction === 'newer') params.set('direction', 'newer');
  }
  return params;
}

/** Expects canonical filters from `auditApiFilters`; the RSC prefetch takes its key from here too, so SSR and client keys match. */
export const auditQuery = (filters: AuditFilterValues) =>
  infiniteQueryOptions({
    queryKey: queryKeys.settingsAudit(filters),
    initialPageParam: null as AuditPageParam,
    maxPages: 2,
    queryFn: ({ pageParam, signal }) =>
      apiRequest(`/audit?${auditPageSearch(filters, pageParam)}`, {
        schema: async () =>
          (await import('@/lib/schemas/audit')).auditPageSchema,
        signal,
        background: pageParam === null,
      }),
    getNextPageParam: nextAuditPageParam,
    getPreviousPageParam: previousAuditPageParam,
  });

export const usersQuery = (
  filters: Readonly<Record<string, string | string[] | undefined>>,
) =>
  infiniteQueryOptions({
    queryKey: queryKeys.settingsUsers(filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters))
        for (const entry of Array.isArray(value) ? value : value ? [value] : [])
          params.append(key, entry);
      if (pageParam) params.set('cursor', pageParam);
      return apiRequest(`/users?${params}`, {
        schema: async () => (await import('@/lib/schemas/user')).userPageSchema,
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
