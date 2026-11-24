import {
  dehydrate,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import type * as QueryModule from '@tanstack/react-query';
import type * as NavigationModule from 'next/navigation';
import { redirect } from 'next/navigation';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VacancyCardLayout from '@/app/(app)/vacancies/[vacancyId]/(card)/layout';
import { queryKeys } from '@/lib/query-keys';

const mocks = vi.hoisted(() => ({
  vacancy: vi.fn<(id: string) => Promise<unknown>>(),
  content: vi.fn<(id: string) => Promise<unknown>>(),
  logError: vi.fn(),
}));
vi.mock('@/app/(app)/vacancies/_lib/vacancy', () => ({
  loadVacancy: mocks.vacancy,
}));
vi.mock('@/app/(app)/vacancies/_lib/vacancy-content', () => ({
  loadVacancyContent: mocks.content,
}));
vi.mock('@/server/observability/logger', () => ({
  logger: { error: mocks.logError },
  describeError: (error: unknown) => ({
    name: error instanceof Error ? error.name : typeof error,
  }),
}));
vi.mock('next/navigation', async (original) => ({
  ...(await original<typeof NavigationModule>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
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
      children: await VacancyCardLayout({
        children: createElement('main', null, 'PAGE'),
        params: Promise.resolve({ vacancyId: ID.toUpperCase() }),
      }),
    }),
  );
const seeded = () => {
  const state = vi.mocked(dehydrate).mock.results[0]!.value as ReturnType<
    typeof dehydrate
  >;
  return Object.fromEntries(
    state.queries.map((query) => [
      JSON.stringify(query.queryKey),
      query.state.data,
    ]),
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.vacancy.mockResolvedValue(vacancy);
  mocks.content.mockResolvedValue(content);
});

describe('card layout content seeding [ADR-020]', () => {
  it('starts both reads together and seeds their distinct DTOs', async () => {
    expect(await render()).toContain('PAGE');
    expect(mocks.vacancy).toHaveBeenCalledWith(ID.toUpperCase());
    expect(mocks.content).toHaveBeenCalledWith(ID.toUpperCase());
    expect(seeded()).toEqual({
      [JSON.stringify(queryKeys.vacancy(ID))]: vacancy,
      [JSON.stringify(queryKeys.vacancyContent(ID))]: content,
    });
  });

  it('a content 404 makes the whole card a real 404', async () => {
    mocks.content.mockResolvedValue(null);
    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(dehydrate).not.toHaveBeenCalled();
  });

  it('a content failure is logged without its message and leaves the retry to the client', async () => {
    mocks.content.mockRejectedValue(new Error('secret@example.com failed'));
    expect(await render()).toContain('PAGE');
    expect(mocks.logError).toHaveBeenCalledExactlyOnceWith(
      { err: { name: 'Error' } },
      'vacancy card content read failed',
    );
    expect(seeded()).toEqual({
      [JSON.stringify(queryKeys.vacancy(ID))]: vacancy,
    });
  });

  it('rethrows a Next redirect from the content read instead of swallowing it', async () => {
    mocks.content.mockImplementation(async () => redirect('/login'));
    await expect(render()).rejects.toMatchObject({
      digest: expect.stringContaining('NEXT_REDIRECT'),
    });
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it('renders the children untouched when the vacancy is missing', async () => {
    mocks.vacancy.mockResolvedValue(null);
    expect(await render()).toContain('PAGE');
    expect(dehydrate).not.toHaveBeenCalled();
  });
});
