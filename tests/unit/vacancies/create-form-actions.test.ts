// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateFormActions } from '@/components/vacancies/create-form-actions';
import { queryKeys } from '@/lib/query-keys';
import { VACANCY_DRAFT_LIMIT } from '@/lib/vacancy-limits';
import messages from '@/messages/uk.json';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mount(draftCount: number | undefined) {
  const fetchMock = vi.fn(async () =>
    Response.json({ count: 3 }, { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);
  const queryClient = new QueryClient();
  render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(NextIntlClientProvider, {
        locale: 'uk',
        messages,
        children: createElement(CreateFormActions, {
          listHref: '/vacancies',
          pendingMode: null,
          feedback: null,
          draftCount,
          onSubmit: vi.fn(),
        }),
      }),
    ),
  );
  return { fetchMock, queryClient };
}

describe('CreateFormActions draft count [S3.2c, D98]', () => {
  it('paints the server count at once and does not ask again on mount', async () => {
    const { fetchMock, queryClient } = mount(VACANCY_DRAFT_LIMIT);
    expect(
      screen
        .getByRole('button', { name: messages.vacancyForm.actions.saveDraft })
        .getAttribute('aria-disabled'),
    ).toBe('true');
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(queryKeys.vacancyDraftCount())).toEqual({
      count: VACANCY_DRAFT_LIMIT,
    });
  });

  it('asks for the count when the server sent none', async () => {
    const { fetchMock } = mount(undefined);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});
