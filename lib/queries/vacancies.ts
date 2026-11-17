import { queryOptions } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyListQuery } from '@/lib/schemas/vacancy';
import { vacancyApiFilters, vacancyPageSearch } from '@/lib/vacancy-filters';
import { retryServerErrors } from './vacancy-detail';

export const vacanciesQuery = (input: VacancyListQuery) => {
  const filters = vacancyApiFilters(input);
  return queryOptions({
    queryKey: queryKeys.vacancies(filters),
    retry: retryServerErrors,
    queryFn: ({ signal }) =>
      apiRequest(`/vacancies?${vacancyPageSearch(filters)}`, {
        schema: async () =>
          (await import('@/lib/schemas/vacancy')).vacancyPageSchema,
        signal,
        background: true,
      }),
  });
};
