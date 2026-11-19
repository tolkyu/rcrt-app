import {
  QueryClient,
  defaultShouldDehydrateQuery,
} from '@tanstack/react-query';

/** Shared defaults (ADR-007): 30 s stale, 10 min gc; pending queries dehydrate so streamed panels hydrate. */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, gcTime: 10 * 60_000 },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === 'pending',
      },
    },
  });
}
