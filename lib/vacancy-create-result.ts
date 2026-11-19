import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyDetail } from '@/lib/schemas/vacancy';

/** One key per attempt: a retry of the same body reuses it (the server replays the first result), any change gets a new one. */
export function createAttemptKeys(
  newKey: () => string = () => crypto.randomUUID(),
) {
  let current: { signature: string; key: string } | null = null;
  return {
    keyFor(body: unknown): string {
      const signature = JSON.stringify(body);
      if (current?.signature !== signature)
        current = { signature, key: newKey() };
      return current.key;
    },
    reset() {
      current = null;
    },
  };
}

/** Seeds the card cache and refreshes every vacancy list (which includes the «Чернетки» count) and the position counters. */
export function applyCreatedVacancy(
  queryClient: QueryClient,
  created: VacancyDetail,
) {
  queryClient.setQueryData(queryKeys.vacancy(created.id), created);
  queryClient
    .invalidateQueries({ queryKey: queryKeys.vacanciesAll() })
    .catch(() => undefined);
  queryClient
    .invalidateQueries({ queryKey: queryKeys.positionsAll() })
    .catch(() => undefined);
}
