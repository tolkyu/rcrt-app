/** The optimistic side of an urgency change: the card and the cached list rows flip at once, and a failure undoes only this change. Loaded with the urgency control (PERF-04). */
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyDetail, VacancyPage } from '@/lib/schemas/vacancy';
import { isPage } from '@/lib/vacancy-draft-optimistic';
import type { VACANCY_PRIORITIES } from '@/lib/vacancy-filters';

type Priority = (typeof VACANCY_PRIORITIES)[number];

export interface OptimisticUrgency {
  /** Puts back only the rows and the card this change flipped, and only while they still show its value. */
  readonly restore: () => void;
  /** Stops watching refetches; the server's answer is the truth from here on. */
  readonly settle: () => void;
}

const isDetail = (data: unknown): data is VacancyDetail =>
  typeof data === 'object' &&
  data !== null &&
  'priority' in data &&
  'version' in data;

const withPriority = (
  data: VacancyPage,
  id: string,
  from: Priority,
  to: Priority,
): VacancyPage | null =>
  data.items.some((row) => row.id === id && row.priority === from)
    ? {
        ...data,
        items: data.items.map((row) =>
          row.id === id && row.priority === from
            ? { ...row, priority: to }
            : row,
        ),
      }
    : null;

/** While the call is in flight a refetch can bring the old flag back (the server has not committed yet); rows and card are flipped again until `settle`. */
export function applyOptimisticUrgency(
  queryClient: QueryClient,
  id: string,
  from: Priority,
  to: Priority,
): OptimisticUrgency {
  const detailKey = queryKeys.vacancy(id);
  const touched = new Map<string, QueryKey>();
  let flippedCard = false;

  const flipRows = (key: QueryKey, data: VacancyPage) => {
    const next = withPriority(data, id, from, to);
    if (!next) return;
    touched.set(JSON.stringify(key), key);
    queryClient.setQueryData<VacancyPage>(key, next);
  };
  const flipCard = (detail: VacancyDetail) => {
    if (detail.priority !== from) return;
    flippedCard = true;
    queryClient.setQueryData<VacancyDetail>(detailKey, {
      ...detail,
      priority: to,
    });
  };

  for (const [key, data] of queryClient.getQueriesData({
    queryKey: queryKeys.vacanciesAll(),
  }))
    if (isPage(data)) flipRows(key, data);
  const card = queryClient.getQueryData<VacancyDetail>(detailKey);
  if (card) flipCard(card);

  // Our own writes are `manual`; only a read from the server is re-flipped.
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (
      event.type !== 'updated' ||
      event.action.type !== 'success' ||
      event.action.manual
    )
      return;
    const { queryKey: key, state } = event.query;
    if (key[0] === 'vacancy') {
      if (key[1] === detailKey[1] && isDetail(state.data)) flipCard(state.data);
    } else if (key[0] === 'vacancies' && isPage(state.data))
      flipRows(key, state.data);
  });

  return {
    settle: unsubscribe,
    restore: () => {
      unsubscribe();
      for (const key of touched.values()) {
        const data = queryClient.getQueryData(key);
        if (!isPage(data)) continue;
        const next = withPriority(data, id, to, from);
        if (next) queryClient.setQueryData<VacancyPage>(key, next);
      }
      const current = queryClient.getQueryData<VacancyDetail>(detailKey);
      if (flippedCard && current?.priority === to)
        queryClient.setQueryData<VacancyDetail>(detailKey, {
          ...current,
          priority: from,
        });
    },
  };
}
