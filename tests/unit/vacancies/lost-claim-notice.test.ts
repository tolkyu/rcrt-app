// @vitest-environment jsdom
import {
  QueryClientProvider,
  QueryObserver,
  type QueryClient,
} from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const t = messages.vacancies.team.claimDialog;
const FLASH = 'vacancy-claim-lost';
const card = vacancy({ number: 'V-0042' });

function page() {
  return {
    href: () => 'http://localhost/vacancies',
    storage: () => window.sessionStorage,
    replace: vi.fn<DenialPage['replace']>(),
  } satisfies DenialPage;
}

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

/** The list preview watches the card, so the refresh after the failed claim reads it again. */
function previewOpen(client: QueryClient) {
  client.setQueryData(vacancyDetailQuery(ID).queryKey, card);
  const observer = new QueryObserver(client, {
    ...vacancyDetailQuery(ID),
    retry: false,
  });
  return observer.subscribe(() => undefined);
}

async function loseClaim(client: QueryClient) {
  const { result } = renderHook(() => useClaimVacancy(card), {
    wrapper: wrapper(client),
  });
  let next: Awaited<ReturnType<typeof result.current.claim>> = null;
  await act(async () => {
    next = await result.current.claim();
  });
  return next;
}

/** A new document: it starts after the notice was written, with a fresh client; the notice reader of the list mounts. */
function afterReload() {
  cleanup();
  toast.warning.mockClear();
  vi.spyOn(performance, 'timeOrigin', 'get').mockReturnValue(Date.now() + 1);
  return renderHook(() => useLostClaimNotice(), {
    wrapper: wrapper(makeQueryClient(null)),
  });
}

beforeEach(() => window.sessionStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('lost claim survives the access-loss reload [VAC-02-1, D132]', () => {
  it('claim 404, then preview 404: one reload, then the conflict notice exactly once', async () => {
    stubApi({
      [`POST /vacancies/${ID}/recruiters/claim`]: () =>
        problem(404, 'NOT_FOUND'),
      [`GET /vacancies/${ID}`]: () => problem(404, 'NOT_FOUND'),
      [`GET /vacancies/${ID}/content`]: () => problem(404, 'NOT_FOUND'),
    });
    const denial = page();
    const client = makeQueryClient(denial);
    const stop = previewOpen(client);
    expect(await loseClaim(client)).toBe('lost');
    await waitFor(() => expect(denial.replace).toHaveBeenCalledOnce());
    stop();

    afterReload();
    expect(toast.warning).toHaveBeenCalledOnce();
    expect(toast.warning).toHaveBeenCalledWith(t.lost, {
      description: t.lostDescription.replace('{number}', 'V-0042'),
      id: `claim:${ID}`,
      duration: 6000,
    });
    expect(window.sessionStorage.getItem(FLASH)).toBeNull();

    afterReload();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('the document that lost the claim leaves the notice for the reload, even if the list mounts first', async () => {
    stubApi({
      [`POST /vacancies/${ID}/recruiters/claim`]: () =>
        problem(404, 'NOT_FOUND'),
    });
    const client = makeQueryClient(null);
    expect(await loseClaim(client)).toBe('lost');
    toast.warning.mockClear();
    renderHook(() => useLostClaimNotice(), { wrapper: wrapper(client) });
    expect(toast.warning).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(FLASH)).not.toBeNull();
  });

  it('a plain access loss without a claim reloads and shows nothing', async () => {
    stubApi({ [`GET /vacancies/${ID}`]: () => problem(404, 'NOT_FOUND') });
    const denial = page();
    const client = makeQueryClient(denial);
    const stop = previewOpen(client);
    await act(() => client.invalidateQueries());
    await waitFor(() => expect(denial.replace).toHaveBeenCalledOnce());
    stop();
    afterReload();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('a notice that cannot be stored never blocks the reload', async () => {
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === FLASH) throw new DOMException('full', 'QuotaExceededError');
      setItem.call(this, key, value);
    });
    stubApi({
      [`POST /vacancies/${ID}/recruiters/claim`]: () =>
        problem(404, 'NOT_FOUND'),
      [`GET /vacancies/${ID}`]: () => problem(404, 'NOT_FOUND'),
    });
    const denial = page();
    const client = makeQueryClient(denial);
    const stop = previewOpen(client);
    expect(await loseClaim(client)).toBe('lost');
    expect(toast.warning).toHaveBeenCalledWith(t.lost, expect.anything());
    await waitFor(() => expect(denial.replace).toHaveBeenCalledOnce());
    stop();
  });

  it('shows nothing after a reload the user asked for, or once the notice is old', () => {
    const write = (at: number) =>
      window.sessionStorage.setItem(
        FLASH,
        JSON.stringify({ at, id: ID, number: 'V-0042' }),
      );
    class Navigation {
      type = 'reload';
    }
    vi.stubGlobal('PerformanceNavigationTiming', Navigation);
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
      new Navigation() as unknown as PerformanceEntry,
    ]);
    write(Date.now());
    afterReload();
    expect(toast.warning).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(FLASH)).toBeNull();

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    write(Date.now() - 60_000);
    afterReload();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('ignores a malformed notice', () => {
    window.sessionStorage.setItem(
      FLASH,
      JSON.stringify({ at: Date.now(), id: ID, number: '<b>x</b>' }),
    );
    afterReload();
    expect(toast.warning).not.toHaveBeenCalled();
  });
});
