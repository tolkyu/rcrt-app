// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useAdoptUserVersion } from '@/lib/queries/user-detail';
import { queryKeys } from '@/lib/query-keys';
import type { UserDetail } from '@/lib/schemas/user';

const ID = '33333333-3333-4333-8333-333333333333';
const key = queryKeys.settingsUser(ID);

afterEach(cleanup);

function setup(cached?: Partial<UserDetail>) {
  const client = new QueryClient();
  if (cached) client.setQueryData(key, cached);
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const { result } = renderHook(() => useAdoptUserVersion(ID), { wrapper });
  return { adopt: result.current, read: () => client.getQueryData(key) };
}

describe('useAdoptUserVersion [ADR-006, STORY-ROLE-01-1]', () => {
  it('replaces an older cached version together with the state it stands for', () => {
    const { adopt, read } = setup({ version: 3, email: 'old@demo' });
    adopt(4, { email: 'new@demo' });
    expect(read()).toEqual({ version: 4, email: 'new@demo' });
  });

  it('keeps a cached version that is already as new or newer, patch included', () => {
    const { adopt, read } = setup({ version: 5, email: 'kept@demo' });
    adopt(4, { email: 'stale@demo' });
    adopt(5, { email: 'stale@demo' });
    expect(read()).toEqual({ version: 5, email: 'kept@demo' });
  });

  it('writes nothing when the card is not cached', () => {
    const { adopt, read } = setup();
    adopt(2, { email: 'new@demo' });
    expect(read()).toBeUndefined();
  });
});
