// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VacancyDetailView } from '@/components/vacancies/vacancy-detail-view';
import { makeQueryClient } from '@/lib/query-client';
import type { DenialPage } from '@/lib/vacancy-denial';
import messages from '@/messages/uk.json';
import { mountInUk, SHARE_ID } from '@/tests/support/vacancy-share-harness';

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));
vi.mock('@/lib/toast', () => ({ toast }));

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => `/vacancies/${SHARE_ID}`,
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) =>
    createElement('a', { href }, children),
}));

const t = messages.vacancies;
const FLASH = 'vacancy-claim-lost';
const OTHER = '0f0e0d0c-0b0a-4908-8706-050403020100';
const replace = vi.fn<DenialPage['replace']>();
const page: DenialPage = {
  href: () => `http://localhost/vacancies/${SHARE_ID}`,
  storage: () => window.sessionStorage,
  replace,
};

/** One page load of the card whose detail and content both answer 404. */
async function openDeniedCard() {
  cleanup();
  mountInUk(
    createElement(QueryClientProvider, {
      client: makeQueryClient(page),
      children: createElement(VacancyDetailView, {
        id: SHARE_ID,
        canAuthorDrafts: false,
      }),
    }),
  );
  expect(await screen.findByText(t.detail.notFoundTitle)).toBeTruthy();
}

const notice = (id: string) =>
  window.sessionStorage.setItem(
    FLASH,
    JSON.stringify({ at: Date.now() - 100, id, number: 'V-0042' }),
  );

beforeEach(async () => {
  window.sessionStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async () =>
      Response.json({ code: 'NOT_FOUND' }, { status: 404 }),
    ),
  );
  // The guard reloads once per denied read (detail, content); loads until it stops leave the next load on the client-side 404.
  for (let load = 0; load < 4; load++) {
    replace.mockClear();
    await openDeniedCard();
    await new Promise((resolve) => setTimeout(resolve, 20));
    if (!replace.mock.calls.length) break;
  }
  expect(replace).not.toHaveBeenCalled();
  toast.warning.mockClear();
  vi.spyOn(performance, 'timeOrigin', 'get').mockReturnValue(Date.now());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('lost claim on the card’s client-side 404 [VAC-02-1, D132]', () => {
  it('shows the notice once when the guard has already reloaded', async () => {
    notice(SHARE_ID);
    await openDeniedCard();
    await waitFor(() => expect(toast.warning).toHaveBeenCalledOnce());
    expect(toast.warning).toHaveBeenCalledWith(t.team.claimDialog.lost, {
      description: t.team.claimDialog.lostDescription.replace(
        '{number}',
        'V-0042',
      ),
      id: `claim:${SHARE_ID}`,
      duration: 6000,
    });
    expect(replace).not.toHaveBeenCalled();

    toast.warning.mockClear();
    await openDeniedCard();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('does not show another vacancy’s notice', async () => {
    notice(OTHER);
    await openDeniedCard();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(toast.warning).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(FLASH)).not.toBeNull();
  });
});
