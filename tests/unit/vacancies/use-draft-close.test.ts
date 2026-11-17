// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  DraftLeaveProvider,
  type DraftLeave,
} from '@/components/vacancies/draft-leave';
import { useDraftClose } from '@/components/vacancies/use-draft-close';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import type { ClosableDraft } from '@/lib/vacancy-draft-close';
import messages from '@/messages/uk.json';

const { router, toast } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn() },
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/toast', () => ({ toast }));

const ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const VERTICAL = '8b1f5a0e-0c2d-4f6e-9d7a-2b3c4d5e6f70';
const d = messages.vacancies.draft;

const detail = (changes: Partial<VacancyDetail> = {}): VacancyDetail => ({
  id: ID,
  number: 'V-0015',
  title: 'Медіабаєр — Facebook',
  vertical: { id: VERTICAL, name: 'Гемблінг' },
  position: null,
  teamLead: null,
  recruiters: [],
  status: 'DRAFT',
  priority: 'NORMAL',
  source: 'APP',
  openedAt: null,
  createdAt: '2026-11-16T08:00:00.000Z',
  updatedAt: '2026-11-16T08:00:00.000Z',
  headcount: 1,
  seniority: null,
  workFormat: null,
  employmentType: null,
  location: null,
  salaryMinMinor: null,
  salaryMaxMinor: null,
  salaryCurrency: null,
  probationDays: 90,
  recruiterInitiated: true,
  version: 3,
  ...changes,
});
const draft = (status: ClosableDraft['status'] = 'DRAFT'): ClosableDraft => ({
  id: ID,
  number: 'V-0015',
  title: 'Медіабаєр — Facebook',
  status,
  vertical: { id: VERTICAL },
});
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const problem = (status: number, code: string) =>
  json(status, { code, errors: [] });

let fetchSpy: ReturnType<typeof vi.fn<typeof fetch>>;
let queryClient: QueryClient;
const leave = {
  removed: vi.fn<(id: string) => boolean>(() => true),
  restored: vi.fn<(id: string) => boolean>(() => true),
  settled: vi.fn<(id: string) => void>(),
} satisfies DraftLeave;

function Harness({
  value,
  card,
}: {
  value: ClosableDraft;
  card?: { removed: () => void; restored: () => void };
}) {
  const { openDialog, dialog } = useDraftClose(value, card);
  return createElement(
    'div',
    null,
    createElement(
      'button',
      { type: 'button', onClick: () => openDialog('cancel') },
      'opener-cancel',
    ),
    createElement(
      'button',
      { type: 'button', onClick: () => openDialog('delete') },
      'opener-delete',
    ),
    dialog,
  );
}

function mount(
  value: ClosableDraft,
  {
    withList = true,
    card,
  }: { withList?: boolean; card?: Parameters<typeof Harness>[0]['card'] } = {},
) {
  const harness = createElement(Harness, { value, card });
  return render(
    createElement(NextIntlClientProvider, {
      locale: 'uk',
      timeZone: 'Europe/Kyiv',
      messages,
      children: createElement(QueryClientProvider, {
        client: queryClient,
        children: withList
          ? createElement(DraftLeaveProvider, {
              value: leave,
              children: harness,
            })
          : harness,
      }),
    }),
  );
}

const opener = (kind: 'cancel' | 'delete') =>
  screen.getByRole('button', { name: `opener-${kind}` });
const confirmCancel = () =>
  screen.getByRole('button', { name: d.close.cancel.confirm });
const confirmDelete = () =>
  screen.getByRole('button', { name: d.close.delete.confirm });
const reasonField = () =>
  screen.getByRole('textbox', { name: new RegExp(d.close.cancel.reasonLabel) });
