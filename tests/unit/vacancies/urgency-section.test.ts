// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VacancyOverview } from '@/components/vacancies/vacancy-overview';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import messages from '@/messages/uk.json';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) =>
    createElement('a', { href }, children),
}));
const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));
vi.mock('@/lib/toast', () => ({ toast }));

const ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const t = messages.vacancies.urgency;

const detail = (overrides: Partial<VacancyDetail> = {}): VacancyDetail => ({
  id: ID,
  number: 'V-0007',
  title: 'Медіабаєр — Facebook',
  vertical: { id: '8b1f5a0e-0c2d-4f6e-9d7a-2b3c4d5e6f70', name: 'Гемблінг' },
  position: null,
  teamLead: null,
  recruiters: [],
  status: 'OPEN',
  priority: 'NORMAL',
  source: 'APP',
  openedAt: '2026-10-22T09:00:00.000Z',
  createdAt: '2026-10-18T09:00:00.000Z',
  updatedAt: '2026-10-22T09:00:00.000Z',
  headcount: 2,
  seniority: null,
  workFormat: null,
  employmentType: null,
  location: null,
  salaryMinMinor: null,
  salaryMaxMinor: null,
  salaryCurrency: null,
  probationDays: 90,
  recruiterInitiated: false,
  version: 3,
  canChangeUrgency: true,
  canSelfAssign: false,
  canAssignRecruiters: false,
  canSetTeamLead: false,
  statusActions: [],
  needsMfa: false,
  ...overrides,
});

let queryClient: QueryClient;
let fetchSpy: ReturnType<typeof vi.fn<typeof fetch>>;

function wrap(vacancy: VacancyDetail, preview = false) {
  return createElement(NextIntlClientProvider, {
    locale: 'uk',
    timeZone: 'Europe/Kyiv',
    messages,
    onError: (error) => {
      throw error;
    },
    children: createElement(QueryClientProvider, {
      client: queryClient,
      children: createElement(VacancyOverview, { vacancy, preview }),
    }),
  });
}
const group = () => screen.findByRole('radiogroup', { name: t.label });

beforeEach(() => {
  fetchSpy = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchSpy);
  queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('«Терміновість» section of VacancyOverview [STORY-VAC-08-2]', () => {
  it.each([
    ['without the grant (Team Lead, Recruiter, HR, Finance)', false, 'OPEN'],
    ['for a closed vacancy', false, 'FILLED'],
    ['for an own draft', false, 'DRAFT'],
  ] as const)(
    'renders no section, no row and no control %s',
    (_name, canChangeUrgency, status) => {
      render(wrap(detail({ canChangeUrgency, status })));
      expect(screen.queryByText(t.title)).toBeNull();
      expect(screen.queryByText(t.label)).toBeNull();
      expect(screen.queryByRole('radiogroup')).toBeNull();
      expect(screen.queryByText(t.hint)).toBeNull();
    },
  );

  it.each([
    ['the card', false, 'H2'],
    ['the preview', true, 'H3'],
  ] as const)(
    'renders heading, labelled group, two options and the helper on %s',
    async (_name, preview, tag) => {
      render(wrap(detail({ priority: 'URGENT' }), preview));
      const heading = screen.getByText(t.title, { selector: 'h2, h3' });
      expect(heading.tagName).toBe(tag);
      const radios = await group();
      expect(radios.getAttribute('aria-describedby')).toBeTruthy();
      expect(screen.getByLabelText(t.URGENT)).toHaveProperty('checked', true);
      expect(screen.getByLabelText(t.NORMAL)).toHaveProperty('checked', false);
      expect(screen.getByText(t.hint)).toBeTruthy();
      expect(radios.getAttribute('aria-busy')).toBeNull();
    },
  );

  it('one press on the other option sends one request and turns the card at once', async () => {
    queryClient.setQueryData(queryKeys.vacancy(ID), detail());
    let finish!: (response: Response) => void;
    fetchSpy.mockReturnValueOnce(
      new Promise<Response>((done) => {
        finish = done;
      }),
    );
    const view = render(wrap(detail()));
    await group();
    await userEvent.click(screen.getByLabelText(t.URGENT));
    await waitFor(() =>
      expect(
        queryClient.getQueryData<VacancyDetail>(queryKeys.vacancy(ID))
          ?.priority,
      ).toBe('URGENT'),
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    view.rerender(
      wrap(
        queryClient.getQueryData<VacancyDetail>(queryKeys.vacancy(ID)) ??
          detail(),
      ),
    );
    expect((await group()).getAttribute('aria-busy')).toBe('true');
    expect(screen.getByLabelText(t.URGENT)).toHaveProperty('checked', true);
    await userEvent.click(screen.getByLabelText(t.NORMAL));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    finish(
      new Response(JSON.stringify(detail({ priority: 'URGENT', version: 4 })), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
  });

  it('moves focus to the next heading when the section leaves under the focus', async () => {
    const view = render(wrap(detail()));
    const radios = await group();
    const checked = radios.querySelector<HTMLInputElement>('input:checked')!;
    checked.focus();
    expect(document.activeElement).toBe(checked);
    view.rerender(wrap(detail({ canChangeUrgency: false, status: 'FILLED' })));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByText(messages.vacancies.teamTitle),
      ),
    );
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('leaves focus alone when the section leaves without it', async () => {
    const view = render(wrap(detail()));
    await group();
    view.rerender(wrap(detail({ canChangeUrgency: false, status: 'FILLED' })));
    expect(document.activeElement).toBe(document.body);
  });
});
