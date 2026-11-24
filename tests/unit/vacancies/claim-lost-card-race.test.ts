// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VacancyDetailView } from '@/components/vacancies/vacancy-detail-view';
import { makeQueryClient } from '@/lib/query-client';
import { queryKeys } from '@/lib/query-keys';
import type { DenialPage } from '@/lib/vacancy-denial';
import messages from '@/messages/uk.json';
import {
  mountInUk,
  SHARE_ID,
  shareVacancy,
} from '@/tests/support/vacancy-share-harness';

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

const t = messages.vacancies.team;
const CARD_URL = `http://localhost/vacancies/${SHARE_ID}`;
const FLASH = 'vacancy-claim-lost';
const claimable = shareVacancy({ canSelfAssign: true });
const content = {
  id: SHARE_ID,
  version: 1,
  updatedAt: '2026-11-19T08:00:00Z',
  descriptionDoc: null,
  requirementsDoc: null,
  status: 'OPEN',
  canEditContent: false,
};

/** Reads succeed until the rival's claim lands; after it this viewer can read neither the card nor its content. */
function stubServer({ readableAfter }: { readableAfter: boolean }) {
  let claimed = false;
  const answer = (body: unknown, status = 200) =>
    Response.json(body, { status });
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input).replace(/^\/api\/v1/, '');
      if (init?.method === 'POST') {
        claimed = true;
        return answer({ code: 'NOT_FOUND' }, 404);
      }
      const gone = claimed && !readableAfter;
      if (path.endsWith('/content'))
        return gone ? answer({ code: 'NOT_FOUND' }, 404) : answer(content);
      if (path === `/vacancies/${SHARE_ID}`)
        return gone
          ? answer({ code: 'NOT_FOUND' }, 404)
          : answer({ ...claimable, canSelfAssign: false });
      return answer({ code: 'NOT_FOUND' }, 404);
    }),
  );
}

async function claimOnCard() {
  const atReload: (string | null)[] = [];
  const replace = vi.fn<DenialPage['replace']>(() => {
    atReload.push(window.sessionStorage.getItem(FLASH));
  });
  const client = makeQueryClient({
    href: () => CARD_URL,
    storage: () => window.sessionStorage,
    replace,
  });
  client.setQueryData(queryKeys.vacancy(SHARE_ID), claimable);
  client.setQueryData(queryKeys.vacancyContent(SHARE_ID), content);
  mountInUk(
    createElement(QueryClientProvider, {
      client,
      children: createElement(VacancyDetailView, {
        id: SHARE_ID,
        canAuthorDrafts: false,
      }),
    }),
  );
  await userEvent.click(await screen.findByRole('button', { name: t.claim }));
  const dialog = await screen.findByRole('alertdialog');
  await userEvent.click(
    within(dialog).getByRole('button', { name: t.claimDialog.confirm }),
  );
  await waitFor(() => expect(toast.warning).toHaveBeenCalled());
  return { replace, atReload };
}

beforeEach(() => {
  window.sessionStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('lost claim on the card: reload or list, never both [D132]', () => {
  it('an unreadable card reloads its own URL once and never navigates to the list', async () => {
    stubServer({ readableAfter: false });
    const { replace } = await claimOnCard();
    await waitFor(() => expect(replace).toHaveBeenCalledOnce());
    expect(replace).toHaveBeenCalledWith(CARD_URL);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(router.replace).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledOnce();
  });

  it('the lost-claim note is already stored when the reload starts', async () => {
    stubServer({ readableAfter: false });
    const { replace, atReload } = await claimOnCard();
    await waitFor(() => expect(replace).toHaveBeenCalledOnce());
    expect(atReload).toHaveLength(1);
    expect(JSON.parse(atReload[0] ?? 'null')).toMatchObject({
      id: SHARE_ID,
      number: claimable.number,
    });
  });

  it('a card that stays readable leaves no note behind', async () => {
    stubServer({ readableAfter: true });
    const { replace } = await claimOnCard();
    await waitFor(() => expect(router.replace).toHaveBeenCalledOnce());
    expect(replace).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(FLASH)).toBeNull();
  });

  it('a card that stays readable keeps today’s flow: one warning and the move to the list', async () => {
    stubServer({ readableAfter: true });
    const { replace } = await claimOnCard();
    await waitFor(() => expect(router.replace).toHaveBeenCalledOnce());
    expect(replace).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledOnce();
  });
});
