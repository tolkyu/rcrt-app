/** The optimistic side of publishing a draft: the row, the «Чернетки» count and the card change at once, and every part can be undone on its own. Loaded with the publish module (PERF-04). */
import {
  hashKey,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import type {
  VacancyDetail,
  VacancyDraftCount,
  VacancyPage,
  VacancySummary,
} from '@/lib/schemas/vacancy';
import { isPage } from '@/lib/denial-log';
import {
  watchVacancyAccess,
  type VacancyAccessWatch,
} from '@/lib/vacancy-detail-cache';

interface RemovedRow {
  readonly key: QueryKey;
  readonly item: VacancySummary;
}

/** The order a list had before the first of the overlapping publishes touched it: the one reference every restore places its row by. */
interface SharedOrder {
  readonly order: readonly string[];
  users: number;
}
const orders = new WeakMap<QueryClient, Map<string, SharedOrder>>();

export interface OptimisticPublish {
  /** Undoes only what this publish changed, so overlapping publishes cannot restore each other's rows or count. */
  readonly restore: () => void;
  /** Stops watching refetches; the server's answer is the truth from here on. */
  readonly settle: () => void;
}

/** Content and picker entries share the `['vacancy', id]` prefix, and a content DTO also carries `status` and `version`. */
export const isVacancyDetailKey = (key: QueryKey, id: string) =>
  hashKey(key) === hashKey(queryKeys.vacancy(id));
const isDetail = (data: unknown): data is VacancyDetail =>
  typeof data === 'object' && data !== null && 'status' in data;
export const isCount = (data: unknown): data is VacancyDraftCount =>
  typeof data === 'object' &&
  data !== null &&
  'count' in data &&
  typeof data.count === 'number';

/** After the nearest earlier row of the original order that is on the page, else before the nearest later one; other publishes may have removed or restored the neighbours meanwhile. */
function insertionIndex(
  items: readonly VacancySummary[],
  order: readonly string[],
  id: string,
): number {
  const at = order.indexOf(id);
  for (let i = at - 1; i >= 0; i -= 1) {
    const found = items.findIndex((item) => item.id === order[i]);
    if (found >= 0) return found + 1;
  }
  for (let i = at + 1; i < order.length; i += 1) {
    const found = items.findIndex((item) => item.id === order[i]);
    if (found >= 0) return found;
  }
  return 0;
}

/** While the publish is in flight a refetch brings the draft back (the server still holds it); the row, count and card are taken out again. */
export function applyOptimisticPublish(
  queryClient: QueryClient,
  id: string,
  stillAllowed: VacancyAccessWatch = watchVacancyAccess(queryClient, id),
): OptimisticPublish {
  const countKey = queryKeys.vacancyDraftCount();
  const detailKey = queryKeys.vacancy(id);
  const removed = new Map<string, RemovedRow>();
  const shared = orders.get(queryClient) ?? new Map<string, SharedOrder>();
  orders.set(queryClient, shared);
  let released = false;
  let decremented = false;
  /** What our own count write left in the cache: a fresh server count above it still holds this draft, one at or below it already excludes it. */
  let written: number | undefined;
  let flipped = false;

  const removeFromList = (key: QueryKey, data: VacancyPage) => {
    const item = data.items.find((row) => row.id === id);
    // A list that shows the draft as published (a refetch after the server committed) is the truth, not a row to take out.
    if (!item || item.status !== 'DRAFT') return;
    const hash = hashKey(key);
    if (!removed.has(hash)) {
      removed.set(hash, { key, item });
      const entry = shared.get(hash) ?? {
        order: data.items.map((row) => row.id),
        users: 0,
      };
      entry.users += 1;
      shared.set(hash, entry);
    }
    queryClient.setQueryData<VacancyPage>(key, {
      ...data,
      items: data.items.filter((row) => row.id !== id),
    });
  };
  const decrement = (count: VacancyDraftCount) => {
    // A fresh server count replaces our earlier write, so one give-back is owed at most; a count of zero cannot go lower, so none is.
    decremented =
      count.count > 0 && (written === undefined || count.count > written);
    if (!decremented) return;
    written = count.count - 1;
    queryClient.setQueryData<VacancyDraftCount>(countKey, { count: written });
  };
  const open = (detail: VacancyDetail) => {
    if (detail.status !== 'DRAFT') return;
    flipped = true;
    queryClient.setQueryData<VacancyDetail>(detailKey, {
      ...detail,
      status: 'OPEN',
    });
  };

  for (const [key, data] of queryClient.getQueriesData({
    queryKey: queryKeys.vacanciesAll(),
  }))
    if (isPage(data)) removeFromList(key, data);
  const count = queryClient.getQueryData<VacancyDraftCount>(countKey);
  if (count) decrement(count);
  const detail = queryClient.getQueryData<VacancyDetail>(detailKey);
  if (detail) open(detail);

  // Only reads from the server count (a write of our own is `manual`).
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (
      event.type !== 'updated' ||
      event.action.type !== 'success' ||
      event.action.manual
    )
      return;
    const { queryKey: key, state } = event.query;
    if (key[0] === 'vacancy') {
      if (isVacancyDetailKey(key, id) && isDetail(state.data)) open(state.data);
    } else if (key[0] === 'vacancies') {
      if (key[1] === countKey[1]) {
        if (isCount(state.data)) decrement(state.data);
      } else if (isPage(state.data)) removeFromList(key, state.data);
    }
  });

  const settle = () => {
    unsubscribe();
    if (released) return;
    released = true;
    for (const hash of removed.keys()) {
      const entry = shared.get(hash);
      if (entry && (entry.users -= 1) <= 0) shared.delete(hash);
    }
  };

  return {
    settle,
    restore: () => {
      unsubscribe();
      // A row or card the viewer lost access to during the call must not come back.
      const allowed = stillAllowed();
      for (const [hash, row] of removed) {
        const data = queryClient.getQueryData(row.key);
        if (
          !allowed ||
          !isPage(data) ||
          data.items.some((item) => item.id === id)
        )
          continue;
        const items = [...data.items];
        items.splice(
          insertionIndex(items, shared.get(hash)?.order ?? [], id),
          0,
          row.item,
        );
        queryClient.setQueryData<VacancyPage>(row.key, { ...data, items });
      }
      const current = queryClient.getQueryData<VacancyDraftCount>(countKey);
      if (decremented && current)
        queryClient.setQueryData<VacancyDraftCount>(countKey, {
          count: current.count + 1,
        });
      const card = queryClient.getQueryData<VacancyDetail>(detailKey);
      if (allowed && flipped && card?.status === 'OPEN')
        queryClient.setQueryData<VacancyDetail>(detailKey, {
          ...card,
          status: 'DRAFT',
        });
      settle();
    },
  };
}
