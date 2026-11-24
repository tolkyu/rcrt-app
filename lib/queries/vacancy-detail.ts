import { queryOptions } from '@tanstack/react-query';
import { ApiError, apiRequest, isSessionLoss } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

/** Parallel requests can race one token refresh, so a session 401 counts only after one retry that carries the new cookie. */
export const retrySessionLoss = (count: number, error: Error) =>
  isSessionLoss(error) && count < 1;

/** Kept out of `vacancies.ts` so the create form and the card do not pull the list filters (PERF-04). */
export const retryServerErrors = (count: number, error: Error) =>
  retrySessionLoss(count, error) ||
  (!(error instanceof ApiError && error.status < 500) && count < 2);

export const vacancyDetailQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.vacancy(id),
    retry: retryServerErrors,
    queryFn: ({ signal }) =>
      apiRequest(`/vacancies/${encodeURIComponent(id)}`, {
        schema: async () =>
          (await import('@/lib/schemas/vacancy')).vacancyDetailSchema,
        signal,
        background: true,
      }),
  });

export const vacancyDraftCountQuery = () =>
  queryOptions({
    queryKey: queryKeys.vacancyDraftCount(),
    retry: retryServerErrors,
    queryFn: ({ signal }) =>
      apiRequest('/vacancies/drafts/count', {
        schema: async () =>
          (await import('@/lib/schemas/vacancy')).vacancyDraftCountSchema,
        signal,
        background: true,
      }),
  });
