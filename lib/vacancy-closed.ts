import type { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api-client';

const closedIds = new WeakMap<QueryClient, Set<string>>();

export const isVacancyClosed = (client: QueryClient, id: string) =>
  closedIds.get(client)?.has(id.toLowerCase()) ?? false;

/** After the user's own delete the id's 404 is the expected answer, not lost access; installed from the close chunk to keep the eager denial core unchanged (PERF-04). A session 401 still reaches the denial handler. */
export function markVacancyClosed(client: QueryClient, id: string) {
  let ids = closedIds.get(client);
  if (!ids) {
    const closed = new Set<string>();
    ids = closed;
    closedIds.set(client, closed);
    const { config } = client.getQueryCache();
    const handleDenial = config.onError;
    config.onError = (error, query) => {
      const [root, key] = query.queryKey;
      if (
        root === 'vacancy' &&
        typeof key === 'string' &&
        closed.has(key) &&
        error instanceof ApiError &&
        error.status === 404
      )
        return;
      handleDenial?.(error, query);
    };
  }
  ids.add(id.toLowerCase());
}
