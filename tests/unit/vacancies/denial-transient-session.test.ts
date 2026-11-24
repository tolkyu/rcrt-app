// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  myLoginHistoryQuery,
  myMfaQuery,
  mySessionsQuery,
} from '@/lib/queries/my-security';
import { positionsQuery } from '@/lib/queries/positions';
import { auditRecordQuery } from '@/lib/queries/settings';
import { assignableTeamLeadsQuery } from '@/lib/queries/team-leads';
import { userDetailQuery } from '@/lib/queries/user-detail';
import { makeQueryClient } from '@/lib/query-client';
import type { DenialPage } from '@/lib/vacancy-denial';

const ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const KEPT = ['form-draft-data'];
const expired = () =>
  Response.json({ code: 'SESSION_EXPIRED' }, { status: 401 });

function setup(answer: (call: number) => Response) {
  const values = new Map<string, string>();
  const replace = vi.fn<(href: string) => void>();
  const page: DenialPage = {
    href: () => 'https://app.test/vacancies/new',
    storage: () => ({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
    }),
    replace,
  };
  const client = makeQueryClient(page);
  client.setDefaultOptions({
    queries: { ...client.getDefaultOptions().queries, retryDelay: 0 },
  });
  client.setQueryData(KEPT, 'kept');
  let call = 0;
  const fetcher = vi.fn<typeof fetch>(async () => answer(++call));
  vi.stubGlobal('fetch', fetcher);
  return { client, replace, fetcher };
}

const reads = [
  ['positions', () => positionsQuery({ status: 'all' })],
  ['team leads', () => assignableTeamLeadsQuery(ID)],
  ['audit record', () => auditRecordQuery(ID)],
  ['user detail', () => userDetailQuery(ID)],
  ['my sessions', () => mySessionsQuery()],
  ['my MFA', () => myMfaQuery()],
] as const;
const settled = () => new Promise((done) => setTimeout(done, 40));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a session 401 counts only after one retry [ADR-020]', () => {
  it('login history: an expired session makes two reads, then purges once', async () => {
    const { client, replace, fetcher } = setup(expired);
    await client
      .fetchInfiniteQuery(myLoginHistoryQuery())
      .catch(() => undefined);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledOnce());
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each(reads)(
    '%s: a transient 401 keeps the page and its data',
    async (_name, options) => {
      const { client, replace, fetcher } = setup((call) =>
        call === 1 ? expired() : Response.json({ code: 'X' }, { status: 400 }),
      );
      await client.fetchQuery(options() as never).catch(() => undefined);
      await settled();
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(replace).not.toHaveBeenCalled();
      expect(client.getQueryData(KEPT)).toBe('kept');
    },
  );

  it.each(reads)(
    '%s: an expired session purges and reloads once, with no loop',
    async (_name, options) => {
      const { client, replace, fetcher } = setup(expired);
      await client.fetchQuery(options() as never).catch(() => undefined);
      await vi.waitFor(() => expect(replace).toHaveBeenCalledOnce());
      await settled();
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(replace).toHaveBeenCalledOnce();
      expect(client.getQueryData(KEPT)).toBeUndefined();
    },
  );
});
