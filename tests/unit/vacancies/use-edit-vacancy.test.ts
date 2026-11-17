// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, useRef, type RefObject } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FILLED_FIELDS,
  useEditVacancy,
} from '@/components/vacancies/use-edit-vacancy';
import { useVacancyResolver } from '@/components/vacancies/use-vacancy-resolver';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import { vacancyFormValues } from '@/lib/vacancy-edit-form';
import type { VacancyFormMode, VacancyFormValues } from '@/lib/vacancy-form';
import messages from '@/messages/uk.json';

const { router, toast } = vi.hoisted(() => ({
  router: { replace: vi.fn(), refresh: vi.fn() },
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/toast', () => ({ toast }));

const VERTICAL = '8b1f5a0e-0c2d-4f6e-9d7a-2b3c4d5e6f70';
const POSITION = '3f1e2d3c-4b5a-4968-8776-655443322110';
const ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const DETAIL_URL = `/api/v1/vacancies/${ID}`;
const t = messages.vacancyForm;

const draft = (changes: Partial<VacancyDetail> = {}): VacancyDetail => ({
  id: ID,
  number: 'V-0015',
  title: 'Медіабаєр — Facebook',
  vertical: { id: VERTICAL, name: 'Гемблінг' },
  position: { id: POSITION, name: 'Медіабаєр — Facebook' },
  teamLead: null,
  recruiters: [],
  status: 'DRAFT',
  priority: 'NORMAL',
  source: 'APP',
  openedAt: null,
  createdAt: '2026-11-16T08:00:00.000Z',
  updatedAt: '2026-11-16T08:00:00.000Z',
  headcount: 3,
  seniority: null,
  workFormat: null,
  employmentType: null,
  location: 'Київ',
  salaryMinMinor: null,
  salaryMaxMinor: null,
  salaryCurrency: null,
  probationDays: 90,
  recruiterInitiated: true,
  version: 3,
  ...changes,
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const problem = (status: number, code: string) =>
  json(status, { code, errors: [] });

interface Probe {
  form: UseFormReturn<VacancyFormValues>;
  edit: ReturnType<typeof useEditVacancy>;
  dirty: boolean;
}

function Harness({ onRender }: { onRender: (probe: Probe) => void }) {
  const mode = useRef<VacancyFormMode>('DRAFT');
  const guard = useRef(null);
  const form = useForm<VacancyFormValues>({
    resolver: useVacancyResolver(mode, FILLED_FIELDS),
    mode: 'onTouched',
    defaultValues: vacancyFormValues(draft(), false),
  });
  const edit = useEditVacancy({
    form,
    modeRef: mode,
    guard: guard as RefObject<null>,
    vacancy: draft(),
    shown: { teamLead: false, probation: false },
  });
  onRender({ form, edit, dirty: form.formState.isDirty });
  // Reads subscribe the form to the state the assertions look at.
  void form.formState.errors;
  return null;
}

let fetchSpy: ReturnType<typeof vi.fn<typeof fetch>>;
let queryClient: QueryClient;
let latest: Probe | null = null;
const current = () => latest!;

async function mount() {
  render(
    createElement(NextIntlClientProvider, {
      locale: 'uk',
      timeZone: 'Europe/Kyiv',
      messages,
      children: createElement(QueryClientProvider, {
        client: queryClient,
        children: createElement(Harness, {
          onRender: (probe) => {
            latest = probe;
          },
        }),
      }),
    }),
  );
  await waitFor(() => expect(current().edit.lib).not.toBeNull());
}

const answers = (...list: Response[]) => {
  for (const answer of list) fetchSpy.mockResolvedValueOnce(answer);
};
const calls = () =>
  fetchSpy.mock.calls.map(([url, init]) => ({
    url: String(url),
    method: init?.method ?? 'GET',
    body: init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined,
  }));

const press = async (action: VacancyFormMode) => {
  await act(async () => {
    current().edit.submit(action);
  });
};
const type = (field: keyof VacancyFormValues, value: string) =>
  act(async () => {
    current().form.setValue(field, value, { shouldDirty: true });
  });
const lastToast = (kind: 'error' | 'warning' | 'success') =>
  toast[kind].mock.calls.at(-1) as [
    string,
    { action?: { label: string; onAction: () => void }; id?: string },
  ];

beforeEach(() => {
  fetchSpy = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchSpy);
  queryClient = new QueryClient();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('useEditVacancy: what the form does after each answer [S3.3 review]', () => {
  it('adopts the saved draft when the publish is refused after a good save: clean form, flagged field, next publish uses the new version', async () => {
    await mount();
    await type('location', 'Харків');
    answers(
      json(200, draft({ location: 'Харків', version: 4 })),
      problem(409, 'POSITION_INACTIVE'),
    );
    await press('PUBLISH');
    await waitFor(() =>
      expect(current().form.formState.errors.positionId?.message).toBe(
        'positionInactive',
      ),
    );
    expect(current().dirty).toBe(false);
    expect(current().form.getValues('location')).toBe('Харків');
    expect(current().edit.baseline.version).toBe(4);
    expect(calls().map(({ method }) => method)).toEqual(['PATCH', 'POST']);
    expect(lastToast('error')[0]).toBe(messages.vacancyForm.edit.toast.refused);

    answers(json(200, { ...draft({ version: 5 }), status: 'OPEN' }));
    await press('PUBLISH');
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(`/vacancies/${ID}`),
    );
    expect(calls().at(-1)).toMatchObject({
      method: 'POST',
      body: { expectedVersion: 4 },
    });
  });

  it('reloads the stored draft after a stale answer: the form takes its values and the next save carries its version', async () => {
    await mount();
    await type('location', 'Харків');
    answers(
      problem(409, 'STALE_STATE'),
      json(200, draft({ location: 'Одеса', version: 5 })),
    );
    await press('DRAFT');
    await waitFor(() => expect(current().edit.stale).toBe(true));
    expect(lastToast('warning')[1].id).toBe(`stale:vacancy:${ID}`);
    expect(current().form.getValues('location')).toBe('Харків');

    answers(json(200, draft({ location: 'Одеса', version: 6 })));
    await act(async () => {
      await current().edit.reloadLatest();
    });
    expect(current().form.getValues('location')).toBe('Одеса');
    expect(current().edit.baseline.version).toBe(6);
    expect(current().edit.stale).toBe(false);

    await type('location', 'Дніпро');
    answers(json(200, draft({ location: 'Дніпро', version: 7 })));
    await press('DRAFT');
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(calls().at(-1)).toMatchObject({
      method: 'PATCH',
      body: { location: 'Дніпро', expectedVersion: 6 },
    });
  });

  it('a draft that was published elsewhere refreshes the page into the not-a-draft state, no toast', async () => {
    await mount();
    await type('location', 'Харків');
    answers(problem(409, 'VACANCY_NOT_DRAFT'));
    await press('DRAFT');
    await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce());
    expect(toast.error).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('a reload that finds the draft already published refreshes the page too', async () => {
    await mount();
    await type('location', 'Харків');
    answers(
      problem(409, 'STALE_STATE'),
      json(200, draft({ location: 'Одеса', version: 5 })),
    );
    await press('DRAFT');
    await waitFor(() => expect(current().edit.stale).toBe(true));
    answers(json(200, { ...draft({ version: 6 }), status: 'OPEN' }));
    await act(async () => {
      await current().edit.reloadLatest();
    });
    expect(router.refresh).toHaveBeenCalledOnce();
    expect(current().form.getValues('location')).toBe('Харків');
  });

  it('the «Повторити» of a failed reload runs the reload again, never the save', async () => {
    await mount();
    await type('location', 'Харків');
    answers(
      problem(409, 'STALE_STATE'),
      json(200, draft({ location: 'Одеса', version: 5 })),
    );
    await press('DRAFT');
    await waitFor(() => expect(current().edit.stale).toBe(true));

    answers(problem(500, 'INTERNAL'));
    await act(async () => {
      await current().edit.reloadLatest();
    });
    const [title, options] = lastToast('error');
    expect(title).toBe(t.toast.failed);
    expect(options.action?.label).toBe(t.toast.retry);
    const before = calls().length;

    answers(json(200, draft({ location: 'Одеса', version: 6 })));
    await act(async () => {
      options.action!.onAction();
    });
    await waitFor(() => expect(current().edit.baseline.version).toBe(6));
    expect(calls().slice(before)).toEqual([
      { url: DETAIL_URL, method: 'GET', body: undefined },
    ]);
    expect(current().form.getValues('location')).toBe('Одеса');
  });

  it('the «Повторити» of a failed save runs the save again with the same change', async () => {
    await mount();
    await type('location', 'Харків');
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await press('DRAFT');
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const [title, options] = lastToast('error');
    expect(title).toBe(t.toast.noConnection);

    answers(json(200, draft({ location: 'Харків', version: 4 })));
    await act(async () => {
      options.action!.onAction();
    });
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(calls().map(({ method }) => method)).toEqual(['PATCH', 'PATCH']);
  });

  it('a retry after a lost answer finds the change stored and finishes as a save, with no stale warning [BUG-S3-5]', async () => {
    await mount();
    await type('location', 'Харків');
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await press('DRAFT');
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const { action } = lastToast('error')[1];

    answers(
      problem(409, 'STALE_STATE'),
      json(200, draft({ location: 'Харків', version: 4 })),
    );
    await act(async () => {
      action!.onAction();
    });
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(toast.warning).not.toHaveBeenCalled();
    expect(current().edit.stale).toBe(false);
    expect(lastToast('success')[0]).toBe(t.toast.draftSaved);
    expect(String(router.replace.mock.calls[0]![0])).toContain('status=DRAFT');
  });

  it.each([
    ['headcount', '', 'headcountRange'],
    ['headcount', '0', 'headcountRange'],
  ] as const)(
    'a cleared %s is a required-field error and nothing is sent [S3.3 review]',
    async (field, value, code) => {
      await mount();
      await type(field, value);
      await press('DRAFT');
      await waitFor(() =>
        expect(current().form.formState.errors[field]?.message).toBe(code),
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it('fields stay locked while a reload runs, and a press during it is ignored', async () => {
    await mount();
    let release = () => {};
    fetchSpy.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(json(200, draft({ version: 4 })));
        }),
    );
    let reload: Promise<void> = Promise.resolve();
    await act(async () => {
      reload = current().edit.reloadLatest();
    });
    await waitFor(() => expect(current().edit.pending).toBe(true));
    await press('DRAFT');
    expect(fetchSpy).toHaveBeenCalledOnce();
    await act(async () => {
      release();
      await reload;
    });
    expect(current().edit.pending).toBe(false);
  });
});
