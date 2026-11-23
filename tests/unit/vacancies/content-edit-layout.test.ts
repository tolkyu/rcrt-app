import {
  dehydrate,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import type * as QueryModule from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContentEditLayout from '@/app/(app)/vacancies/[vacancyId]/content/edit/layout';
import { queryKeys } from '@/lib/query-keys';
import messages from '@/messages/uk.json';

const mocks = vi.hoisted(() => ({
  session: vi.fn<() => Promise<unknown>>(),
  vacancy: vi.fn<(id: string) => Promise<unknown>>(),
  content: vi.fn<(id: string) => Promise<unknown>>(),
}));
vi.mock('@/app/(app)/_lib/session', () => ({
  requireSession: mocks.session,
}));
vi.mock('@/app/(app)/vacancies/_lib/vacancy', () => ({
  loadVacancy: mocks.vacancy,
}));
vi.mock('@/app/(app)/vacancies/_lib/vacancy-content', () => ({
  loadVacancyContent: mocks.content,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('next-intl/server', () => ({ getMessages: async () => messages }));
vi.mock('@tanstack/react-query', async (original) => {
  const actual = await original<typeof QueryModule>();
  return { ...actual, dehydrate: vi.fn(actual.dehydrate) };
});

const ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const vacancy = { id: ID, number: 'V-0015', title: 'Медіабаєр' };
const content = {
  id: ID,
  version: 3,
  updatedAt: '2026-11-19T08:00:00Z',
  descriptionDoc: null,
  requirementsDoc: null,
  status: 'OPEN',
  canEditContent: true,
};
const render = async () =>
  renderToStaticMarkup(
    createElement(QueryClientProvider, {
      client: new QueryClient(),
      children: await ContentEditLayout({
        children: createElement('main', null, 'PAGE'),
        params: Promise.resolve({ vacancyId: ID.toUpperCase() }),
      }),
    }),
  );
const reject = (read: typeof mocks.vacancy) =>
  read.mockRejectedValue(new Error('database unavailable'));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({});
  mocks.vacancy.mockResolvedValue(vacancy);
  mocks.content.mockResolvedValue(content);
});

describe('content edit layout [ADR-020]', () => {
  it('seeds the distinct vacancy and content entries and renders the page', async () => {
    expect(await render()).toContain('PAGE');
    expect(mocks.vacancy).toHaveBeenCalledWith(ID.toUpperCase());
    const state = vi.mocked(dehydrate).mock.results[0]!.value as ReturnType<
      typeof dehydrate
    >;
    expect(
      Object.fromEntries(
        state.queries.map((query) => [
          JSON.stringify(query.queryKey),
          query.state.data,
        ]),
      ),
    ).toEqual({
      [JSON.stringify(queryKeys.vacancy(ID))]: vacancy,
      [JSON.stringify(queryKeys.vacancyContent(ID))]: content,
    });
  });
  it.each(['vacancy', 'content'] as const)(
    'a hidden or missing %s is a real 404 before any page renders',
    async (name) => {
      mocks[name].mockResolvedValue(null);
      await expect(render()).rejects.toThrow('NEXT_NOT_FOUND');
    },
  );
  it('404 wins over a transient failure of the other read', async () => {
    mocks.vacancy.mockResolvedValue(null);
    reject(mocks.content);
    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND');
  });
  it.each(['vacancy', 'content'] as const)(
    'a failed %s read renders the retry state, never the page or any document',
    async (name) => {
      reject(mocks[name]);
      const html = await render();
      expect(html).not.toContain('PAGE');
      expect(html).toContain(messages.states.errorTitle);
      expect(dehydrate).not.toHaveBeenCalled();
    },
  );
  it('a session failure is rethrown, not turned into a retry state', async () => {
    mocks.session.mockRejectedValue(new Error('NEXT_REDIRECT'));
    await expect(render()).rejects.toThrow('NEXT_REDIRECT');
  });
});
