import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
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
