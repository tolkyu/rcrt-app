import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactElement } from 'react';
import type { VacancyDetail } from '../../lib/schemas/vacancy';
import messages from '../../messages/uk.json';

export const SHARE_ID = '5d1f3c1e-8b6b-4a54-9f0d-2f7c2d2b0b05';

export const shareVacancy = (
  overrides: Partial<VacancyDetail> = {},
): VacancyDetail => ({
  id: SHARE_ID,
  number: 'V-0005',
  title: 'Афілейт-менеджер',
  vertical: { id: crypto.randomUUID(), name: 'Гемблінг' },
  position: null,
  teamLead: null,
  recruiters: [],
  status: 'OPEN',
  priority: 'NORMAL',
  source: 'APP',
  openedAt: '2026-11-01T11:48:05.000Z',
  createdAt: '2026-11-01T11:48:05.000Z',
  updatedAt: '2026-11-01T11:48:05.000Z',
  headcount: 1,
  seniority: null,
  workFormat: 'HYBRID',
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
  ...overrides,
});

/** A missing Ukrainian key must fail the test rather than render a key path. */
export function mountInUk(node: ReactElement) {
  render(
    createElement(NextIntlClientProvider, {
      locale: 'uk',
      timeZone: 'Europe/Kyiv',
      messages,
      onError: (error) => {
        throw error;
      },
      children: node,
    }),
  );
}

export function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
}