const requests = () =>
  fetchSpy.mock.calls.map(([url, init]) => ({
    url: String(url),
    method: init?.method ?? 'GET',
    body: init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined,
  }));

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
beforeEach(() => {
  fetchSpy = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchSpy);
  queryClient = new QueryClient();
  queryClient.setQueryData(queryKeys.vacancy(ID), detail());
  queryClient.setQueryData(queryKeys.vacancyDraftCount(), { count: 4 });
  vi.clearAllMocks();
  leave.removed.mockImplementation(() => true);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useDraftClose: cancel [ux §6.3, §6.4, D113]', () => {
  it('the confirm button waits for a visible character; the reason is sent as typed, line breaks kept, and one toast follows the close', async () => {
    fetchSpy.mockResolvedValueOnce(
      json(200, detail({ status: 'CANCELLED', version: 4 })),
    );
    mount(draft());
    await userEvent.click(opener('cancel'));
    expect(confirmCancel().getAttribute('aria-disabled')).toBe('true');
    fireEvent.change(reasonField(), {
      target: { value: '  Дубль\nвакансії ' },
    });
    await userEvent.click(confirmCancel());

    await waitFor(() => expect(toast.success).toHaveBeenCalled(), {
      timeout: 3000,
    });
    expect(requests()).toEqual([
      {
        url: `/api/v1/vacancies/${ID}/cancel`,
        method: 'POST',
        body: { reason: 'Дубль\nвакансії' },
      },
    ]);
    expect(toast.success).toHaveBeenCalledWith(d.close.toast.cancelled, {
      description: 'V-0015 · Причину збережено в історії',
    });
    expect(leave.removed).toHaveBeenCalledWith(ID);
    expect(leave.settled).toHaveBeenCalledWith(ID);
    expect(queryClient.getQueryData(queryKeys.vacancyDraftCount())).toEqual({
      count: 3,
    });
    expect(
      screen.queryByRole('alertdialog', { name: d.close.cancel.title }),
    ).toBeNull();
  });

  it('the success toast still shows when the cache write throws, and the caches read the server again', async () => {
    fetchSpy.mockResolvedValueOnce(
      json(200, detail({ status: 'CANCELLED', version: 4 })),
    );
    leave.removed.mockImplementationOnce(() => {
      throw new Error('cache write failed');
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    mount(draft());
    await userEvent.click(opener('cancel'));
    fireEvent.change(reasonField(), { target: { value: 'Дубль' } });
    await userEvent.click(confirmCancel());

    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.vacancy(ID),
      }),
    );
  });

  it('a double press sends one request', async () => {
    fetchSpy.mockResolvedValueOnce(json(200, detail({ status: 'CANCELLED' })));
    mount(draft());
    await userEvent.click(opener('cancel'));
    fireEvent.change(reasonField(), { target: { value: 'Дубль' } });
    const button = confirmCancel();
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(toast.success).toHaveBeenCalled(), {
      timeout: 3000,
    });
    expect(requests()).toHaveLength(1);
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it('a character the server refuses stops the call and says so in the dialog', async () => {
    mount(draft());
    await userEvent.click(opener('cancel'));
    fireEvent.change(reasonField(), { target: { value: 'Дубль\u0000' } });
    await userEvent.click(confirmCancel());
    expect((await screen.findByRole('alert')).textContent).toBe(
      d.close.error.invalid,
    );
    expect(requests()).toEqual([]);
    expect((reasonField() as HTMLTextAreaElement).value).toBe('Дубль\u0000');
  });

  it.each([
    [
      '409 not a draft',
      problem(409, 'VACANCY_NOT_DRAFT'),
      messages.vacancies.draftErrors.notDraft,
    ],
    [
      '409 stale',
      problem(409, 'STALE_STATE'),
      messages.vacancies.draftErrors.stale,
    ],
    ['429', problem(429, 'RATE_LIMITED'), d.actions.toast.rateLimited],
    ['403', problem(403, 'FORBIDDEN'), d.actions.toast.forbidden],
    ['500', problem(500, 'INTERNAL'), d.close.error.failed],
    ['400', problem(400, 'VALIDATION_FAILED'), d.close.error.invalid],
  ])(
    '%s: the message stays inside the dialog and the typed reason is kept',
    async (_name, answer, text) => {
      fetchSpy.mockResolvedValueOnce(answer);
      mount(draft());
      await userEvent.click(opener('cancel'));
      fireEvent.change(reasonField(), { target: { value: 'Дубль' } });
      await userEvent.click(confirmCancel());
      expect((await screen.findByRole('alert')).textContent).toBe(text);
      expect((reasonField() as HTMLTextAreaElement).value).toBe('Дубль');
      expect(toast.success).not.toHaveBeenCalled();
      expect(leave.removed).not.toHaveBeenCalled();
      // The button works again: this is the retry.
      expect(confirmCancel().getAttribute('aria-disabled')).not.toBe('true');
    },
  );

  it('a conflict makes the data read again once the dialog is closed, not while the message is on screen', async () => {
    fetchSpy.mockResolvedValueOnce(problem(409, 'VACANCY_NOT_DRAFT'));
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    mount(draft());
    await userEvent.click(opener('cancel'));
    fireEvent.change(reasonField(), { target: { value: 'Дубль' } });
    await userEvent.click(confirmCancel());
    await screen.findByRole('alert');
    expect(invalidate).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole('button', { name: d.close.cancel.keep }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['vacancies'] });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.vacancy(ID),
    });
  });

  it('a lost answer: the message says so; the retry that meets 409 adopts the stored cancelled draft', async () => {
    fetchSpy
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(problem(409, 'VACANCY_NOT_DRAFT'))
      .mockResolvedValueOnce(
        json(200, detail({ status: 'CANCELLED', version: 4 })),
      );
    mount(draft());
    await userEvent.click(opener('cancel'));
    fireEvent.change(reasonField(), { target: { value: 'Дубль' } });
    await userEvent.click(confirmCancel());
    expect((await screen.findByRole('alert')).textContent).toBe(
      d.close.error.network,
    );
    await userEvent.click(confirmCancel());
    await waitFor(() => expect(toast.success).toHaveBeenCalled(), {
      timeout: 3000,
    });
    expect(requests().map(({ method }) => method)).toEqual([
      'POST',
      'POST',
      'GET',
    ]);
    expect(requests()[1]!.body).toEqual(requests()[0]!.body);
  });

  it('a changed reason after a lost answer keeps the conflict instead of claiming the new reason was saved', async () => {
    fetchSpy
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(problem(409, 'VACANCY_NOT_DRAFT'));
    mount(draft());
    await userEvent.click(opener('cancel'));
    fireEvent.change(reasonField(), { target: { value: 'Дубль' } });
    await userEvent.click(confirmCancel());
    expect((await screen.findByRole('alert')).textContent).toBe(
      d.close.error.network,
    );
    fireEvent.change(reasonField(), {
      target: { value: 'Потреба у вакансії зникла' },
    });
    await userEvent.click(confirmCancel());
    expect((await screen.findByRole('alert')).textContent).toBe(
      messages.vacancies.draftErrors.notDraft,
    );
    expect(requests().map(({ method }) => method)).toEqual(['POST', 'POST']);
    expect(requests()[1]!.body).toEqual({
      reason: 'Потреба у вакансії зникла',
    });
    expect(toast.success).not.toHaveBeenCalled();
    expect(leave.removed).not.toHaveBeenCalled();
    expect((reasonField() as HTMLTextAreaElement).value).toBe(
      'Потреба у вакансії зникла',
    );
  });

  it.each(['Потреба зникла', 'Дубль'])(
    'after two different uncertain writes a retry with %s cannot adopt either cancellation',
    async (retryReason) => {
      fetchSpy
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(problem(409, 'VACANCY_NOT_DRAFT'));
      mount(draft());
      await userEvent.click(opener('cancel'));
      fireEvent.change(reasonField(), { target: { value: 'Дубль' } });
      await userEvent.click(confirmCancel());
      expect((await screen.findByRole('alert')).textContent).toBe(
        d.close.error.network,
      );
      fireEvent.change(reasonField(), { target: { value: 'Потреба зникла' } });
      await userEvent.click(confirmCancel());
      expect((await screen.findByRole('alert')).textContent).toBe(
        d.close.error.network,
      );
      fireEvent.change(reasonField(), { target: { value: retryReason } });
      await userEvent.click(confirmCancel());
      expect((await screen.findByRole('alert')).textContent).toBe(
        messages.vacancies.draftErrors.notDraft,
      );
      expect(requests().map(({ method }) => method)).toEqual([
        'POST',
        'POST',
        'POST',
      ]);
      expect(toast.success).not.toHaveBeenCalled();
      fetchSpy
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(problem(409, 'VACANCY_NOT_DRAFT'));
      await userEvent.click(confirmCancel());
      expect((await screen.findByRole('alert')).textContent).toBe(
        d.close.error.network,
      );
      await userEvent.click(confirmCancel());
      expect((await screen.findByRole('alert')).textContent).toBe(
        messages.vacancies.draftErrors.notDraft,
      );
      expect(requests().every(({ method }) => method === 'POST')).toBe(true);
      expect(toast.success).not.toHaveBeenCalled();
    },
  );

  it.each([
    [429, 'RATE_LIMITED', d.actions.toast.rateLimited],
    [403, 'FORBIDDEN', d.actions.toast.forbidden],
  ] as const)(
    'an intervening %i cannot erase uncertainty about the original reason',
    async (status, code, message) => {
      fetchSpy
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(problem(status, code))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(problem(409, 'VACANCY_NOT_DRAFT'));
      mount(draft());
      await userEvent.click(opener('cancel'));
      fireEvent.change(reasonField(), { target: { value: 'Дубль' } });
      await userEvent.click(confirmCancel());
      expect((await screen.findByRole('alert')).textContent).toBe(
        d.close.error.network,
      );
      await userEvent.click(confirmCancel());
      expect((await screen.findByRole('alert')).textContent).toBe(message);
      fireEvent.change(reasonField(), { target: { value: 'Потреба зникла' } });
      await userEvent.click(confirmCancel());
      expect((await screen.findByRole('alert')).textContent).toBe(
        d.close.error.network,
      );
      await userEvent.click(confirmCancel());
      expect((await screen.findByRole('alert')).textContent).toBe(
        messages.vacancies.draftErrors.notDraft,
      );
      expect(requests().every(({ method }) => method === 'POST')).toBe(true);
      expect(toast.success).not.toHaveBeenCalled();
    },
  );

  it('404: the dialog closes, the toast says the draft is gone, the data reads again', async () => {
    fetchSpy.mockResolvedValueOnce(problem(404, 'NOT_FOUND'));
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    mount(draft());
    await userEvent.click(opener('cancel'));
    fireEvent.change(reasonField(), { target: { value: 'Дубль' } });
    await userEvent.click(confirmCancel());
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error.mock.calls[0]![0]).toBe(d.actions.toast.gone);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['vacancies'] });
    await waitFor(() =>
      expect(
        screen.queryByRole('alertdialog', { name: d.close.cancel.title }),
      ).toBeNull(),
    );
  });

  it('the list holds the row: the card rule stays out of it', async () => {
    fetchSpy.mockResolvedValueOnce(json(200, detail({ status: 'CANCELLED' })));
    const card = { removed: vi.fn(), restored: vi.fn() };
    mount(draft(), { card });
    await userEvent.click(opener('cancel'));
    fireEvent.change(reasonField(), { target: { value: 'Дубль' } });
    await userEvent.click(confirmCancel());
    await waitFor(() => expect(toast.success).toHaveBeenCalled(), {
      timeout: 3000,
    });
    expect(card.removed).not.toHaveBeenCalled();
  });

  it('the list does not hold the row (the card, or a row off the page): the card rule moves the focus', async () => {
    fetchSpy.mockResolvedValueOnce(json(200, detail({ status: 'CANCELLED' })));
    const card = { removed: vi.fn(), restored: vi.fn() };
    leave.removed.mockReturnValueOnce(false);
    mount(draft(), { card });
    await userEvent.click(opener('cancel'));
    fireEvent.change(reasonField(), { target: { value: 'Дубль' } });
    await userEvent.click(confirmCancel());
    await waitFor(() => expect(toast.success).toHaveBeenCalled(), {
      timeout: 3000,
    });
    expect(card.removed).toHaveBeenCalledOnce();
  });

  it('the result lands even when the row unmounts before the dialog reports its close', async () => {
    fetchSpy.mockResolvedValueOnce(json(200, detail({ status: 'CANCELLED' })));
    const view = mount(draft());
    await userEvent.click(opener('cancel'));
    fireEvent.change(reasonField(), { target: { value: 'Дубль' } });
    await userEvent.click(confirmCancel());
    await waitFor(() => expect(requests()).toHaveLength(1));
    view.unmount();
    await waitFor(() => expect(toast.success).toHaveBeenCalled(), {
      timeout: 3000,
    });
  });
});

