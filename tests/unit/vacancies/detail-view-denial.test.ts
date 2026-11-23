// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VacancyDetailView } from '@/components/vacancies/vacancy-detail-view';
import { queryKeys } from '@/lib/query-keys';
import messages from '@/messages/uk.json';
import {
  SHARE_ID,
  mountInUk,
  shareVacancy,
} from '@/tests/support/vacancy-share-harness';

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) =>
    createElement('a', { href }, children),
}));

const copy = messages.vacancies;
const vacancy = shareVacancy();
const content = {
  id: SHARE_ID,
  version: 1,
  updatedAt: '2026-11-19T08:00:00Z',
  descriptionDoc: {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Опис ролі' }] },
    ],
  },
  requirementsDoc: null,
  status: 'OPEN',
  canEditContent: true,
};

let contentResponse: () => Response;
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0, retry: false } },
  });
  client.setQueryData(queryKeys.vacancy(SHARE_ID), vacancy);
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/content')) return contentResponse();
      if (url.includes(`/vacancies/${SHARE_ID}`)) return Response.json(vacancy);
      return Response.json({ code: 'NOT_FOUND' }, { status: 404 });
    }),
  );
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

const mount = () =>
  mountInUk(
    createElement(QueryClientProvider, {
      client,
      children: createElement(VacancyDetailView, {
        id: SHARE_ID,
        canAuthorDrafts: false,
      }),
    }),
  );
const problem = (status: number) =>
  Response.json({ code: 'DENIED' }, { status });
const metadataGone = () => {
  expect(screen.queryByText(vacancy.number)).toBeNull();
  expect(screen.queryByRole('heading', { name: vacancy.title })).toBeNull();
  expect(screen.queryByRole('button', { name: copy.share })).toBeNull();
  expect(
    screen.queryByRole('link', { name: copy.contentCard.editAction }),
  ).toBeNull();
  expect(screen.queryByText(copy.contentCard.title)).toBeNull();
};

describe('card denial composition [ADR-020]', () => {
  it('shows the metadata, the documents and the edit link after a readable fresh read', async () => {
    contentResponse = () => Response.json(content);
    mount();
    expect(await screen.findByText('Опис ролі')).not.toBeNull();
    expect(screen.getByText(vacancy.number)).not.toBeNull();
    expect(
      screen
        .getByRole('link', { name: copy.contentCard.editAction })
        .getAttribute('href'),
    ).toBe(`/vacancies/${SHARE_ID}/content/edit`);
  });

  it.each([404, 403])(
    'content %i replaces the whole card with the not-found state',
    async (status) => {
      contentResponse = () => problem(status);
      mount();
      expect(await screen.findByText(copy.detail.notFoundTitle)).not.toBeNull();
      metadataGone();
      expect(client.getQueryData(queryKeys.vacancy(SHARE_ID))).toBeUndefined();
    },
  );

  it('content 401 shows only the loading skeleton while the session is refreshed', async () => {
    contentResponse = () => problem(401);
    mount();
    await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce());
    expect(screen.queryByText(copy.detail.notFoundTitle)).toBeNull();
    expect(screen.getByRole('status')).not.toBeNull();
    metadataGone();
  });

  it('content 5xx keeps the card and shows a retryable section error in the panel', async () => {
    contentResponse = () =>
      Response.json({ code: 'INTERNAL' }, { status: 500 });
    mount();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(messages.states.errorTitle);
    expect(screen.getByText(vacancy.number)).not.toBeNull();
    expect(screen.getByText(copy.contentCard.title)).not.toBeNull();
    expect(
      screen.queryByRole('link', { name: copy.contentCard.editAction }),
    ).toBeNull();
    contentResponse = () => Response.json(content);
    fireEvent.click(
      screen.getByRole('button', { name: messages.common.retry }),
    );
    expect(await screen.findByText('Опис ролі')).not.toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
