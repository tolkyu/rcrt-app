import { describe, expect, it } from 'vitest';
import { vacancyFormValues } from '@/lib/vacancy-edit-form';
import { isNeverOpenedCancelled } from '@/server/authz/vacancy-author';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import {
  hasRowMenu,
  isPrivateDraft,
  ownDraftActions,
  vacancyEditHref,
} from '@/lib/vacancy-draft-actions';
import { publishBlocker } from '@/lib/vacancy-publish-rule';
import { parseVacancyForm } from '@/lib/vacancy-form-parse';

const POSITION = {
  id: '3f1e2d3c-4b5a-4968-8776-655443322110',
  name: 'Медіабаєр',
};
const draft = (changes: Partial<VacancyDetail> = {}): VacancyDetail => ({
  id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  number: 'V-0015',
  title: 'Медіабаєр — Facebook',
  vertical: { id: '8b1f5a0e-0c2d-4f6e-9d7a-2b3c4d5e6f70', name: 'Гемблінг' },
  position: POSITION,
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
  version: 1,
  ...changes,
});

describe('ownDraftActions: who sees the draft actions [D92, D98]', () => {
  const cases: [string, Partial<VacancyDetail>, boolean, unknown][] = [
    ['an own draft with a position', {}, true, { publishBlocked: null }],
    [
      'an own draft without a position',
      { position: null },
      true,
      { publishBlocked: 'positionRequired' },
    ],
    ['a viewer who authors nowhere', {}, false, null],
    ['an open vacancy', { status: 'OPEN' }, true, null],
    [
      'a cancelled draft (S3.5 owns its menu)',
      { status: 'CANCELLED' },
      true,
      null,
    ],
    ['a filled vacancy', { status: 'FILLED' }, true, null],
    ['a vacancy on hold', { status: 'ON_HOLD' }, true, null],
  ];
  it.each(cases)('%s', (_name, changes, canAuthorDrafts, expected) => {
    expect(ownDraftActions(draft(changes), canAuthorDrafts)).toEqual(expected);
  });

  it('the edit link is the edit page of that draft', () => {
    expect(vacancyEditHref('abc')).toBe('/vacancies/abc/edit');
  });
});

describe('publishBlocker agrees with the PUBLISH contract the server and the form use', () => {
  const stored: [string, Partial<VacancyDetail>][] = [
    ['complete draft', {}],
    ['no position', { position: null }],
    [
      'position, team lead and salary',
      {
        teamLead: {
          id: '5d2c7e90-1f3a-4b8c-9a6d-7e8f90a1b2c3',
          fullName: 'Василь',
          isActive: true,
        },
        salaryMinMinor: '100000',
        salaryMaxMinor: '200000',
        salaryCurrency: 'USD',
      },
    ],
    [
      'no position, urgent, location',
      { position: null, priority: 'URGENT', location: 'Київ' },
    ],
    ['longest valid title', { title: 'А'.repeat(200) }],
    ['shortest valid title', { title: 'Ab' }],
    ['headcount 100', { headcount: 100 }],
  ];
  it.each(stored)('%s', (_name, changes) => {
    const vacancy = draft(changes);
    const parsed = parseVacancyForm(
      vacancyFormValues(vacancy, false),
      'PUBLISH',
    );
    expect(publishBlocker(vacancy) === null).toBe(parsed.ok);
    if (!parsed.ok)
      expect(parsed.errors).toEqual({ positionId: publishBlocker(vacancy) });
  });
});

describe('isPrivateDraft: nothing about a private draft can be shared [D92, D112]', () => {
  const cases: [string, Partial<VacancyDetail>, boolean][] = [
    ['a draft', {}, true],
    [
      'a draft that was cancelled before it ever opened',
      { status: 'CANCELLED', openedAt: null },
      true,
    ],
    [
      'a vacancy cancelled after it was open',
      { status: 'CANCELLED', openedAt: '2026-11-10T09:00:00.000Z' },
      false,
    ],
    [
      'an open vacancy',
      { status: 'OPEN', openedAt: '2026-11-10T09:00:00.000Z' },
      false,
    ],
    [
      'a filled vacancy',
      { status: 'FILLED', openedAt: '2026-11-10T09:00:00.000Z' },
      false,
    ],
    [
      'a vacancy on hold',
      { status: 'ON_HOLD', openedAt: '2026-11-10T09:00:00.000Z' },
      false,
    ],
  ];
  it.each(cases)('%s', (_name, changes, expected) => {
    expect(isPrivateDraft(draft(changes))).toBe(expected);
  });
});

describe('hasRowMenu follows ownDraftActions', () => {
  it('only an own draft of an author has a menu (and the mobile title room for it)', () => {
    expect(hasRowMenu(draft(), true)).toBe(true);
    expect(hasRowMenu(draft(), false)).toBe(false);
    expect(hasRowMenu(draft({ status: 'OPEN' }), true)).toBe(false);
    expect(hasRowMenu(draft({ status: 'CANCELLED' }), true)).toBe(false);
  });
});

describe('isPrivateDraft agrees with the server predicate for every status and opening date', () => {
  const statuses = ['DRAFT', 'OPEN', 'ON_HOLD', 'FILLED', 'CANCELLED'] as const;
  const dates = [null, '2026-11-10T09:00:00.000Z'] as const;
  for (const status of statuses)
    for (const openedAt of dates)
      it(`${status}, opened ${openedAt ?? 'never'}`, () => {
        expect(isPrivateDraft(draft({ status, openedAt }))).toBe(
          status === 'DRAFT' ||
            isNeverOpenedCancelled(status, openedAt === null),
        );
      });
});
