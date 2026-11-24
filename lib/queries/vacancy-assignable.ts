import { queryOptions } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import { retryServerErrors } from '@/lib/queries/vacancy-detail';
import { queryKeys } from '@/lib/query-keys';

/** Who is eligible is decided under lock at write time; the list is read fresh on every open (`gcTime: 0`), so a closed dialog never leaves a stale picker behind. */
export const assignableRecruitersQuery = (vacancyId: string) =>
  queryOptions({
    queryKey: queryKeys.vacancyAssignableRecruiters(vacancyId),
    gcTime: 0,
    retry: retryServerErrors,
    queryFn: ({ signal }) =>
      apiRequest(
        `/vacancies/${encodeURIComponent(vacancyId)}/assignable-recruiters`,
        {
          schema: async () =>
            (await import('@/lib/schemas/vacancy-assignment'))
              .assignableRecruitersSchema,
          signal,
          background: true,
        },
      ),
  });
