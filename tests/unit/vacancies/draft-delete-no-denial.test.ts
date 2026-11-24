// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useVacancyContentAccess } from '@/components/vacancies/use-vacancy-content-access';
import { vacancyContentQuery } from '@/lib/queries/vacancy-content';
import { vacancyDetailQuery } from '@/lib/queries/vacancy-detail';
import { makeQueryClient } from '@/lib/query-client';
import { isVacancyClosed } from '@/lib/vacancy-closed';
import type { DenialPage } from '@/lib/vacancy-denial';
import { watchVacancyAccess } from '@/lib/vacancy-detail-cache';
import {
  applyClosed,
  closeDraft,
  type ClosableDraft,
} from '@/lib/vacancy-draft-close';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const OTHER = '8b1f5a0e-0c2d-4f6e-9d7a-2b3c4d5e6f70';
const draft: ClosableDraft = {
  id: ID,
  number: 'V-0015',
  title: 'Чернетка',
  status: 'DRAFT',
  vertical: { id: OTHER },
};
const notFound = () => Response.json({ code: 'NOT_FOUND' }, { status: 404 });

function setup(deleteAnswer: () => Response) {
  const values = new Map<string, string>();
  const replace = vi.fn<(href: string) => void>();
  const page: DenialPage = {
    href: () => `https://app.test/vacancies/${ID}`,
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
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (_input, init) =>
      init?.method === 'DELETE' ? deleteAnswer() : notFound(),
    ),
  );
  return { client, replace };
}
type Client = ReturnType<typeof setup>['client'];

const readAll = async (client: Client, id: string) => {
  await client
    .fetchQuery({ ...vacancyContentQuery(id), staleTime: 0 })
    .catch(() => undefined);
  await client
    .fetchQuery({ ...vacancyDetailQuery(id), staleTime: 0 })
    .catch(() => undefined);
};

async function removeOwnDraft(client: Client) {
  const allowed = watchVacancyAccess(client, ID);
  const outcome = await closeDraft(client, 'delete', draft, '', false);
  expect(outcome).toEqual({ status: 'done', vacancy: null });
  await applyClosed(client, draft, null, () => undefined, allowed);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('an own successful delete is not a loss of access [VAC-08, ADR-020]', () => {
  it('the later 404 of its content and card neither reloads nor purges other data', async () => {
    const { client, replace } = setup(() => Response.json({ id: ID }));
    client.setQueryData(['kept'], 'kept');
    await removeOwnDraft(client);
    await readAll(client, ID);
    expect(replace).not.toHaveBeenCalled();
    expect(client.getQueryData(['kept'])).toBe('kept');
  });

  it('stops the mounted content read of the deleted id', async () => {
    const { client, replace } = setup(() => Response.json({ id: ID }));
    const reads = vi.mocked(fetch);
    reads.mockImplementationOnce(async () =>
      Response.json({
        id: ID,
        version: 1,
        updatedAt: '2026-11-19T08:00:00Z',
        descriptionDoc: null,
        requirementsDoc: null,
        status: 'DRAFT',
        canEditContent: true,
      }),
    );
    const view = renderHook(() => useVacancyContentAccess(ID), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client, children }),
    });
    await waitFor(() =>
      expect(view.result.current.state.kind).toBe('readable'),
    );
    await act(async () => {
      await removeOwnDraft(client);
    });
    view.rerender();
    await act(async () => {
      await new Promise((done) => setTimeout(done, 40));
    });
    const contentReads = reads.mock.calls.filter(
      ([input, init]) =>
        String(input).endsWith('/content') && init?.method !== 'DELETE',
    );
    expect(contentReads).toHaveLength(1);
    expect(replace).not.toHaveBeenCalled();
  });

  it('a real denial of another vacancy still reloads', async () => {
    const { client, replace } = setup(() => Response.json({ id: ID }));
    await removeOwnDraft(client);
    await readAll(client, OTHER);
    expect(replace).toHaveBeenCalledOnce();
  });

  it('the same vacancy still reloads when its delete failed', async () => {
    const { client, replace } = setup(() =>
      Response.json({ code: 'INTERNAL' }, { status: 500 }),
    );
    const outcome = await closeDraft(client, 'delete', draft, '', false);
    expect(outcome.status).toBe('failed');
    await readAll(client, ID);
    expect(replace).toHaveBeenCalledOnce();
  });

  it('a retried DELETE that answers 404 marks nothing, and the next read 404 reloads', async () => {
    const { client, replace } = setup(notFound);
    const outcome = await closeDraft(client, 'delete', draft, '', true);
    expect(outcome).toEqual({ status: 'failed', failure: 'gone' });
    expect(isVacancyClosed(client, ID)).toBe(false);
    await readAll(client, ID);
    expect(replace).toHaveBeenCalledOnce();
  });
});
