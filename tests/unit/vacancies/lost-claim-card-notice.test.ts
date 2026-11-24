// @vitest-environment jsdom
import {
  QueryClientProvider,
  QueryObserver,
  type QueryClient,
} from '@tanstack/react-query';
import {
  act,
  cleanup,
  render,
  renderHook,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LostClaimCardNotice } from '@/components/vacancies/lost-claim-card-notice';
import { useLostClaimNotice } from '@/components/vacancies/lost-claim-notice';
import { useClaimVacancy } from '@/components/vacancies/use-claim-vacancy';
import { vacancyDetailQuery } from '@/lib/queries/vacancy-detail';
import { makeQueryClient } from '@/lib/query-client';
import type { DenialPage } from '@/lib/vacancy-denial';
import messages from '@/messages/uk.json';
import { ID, problem, stubApi, vacancy } from '../../support/team-harness';

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));
vi.mock('@/lib/toast', () => ({ toast }));

const location = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => location.pathname }));

const t = messages.vacancies.team.claimDialog;
const FLASH = 'vacancy-claim-lost';
const OTHER = '0f0e0d0c-0b0a-4908-8706-050403020100';
const card = vacancy({ number: 'V-0042' });

const wrapper =
  (client: QueryClient) =>
  ({ children }: { children: ReactNode }) =>
    createElement(NextIntlClientProvider, {
      locale: 'uk',
      timeZone: 'Europe/Kyiv',
      messages,
      onError: (error) => {
        throw error;
      },
      children: createElement(QueryClientProvider, { client, children }),
    });

/** The full card watches its vacancy; a lost claim there reloads the card URL. */
async function loseClaimOnCard() {
  stubApi({
    [`POST /vacancies/${ID}/recruiters/claim`]: () => problem(404, 'NOT_FOUND'),
    [`GET /vacancies/${ID}`]: () => problem(404, 'NOT_FOUND'),
  });
  const replace = vi.fn<DenialPage['replace']>();
  const client = makeQueryClient({
    href: () => `http://localhost/vacancies/${ID}`,
    storage: () => window.sessionStorage,
    replace,
  });
  client.setQueryData(vacancyDetailQuery(ID).queryKey, card);
  const stop = new QueryObserver(client, {
    ...vacancyDetailQuery(ID),
    retry: false,
  }).subscribe(() => undefined);
  const { result } = renderHook(() => useClaimVacancy(card), {
    wrapper: wrapper(client),
  });
  await act(async () => {
    expect(await result.current.claim()).toBe('lost');
  });
  await waitFor(() => expect(replace).toHaveBeenCalledOnce());
  stop();
  cleanup();
  toast.warning.mockClear();
  vi.spyOn(performance, 'timeOrigin', 'get').mockReturnValue(Date.now() + 1);
}

/** The 404 view the reloaded card URL renders. */
const cardNotFound = (pathname: string) => {
  location.pathname = pathname;
  render(
    createElement(wrapper(makeQueryClient(null)), {
      children: createElement(LostClaimCardNotice),
    }),
  );
};

beforeEach(() => window.sessionStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('lost claim from the full card [VAC-02-1, D132]', () => {
  it('shows the notice once on the denied card after the reload, and not again on the list', async () => {
    await loseClaimOnCard();
    cardNotFound(`/vacancies/${ID}`);
    await waitFor(() => expect(toast.warning).toHaveBeenCalledOnce());
    expect(toast.warning).toHaveBeenCalledWith(t.lost, {
      description: t.lostDescription.replace('{number}', 'V-0042'),
      id: `claim:${ID}`,
      duration: 6000,
    });
    expect(window.sessionStorage.getItem(FLASH)).toBeNull();

    cleanup();
    toast.warning.mockClear();
    renderHook(() => useLostClaimNotice(), {
      wrapper: wrapper(makeQueryClient(null)),
    });
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('does not show another vacancy’s notice on this card', async () => {
    await loseClaimOnCard();
    cardNotFound(`/vacancies/${OTHER}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(toast.warning).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(FLASH)).not.toBeNull();
  });

  it('reads nothing on a 404 that is not a vacancy card', async () => {
    await loseClaimOnCard();
    cardNotFound('/vacancies/new');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(toast.warning).not.toHaveBeenCalled();
  });
});
