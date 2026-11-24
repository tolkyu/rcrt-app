import type { QueryClient } from '@tanstack/react-query';
import {
  retrySessionLoss,
  vacancyDetailQuery,
} from '@/lib/queries/vacancy-detail';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyDetail } from '@/lib/schemas/vacancy';

/** Every list and the card read again after a write (rows move between chips, teams and counts change). */
export const refreshVacancy = (queryClient: QueryClient, id: string) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.vacanciesAll() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.vacancy(id) }),
  ]).then(
    () => undefined,
    () => undefined,
  );

/** The server's current card, bypassing the cache; null when it cannot be read (the caller still has the failure to show). */
export async function readCurrentVacancy(
  queryClient: QueryClient,
  id: string,
): Promise<VacancyDetail | null> {
  try {
    return await queryClient.fetchQuery({
      ...vacancyDetailQuery(id),
      staleTime: 0,
      retry: retrySessionLoss,
    });
  } catch {
    return null;
  }
}
