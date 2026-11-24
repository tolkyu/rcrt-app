import {
  QueryCache,
  QueryClient,
  defaultShouldDehydrateQuery,
} from '@tanstack/react-query';
import {
  browserDenialPage,
  connectDenialPage,
  handleVacancyQueryError,
  noteVacancyRead,
  type DenialPage,
} from '@/lib/vacancy-denial';

/** Shared defaults (ADR-007): 30 s stale, 10 min gc; pending queries dehydrate so streamed panels hydrate. */
export function makeQueryClient(
  page: DenialPage | null = browserDenialPage(),
): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) =>
        handleVacancyQueryError(client, error, query.queryKey),
      onSuccess: (_data, query) => noteVacancyRead(client, query.queryKey),
    }),
    defaultOptions: {
      queries: { staleTime: 30_000, gcTime: 10 * 60_000 },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === 'pending',
      },
    },
  });
  connectDenialPage(client, page);
  return client;
}
