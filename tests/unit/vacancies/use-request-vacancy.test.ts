// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, useRef } from 'react';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { useRequestVacancy } from '@/components/vacancies/use-request-vacancy';
import type { LeaveGuardHandle } from '@/components/ui/use-leave-guard';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import messages from '@/messages/uk.json';

const { router, toast } = vi.hoisted(() => ({
  router: { replace: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/toast', () => ({ toast }));

beforeAll(() => import('@/lib/vacancy-request-submit'));

const POSITION = '3f1e2d3c-4b5a-4968-8776-655443322110';
const OTHER_POSITION = '4a2f3e4d-5c6b-4a79-9887-766554433221';
const ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const copy = messages.vacancyRequest;

const created = (): VacancyDetail => ({
  id: ID,
  number: 'V-0015',
  title: 'Медіабаєр — Facebook',
  vertical: { id: '8b1f5a0e-0c2d-4f6e-9d7a-2b3c4d5e6f70', name: 'Гемблінг' },
  position: { id: POSITION, name: 'Медіабаєр — Facebook' },
  teamLead: null,
  recruiters: [],
  status: 'OPEN',
  priority: 'URGENT',
  source: 'APP',
  openedAt: '2026-11-16T08:00:00.000Z',
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
  recruiterInitiated: false,
  version: 1,
  canChangeUrgency: false,
  canSelfAssign: false,
  canAssignRecruiters: false,
  canSetTeamLead: false,
  statusActions: [],
  needsMfa: false,
});
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const problem = (
  status: number,
  code: string,
  errors: { path: string; code: string }[] = [],
) => json(status, { code, errors });

let release: ReturnType<typeof vi.fn<() => void>>;
let latest: ReturnType<typeof useRequestVacancy> | null = null;
const current = () => latest!;

function Harness({
  onRender,
}: {
  onRender: (value: ReturnType<typeof useRequestVacancy>) => void;
}) {
  const guard = useRef<LeaveGuardHandle>({ release });
  onRender(useRequestVacancy(guard));
  return null;
}

let fetchSpy: ReturnType<typeof vi.fn<typeof fetch>>;
let queryClient: QueryClient;

const mount = () =>
  render(
    createElement(NextIntlClientProvider, {
      locale: 'uk',
      timeZone: 'Europe/Kyiv',
      messages,
      children: createElement(QueryClientProvider, {
        client: queryClient,
        children: createElement(Harness, {
          onRender: (value) => {
            latest = value;
          },
        }),
      }),
    }),
  );
const answers = (...list: Response[]) => {
  for (const answer of list) fetchSpy.mockResolvedValueOnce(answer);
};
const posts = () =>
  fetchSpy.mock.calls.map(([url, init]) => ({
    url: String(url),
    key: (init?.headers as Record<string, string>)['Idempotency-Key'],
    body: JSON.parse(String(init?.body)) as unknown,
  }));
const fill = () =>
  act(async () => {
    current().change('positionId', POSITION);
    current().change('priority', 'URGENT');
    current().change('comment', 'Потрібен досвід з Facebook Ads');
  });
const press = () =>
  act(async () => {
    current().submit();
    await Promise.resolve();
  });
const failedToast = () =>
  toast.error.mock.calls.at(-1) as [
    string,
    { id: string; action?: { label: string; onAction: () => void } },
  ];

beforeEach(() => {
  release = vi.fn<() => void>();
  fetchSpy = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchSpy);
  queryClient = new QueryClient();
  latest = null;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('useRequestVacancy [STORY-VAC-03-3]', () => {
  it('a double press sends one request with one key and the form stays locked after success', async () => {
    mount();
    await fill();
    answers(json(201, created()));
    await act(async () => {
      current().submit();
      current().submit();
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(`/vacancies/${ID}`),
    );
    expect(posts()).toHaveLength(1);
    expect(posts()[0]).toMatchObject({
      url: '/api/v1/vacancies/request',
      body: {
        positionId: POSITION,
        headcount: 1,
        priority: 'URGENT',
        comment: 'Потрібен досвід з Facebook Ads',
      },
    });
    expect(posts()[0]?.key).toMatch(/^[\w-]{16,}$/);
    expect(release).toHaveBeenCalledOnce();
    expect(release.mock.invocationCallOrder[0]).toBeLessThan(
      router.replace.mock.invocationCallOrder[0]!,
    );
    expect(toast.success).toHaveBeenCalledWith(copy.success);
    expect(current().pending).toBe(true);
    await press();
    expect(posts()).toHaveLength(1);
  });

  it('seeds the card cache and refreshes vacancy lists and position counters', async () => {
    mount();
    await fill();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    answers(json(201, created()));
    await press();
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(queryClient.getQueryData(queryKeys.vacancy(ID))).toMatchObject({
      id: ID,
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.vacanciesAll(),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.positionsAll(),
    });
  });

  it('an invalid form sends nothing and flags the fields', async () => {
    mount();
    await act(async () => {
      current().change('headcount', '0');
    });
    await press();
    await waitFor(() =>
      expect(current().errors).toEqual({
        positionId: 'positionRequired',
        headcount: 'headcountRange',
      }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(current().summary).toBe(1);
    expect(current().pending).toBe(false);
  });

  it('a 5xx keeps the input and the retry repeats the same request with the same key', async () => {
    mount();
    await fill();
    answers(problem(500, 'INTERNAL'), json(201, created()));
    await press();
    await waitFor(() => expect(current().notice).toBe('failed'));
    expect(failedToast()[0]).toBe(copy.errors.failed);
    expect(failedToast()[1]).toMatchObject({
      id: 'vacancy-request-error',
      action: { label: copy.retry },
    });
    expect(current().values.comment).toBe('Потрібен досвід з Facebook Ads');
    expect(current().pending).toBe(false);
    await act(async () => failedToast()[1].action?.onAction());
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(posts()).toHaveLength(2);
    expect(posts()[1]?.key).toBe(posts()[0]?.key);
  });

  it('a network failure keeps the input and a changed body gets a new key', async () => {
    mount();
    await fill();
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    answers(json(201, created()));
    await press();
    await waitFor(() => expect(current().notice).toBe('network'));
    expect(failedToast()[0]).toBe(copy.errors.network);
    await act(async () => current().change('headcount', '2'));
    await press();
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(posts()[1]?.key).not.toBe(posts()[0]?.key);
    expect(posts()[1]?.body).toMatchObject({ headcount: 2 });
  });

  it('an inactive position becomes a field error and the same selection is not sent again', async () => {
    mount();
    await fill();
    answers(
      problem(400, 'VALIDATION_FAILED', [
        { path: 'body.positionId', code: 'position_inactive' },
      ]),
    );
    await press();
    await waitFor(() =>
      expect(current().errors.positionId).toBe('positionUnavailable'),
    );
    expect(current().pending).toBe(false);
    await press();
    expect(posts()).toHaveLength(1);
    answers(json(201, created()));
    await act(async () => current().change('positionId', OTHER_POSITION));
    await press();
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(posts()[1]?.body).toMatchObject({ positionId: OTHER_POSITION });
  });

  it('a blur after a server-refused position keeps the unavailable error', async () => {
    mount();
    await fill();
    answers(
      problem(400, 'VALIDATION_FAILED', [
        { path: 'body.positionId', code: 'position_inactive' },
      ]),
    );
    await press();
    await waitFor(() =>
      expect(current().errors.positionId).toBe('positionUnavailable'),
    );
    await act(async () => {
      current().validateField('positionId');
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(current().errors.positionId).toBe('positionUnavailable'),
    );
  });

  it('a 404 shows an unavailable position without saying why', async () => {
    mount();
    await fill();
    answers(problem(404, 'NOT_FOUND'));
    await press();
    await waitFor(() =>
      expect(current().errors.positionId).toBe('positionUnavailable'),
    );
    expect(current().notice).toBeNull();
  });

  it('a 403 blocks further sends and offers no retry action', async () => {
    mount();
    await fill();
    answers(problem(403, 'FORBIDDEN'));
    await press();
    await waitFor(() => expect(current().notice).toBe('forbidden'));
    expect(failedToast()[1].action).toBeUndefined();
    await press();
    expect(posts()).toHaveLength(1);
  });

  it('a 429 keeps the input and offers no automatic retry action', async () => {
    mount();
    await fill();
    answers(problem(429, 'RATE_LIMITED'));
    await press();
    await waitFor(() => expect(current().notice).toBe('rateLimited'));
    expect(failedToast()[1].action).toBeUndefined();
    expect(current().pending).toBe(false);
    expect(current().values.positionId).toBe(POSITION);
  });

  it('a success after unmount still fills the caches but neither toasts nor navigates', async () => {
    const view = mount();
    await fill();
    let finish: (response: Response) => void = () => undefined;
    fetchSpy.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    );
    await press();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    view.unmount();
    await act(async () => finish(json(201, created())));
    await waitFor(() =>
      expect(queryClient.getQueryData(queryKeys.vacancy(ID))).toMatchObject({
        id: ID,
      }),
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('is dirty only while a field differs from its initial value', async () => {
    mount();
    expect(current().dirty).toBe(false);
    await act(async () => current().change('headcount', '2'));
    expect(current().dirty).toBe(true);
    await act(async () => current().change('headcount', '1'));
    expect(current().dirty).toBe(false);
  });
});
