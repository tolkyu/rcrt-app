// @vitest-environment jsdom
import {
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDraftClose } from '@/components/vacancies/use-draft-close';
import { useVacancyContentAccess } from '@/components/vacancies/use-vacancy-content-access';
import { vacancyDetailQuery } from '@/lib/queries/vacancy-detail';
import { makeQueryClient } from '@/lib/query-client';
import { isVacancyClosed } from '@/lib/vacancy-closed';
import type { DenialPage } from '@/lib/vacancy-denial';
import {
  closedLandingHref,
  type ClosableDraft,
} from '@/lib/vacancy-draft-close';
import messages from '@/messages/uk.json';
import {
  SHARE_ID,
  mountInUk,
  shareVacancy,
} from '../../support/vacancy-share-harness';

const { router, toast } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/toast', () => ({ toast }));

const stored = shareVacancy({ status: 'DRAFT' });
const draft: ClosableDraft = stored as ClosableDraft;

function Menu() {
  const { openDialog, dialog } = useDraftClose(draft);
  return createElement(
    'div',
    null,
    createElement('button', { onClick: () => openDialog('delete') }, 'open'),
    dialog,
  );
}

/** Same gates as the card: the menu lives under the detail data, which the delete removes. */
function Card() {
  const client = useQueryClient();
  useVacancyContentAccess(SHARE_ID);
  const query = useQuery({
    ...vacancyDetailQuery(SHARE_ID),
    enabled: !isVacancyClosed(client, SHARE_ID),
  });
  return query.data ? createElement(Menu) : null;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function confirmDelete(answer: () => Response) {
  let deleted = false;
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      if (init?.method === 'DELETE') {
        const response = answer();
        deleted = response.ok;
        return response;
      }
      if (deleted) return Response.json({ code: 'NOT_FOUND' }, { status: 404 });
      return String(input).endsWith('/content')
        ? Response.json({
            id: SHARE_ID,
            version: 1,
            updatedAt: '2026-11-19T08:00:00Z',
            descriptionDoc: null,
            requirementsDoc: null,
            status: 'DRAFT',
            canEditContent: true,
          })
        : Response.json(stored);
    }),
  );
  const replace = vi.fn<(href: string) => void>();
  const values = new Map<string, string>();
  const page: DenialPage = {
    href: () => `https://app.test/vacancies/${SHARE_ID}`,
    storage: () => ({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
    }),
    replace,
  };
  const client = makeQueryClient(page);
  mountInUk(
    createElement(QueryClientProvider, {
      client,
      children: createElement(Card),
    }),
  );
  fireEvent.click(await screen.findByRole('button', { name: 'open' }));
  fireEvent.click(
    await screen.findByRole('button', {
      name: messages.vacancies.draft.close.delete.confirm,
    }),
  );
  return replace;
}

describe('deleting a draft from its card [VAC-08, ADR-020]', () => {
  it('navigates to its list with the toast, with no denial reload, and refreshes the router cache once', async () => {
    const replace = await confirmDelete(() => Response.json({ id: SHARE_ID }));
    await waitFor(
      () =>
        expect(router.replace).toHaveBeenCalledWith(closedLandingHref(draft)),
      { timeout: 3000 },
    );
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    await act(async () => {
      await new Promise((done) => setTimeout(done, 40));
    });
    expect(router.refresh).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();
  });

  it('a failed delete refreshes nothing and does not navigate', async () => {
    await confirmDelete(() =>
      Response.json({ code: 'INTERNAL' }, { status: 500 }),
    );
    await screen.findByText(messages.vacancies.draft.close.error.failed);
    expect(router.refresh).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
