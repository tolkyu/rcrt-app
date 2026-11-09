import { dehydrate, hydrate, QueryObserver } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeQueryClient } from '@/lib/query-client';
import { MANAGER_POSITIONS, positionsQuery } from '@/lib/queries/positions';

const options = positionsQuery(MANAGER_POSITIONS);
const state = () => {
  const server = makeQueryClient();
  server.setQueryData(options.queryKey, { items: [] });
  return dehydrate(server);
};
const cached = (client: ReturnType<typeof makeQueryClient>) =>
  client.getQueryData(options.queryKey);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('hydrated manager list [PERF-02]', () => {
  it('stays in the cache while a large page hydrates and no observer has subscribed yet', async () => {
    const client = makeQueryClient();
    hydrate(client, state());
    await vi.advanceTimersByTimeAsync(5_000);
    expect(cached(client)).toEqual({ items: [] });
    const unsubscribe = new QueryObserver(client, options).subscribe(() => {});
    expect(cached(client)).toEqual({ items: [] });
    unsubscribe();
  });
});