describe('useDraftClose: delete [ux §6.3, §6.4, D112(1)]', () => {
  it('a draft: title, three consequences, no reason field; one DELETE, one toast, the list takes the row over', async () => {
    fetchSpy.mockResolvedValueOnce(json(200, { id: ID }));
    mount(draft());
    await userEvent.click(opener('delete'));
    expect(
      screen.getByRole('alertdialog', { name: d.close.delete.titleDraft }),
    ).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByRole('textbox')).toBeNull();
    await userEvent.click(confirmDelete());
    await waitFor(() => expect(toast.success).toHaveBeenCalled(), {
      timeout: 3000,
    });
    expect(requests()).toEqual([
      { url: `/api/v1/vacancies/${ID}`, method: 'DELETE', body: {} },
    ]);
    expect(toast.success).toHaveBeenCalledWith(d.close.toast.deletedDraft, {
      description: 'V-0015 · Медіабаєр — Facebook',
    });
    expect(leave.removed).toHaveBeenCalledWith(ID);
    expect(router.replace).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(queryKeys.vacancy(ID))).toBeUndefined();
  });

  it('a cancelled draft: its own title, no «скасуйте» hint, no count change', async () => {
    fetchSpy.mockResolvedValueOnce(json(200, { id: ID }));
    mount(draft('CANCELLED'));
    await userEvent.click(opener('delete'));
    expect(
      screen.getByRole('alertdialog', { name: d.close.delete.titleCancelled }),
    ).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    await userEvent.click(confirmDelete());
    await waitFor(() => expect(toast.success).toHaveBeenCalled(), {
      timeout: 3000,
    });
    expect(toast.success.mock.calls[0]![0]).toBe(
      d.close.toast.deletedCancelled,
    );
    expect(queryClient.getQueryData(queryKeys.vacancyDraftCount())).toEqual({
      count: 4,
    });
  });

  it('on the card the page returns to the list of its status, once', async () => {
    fetchSpy.mockResolvedValueOnce(json(200, { id: ID }));
    mount(draft('CANCELLED'), { withList: false });
    await userEvent.click(opener('delete'));
    const button = confirmDelete();
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(router.replace).toHaveBeenCalled(), {
      timeout: 3000,
    });
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(
      `/vacancies?status=CANCELLED&vertical=${VERTICAL}`,
    );
    expect(requests()).toHaveLength(1);
  });

  it('409 (it was opened meanwhile): inline message, nothing removed', async () => {
    fetchSpy.mockResolvedValueOnce(problem(409, 'VACANCY_NOT_DRAFT'));
    mount(draft('CANCELLED'));
    await userEvent.click(opener('delete'));
    await userEvent.click(confirmDelete());
    expect((await screen.findByRole('alert')).textContent).toBe(
      messages.vacancies.draftErrors.notDraft,
    );
    expect(leave.removed).not.toHaveBeenCalled();
  });
});
