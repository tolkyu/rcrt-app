/** The optimistic side of one reversible field change (urgency, pause/resume): the card and the cached list rows flip at once, and a failure undoes only this change. */
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyDetail, VacancyPage } from '@/lib/schemas/vacancy';
import { isPage } from '@/lib/denial-log';
import { isVacancyDetailKey } from '@/lib/vacancy-draft-optimistic';

type Item = VacancyDetail | VacancyPage['items'][number];
type Side = 'from' | 'to';

export interface Flip {
  /** Whether the item still shows this side's value. */
  readonly shows: (item: Item, side: Side) => boolean;
  /** The item as it looks with this side's value. */
  readonly put: <T extends Item>(item: T, side: Side) => T;
}

export interface OptimisticFlip {
  /** Puts back only the rows and the card this change flipped, and only while they still show its value. */
  readonly restore: () => void;
  /** Stops watching refetches; the server's answer is the truth from here on. */
  readonly settle: () => void;
}

const isDetail = (data: unknown): data is VacancyDetail =>
  typeof data === 'object' &&
  data !== null &&
  'version' in data &&
  'status' in data;

const withSide = (
  data: VacancyPage,
  id: string,
  flip: Flip,
  from: Side,
  to: Side,
): VacancyPage | null =>
  data.items.some((row) => row.id === id && flip.shows(row, from))
    ? {
        ...data,
        items: data.items.map((row) =>
          row.id === id && flip.shows(row, from) ? flip.put(row, to) : row,
        ),
      }
    : null;

/** While the call is in flight a refetch can bring the old value back (the server has not committed yet); rows and card are flipped again until `settle`. */
export function applyOptimisticFlip(
  queryClient: QueryClient,
  id: string,
  flip: Flip,
): OptimisticFlip {
  const detailKey = queryKeys.vacancy(id);
  const touched = new Map<string, QueryKey>();
  let flippedCard = false;

  const flipRows = (key: QueryKey, data: VacancyPage) => {
    const next = withSide(data, id, flip, 'from', 'to');
    if (!next) return;
    touched.set(JSON.stringify(key), key);
    queryClient.setQueryData<VacancyPage>(key, next);
  };
  const flipCard = (detail: VacancyDetail) => {
    if (!flip.shows(detail, 'from')) return;
    flippedCard = true;
    queryClient.setQueryData<VacancyDetail>(detailKey, flip.put(detail, 'to'));
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
      if (isVacancyDetailKey(key, id) && isDetail(state.data))
        flipCard(state.data);
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
        const next = withSide(data, id, flip, 'to', 'from');
        if (next) queryClient.setQueryData<VacancyPage>(key, next);
      }
      const current = queryClient.getQueryData<VacancyDetail>(detailKey);
      if (flippedCard && current && flip.shows(current, 'to'))
        queryClient.setQueryData<VacancyDetail>(
          detailKey,
          flip.put(current, 'from'),
        );
    },
  };
}
