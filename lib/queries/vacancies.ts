import { queryOptions } from '@tanstack/react-query';
import { ApiError, apiRequest } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyListQuery } from '@/lib/schemas/vacancy';
import { vacancyApiFilters, vacancyPageSearch } from '@/lib/vacancy-filters';

const retry = (count: number, error: Error) =>
  !(error instanceof ApiError && error.status < 500) && count < 2;

export const vacanciesQuery = (input: VacancyListQuery) => {
  const filters = vacancyApiFilters(input);
  return queryOptions({
    queryKey: queryKeys.vacancies(filters),
    retry,
    queryFn: ({ signal }) =>
      apiRequest(`/vacancies?${vacancyPageSearch(filters)}`, {
        schema: async () =>
          (await import('@/lib/schemas/vacancy')).vacancyPageSchema,
        signal,
        background: true,
      }),
  });
};

export const vacancyDetailQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.vacancy(id),
    retry,
    queryFn: ({ signal }) =>
      apiRequest(`/vacancies/${encodeURIComponent(id)}`, {
        schema: async () =>
          (await import('@/lib/schemas/vacancy')).vacancyDetailSchema,
        signal,
        background: true,
      }),
  });
