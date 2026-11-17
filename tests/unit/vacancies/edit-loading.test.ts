// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ComponentProps, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EditVacancyLoading from '@/app/(app)/vacancies/[vacancyId]/edit/loading';
import { loadVacancy } from '@/app/(app)/vacancies/_lib/vacancy';
import { EditFormSkeleton } from '@/components/vacancies/edit-form-skeleton';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import type { AuthContext, ResolvedGrant } from '@/server/authz/context';
import type { PermissionCode } from '@/server/authz/permissions';
import type { UserId, VerticalId } from '@/server/authz/types';
import { requireSession } from '@/app/(app)/_lib/session';
import { headers } from 'next/headers';
import messages from '@/messages/uk.json';

vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('@/app/(app)/_lib/session', () => ({ requireSession: vi.fn() }));
vi.mock('@/app/(app)/vacancies/_lib/vacancy', () => ({
  loadVacancy: vi.fn(),
}));

const VERTICAL = '8b1f5a0e-0c2d-4f6e-9d7a-2b3c4d5e6f70' as VerticalId;
const OTHER_VERTICAL = '9c2a6b1f-1d3e-4a7f-8e8b-3c4d5e6f7081' as VerticalId;
const ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

const draft = (): VacancyDetail => ({
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
  updatedAt: '2026-11-16T12:05:00.000Z',
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
  version: 1,
  canChangeUrgency: false,
});

const grant = (
  verticalIds: ResolvedGrant['verticalIds'],
  kind: 'GLOBAL' | 'VERTICAL' = 'VERTICAL',
): ResolvedGrant => ({
  scope: kind === 'GLOBAL' ? { kind: 'GLOBAL' } : { kind: 'VERTICAL' },
  verticalIds,
});

const session = (
  grants: readonly [PermissionCode, ResolvedGrant][],
): { auth: AuthContext } =>
  ({
    auth: {
      userId: 'user-1' as UserId,
      grants: new Map(grants.map(([code, one]) => [code, [one]])),
      aal: 'aal2',
      mfaRequired: false,
      mfaWithheld: new Set(),
      timezone: 'Europe/Kyiv',
    },
  }) as { auth: AuthContext };

/** A Recruiter of the draft's vertical: the loading boundary only lends its heading to an author (same gate as the layout and the page). */
const AUTHOR: readonly [PermissionCode, ResolvedGrant][] = [
  ['vacancy.create', grant([VERTICAL])],
  ['vacancy.self_assign', grant([VERTICAL])],
];

const asRoute = (path: string | null) =>
  vi
    .mocked(headers)
    .mockResolvedValue(
      new Headers(path === null ? {} : { 'x-pathname': path }) as never,
    );

const view = (element: ReactElement) =>
  render(
    createElement(NextIntlClientProvider, {
      locale: 'uk',
      timeZone: 'Europe/Kyiv',
      messages,
      children: element,
    }),
  );

const t = messages.vacancyForm.edit;

beforeEach(() => {
  vi.mocked(requireSession).mockResolvedValue(session(AUTHOR) as never);
  vi.mocked(loadVacancy).mockResolvedValue(draft() as never);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('edit loading boundary reads the draft from the request path [S3.3, ux §5]', () => {
  it.each([
    ['plain path', `/vacancies/${ID}/edit`],
    ['trailing slash', `/vacancies/${ID}/edit/`],
    ['query string', `/vacancies/${ID}/edit?from=list`],
    ['upper-case id', `/vacancies/${ID.toUpperCase()}/edit`],
  ])(
    '%s: loads that draft and shows its heading and subtitle',
    async (_n, path) => {
      asRoute(path);
      view(await EditVacancyLoading());
      expect(vi.mocked(loadVacancy)).toHaveBeenCalledWith(
        path.split('?')[0]!.replace(/\/$/, '').split('/')[2],
      );
      expect(
        screen.getByRole('heading', { level: 1, name: t.title }),
      ).toBeTruthy();
      expect(
        screen.getByText(
          /^V-0015 · Гемблінг · Чернетка · Збережено 16\.11\.2026, \d{2}:\d{2}$/,
        ),
      ).toBeTruthy();
    },
  );

  it.each([
    ['no x-pathname header', null],
    ['the card path', `/vacancies/${ID}`],
    ['a malformed id', '/vacancies/not-a-uuid/edit'],
    ['another route', `/vacancies/${ID}/edit/extra`],
  ])(
    '%s: loads nothing and still draws the real heading without a subtitle',
    async (_n, path) => {
      asRoute(path);
      view(await EditVacancyLoading());
      expect(vi.mocked(loadVacancy)).not.toHaveBeenCalled();
      expect(
        screen.getByRole('heading', { level: 1, name: t.title }),
      ).toBeTruthy();
      expect(screen.queryByText(/V-0015/)).toBeNull();
    },
  );

  it('a draft that cannot be loaded draws the heading without a subtitle', async () => {
    asRoute(`/vacancies/${ID}/edit`);
    vi.mocked(loadVacancy).mockResolvedValue(null);
    view(await EditVacancyLoading());
    expect(
      screen.getByRole('heading', { level: 1, name: t.title }),
    ).toBeTruthy();
    expect(screen.queryByText(/V-0015/)).toBeNull();
  });

  it('a caller who may read the vacancy but not author in its vertical gets the heading without the subtitle [security F1]', async () => {
    asRoute(`/vacancies/${ID}/edit`);
    vi.mocked(requireSession).mockResolvedValue(
      session([['vacancy.create', grant([OTHER_VERTICAL])]]) as never,
    );
    view(await EditVacancyLoading());
    expect(
      screen.getByRole('heading', { level: 1, name: t.title }),
    ).toBeTruthy();
    expect(screen.queryByText(/V-0015/)).toBeNull();
  });

  it('passes the form grants of the draft’s own vertical, not of any vertical', async () => {
    asRoute(`/vacancies/${ID}/edit`);
    vi.mocked(requireSession).mockResolvedValue(
      session([
        ...AUTHOR,
        ['vacancy.team_lead.set', grant([OTHER_VERTICAL])],
        ['vacancy.probation_length.set', grant('ALL')],
      ]) as never,
    );
    const element = (await EditVacancyLoading()) as ReactElement<
      ComponentProps<typeof EditFormSkeleton>
    >;
    expect(element.type).toBe(EditFormSkeleton);
    expect(element.props).toMatchObject({
      withTeamLead: false,
      withProbation: false,
    });
  });

  it('a Team Lead grant in the draft’s vertical and a global probation grant show both rows', async () => {
    asRoute(`/vacancies/${ID}/edit`);
    vi.mocked(requireSession).mockResolvedValue(
      session([
        ...AUTHOR,
        ['vacancy.team_lead.set', grant([VERTICAL])],
        ['vacancy.probation_length.set', grant('ALL', 'GLOBAL')],
      ]) as never,
    );
    const element = (await EditVacancyLoading()) as ReactElement<
      ComponentProps<typeof EditFormSkeleton>
    >;
    expect(element.props).toMatchObject({
      withTeamLead: true,
      withProbation: true,
    });
  });
});
