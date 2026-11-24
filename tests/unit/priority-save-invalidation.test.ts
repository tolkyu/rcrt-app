import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { invalidateAfterPrioritySave } from '@/lib/queries/team-lead-priority';
import { assignableTeamLeadsQuery } from '@/lib/queries/team-leads';

const VERTICAL = '8b1f5a0e-0c2d-4f6e-9d7a-2b3c4d5e6f70';

describe('a saved priority change [STORY-ROLE-01-3, STORY-VAC-01-1]', () => {
  it('makes the vacancy form’s Team Lead lists stale, whatever the vertical', () => {
    const client = new QueryClient();
    const list = { items: [] };
    for (const id of [VERTICAL, '9c2a6b1f-1d3e-4a7f-8e8b-3c4d5e6f7081'])
      client.setQueryData(assignableTeamLeadsQuery(id).queryKey, list);
    invalidateAfterPrioritySave(client);
    for (const id of [VERTICAL, '9c2a6b1f-1d3e-4a7f-8e8b-3c4d5e6f7081'])
      expect(
        client.getQueryState(assignableTeamLeadsQuery(id).queryKey)
          ?.isInvalidated,
      ).toBe(true);
  });

  it('refreshes the user cards, user list and audit as before and leaves other keys alone', () => {
    const client = new QueryClient();
    const keys = [
      ['settings', 'user', 'a'],
      ['settings', 'users', { q: '' }],
      ['settings', 'audit', {}],
      ['positions', { status: 'active' }],
    ] as const;
    for (const key of keys) client.setQueryData(key, {});
    invalidateAfterPrioritySave(client);
    expect(keys.map((key) => client.getQueryState(key)?.isInvalidated)).toEqual(
      [true, true, true, false],
    );
  });
});
