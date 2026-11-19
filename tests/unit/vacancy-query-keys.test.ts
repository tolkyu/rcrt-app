import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { vacanciesQuery } from '@/lib/queries/vacancies';
import { queryKeys } from '@/lib/query-keys';

describe('vacancy query keys [STORY-VAC-01-3 AC1]', () => {
  it('a list invalidation also refreshes the own-drafts chip count', async () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.vacancyDraftCount(), { count: 3 });
    client.setQueryData(queryKeys.vacancies({ status: 'DRAFT' }), []);
    await client.invalidateQueries({ queryKey: ['vacancies'] });
    expect(
      client.getQueryState(queryKeys.vacancyDraftCount())?.isInvalidated,
    ).toBe(true);
  });
});

describe('vacancy list query key [VAC-04-4]', () => {
  it('carries the urgency filter, so each urgency has its own cache entry and prefetch', () => {
    const all = vacanciesQuery({ limit: 25 }).queryKey;
    const urgent = vacanciesQuery({ priority: 'URGENT', limit: 25 }).queryKey;
    expect(urgent).toEqual(['vacancies', { priority: 'URGENT', limit: 25 }]);
    expect(urgent).not.toEqual(all);
    expect(urgent).not.toEqual(
      vacanciesQuery({ priority: 'NORMAL', limit: 25 }).queryKey,
    );
  });

  it('keeps the cursor in the key: the same urgency on another page is another entry', () => {
    expect(
      vacanciesQuery({ priority: 'URGENT', cursor: '7', limit: 25 }).queryKey,
    ).toEqual(['vacancies', { priority: 'URGENT', cursor: '7', limit: 25 }]);
  });
});
