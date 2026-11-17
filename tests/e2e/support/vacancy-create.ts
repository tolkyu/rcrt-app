import {
  expect,
  type APIRequestContext,
  type Page,
  type Request,
} from '@playwright/test';
import { createTranslator } from 'next-intl';
import type { VacancyDetail } from '../../../lib/schemas/vacancy';
import { MUTATION_HEADERS } from '../../support/e2e-session';
import { openHydrated } from '../../support/hydration';
import { problemFulfill } from '../../support/problem';
import { chooseOption, listboxOf, optionsOf } from '../../support/select';
import {
  E2E_DRAFT_PREFIX,
  VISIBLE_VACANCIES,
} from '../../support/vacancy-demo';
import messages from '../../../messages/uk.json' with { type: 'json' };

export const t = messages.vacancyForm;
/** The desktop and the phone project run side by side as the same user: each sweeps only its own drafts, so it cannot delete the other's mid-test. */
export const OWN_DRAFT_PREFIX = `${E2E_DRAFT_PREFIX} ${Math.random().toString(36).slice(2, 8)}`;
const STALE_AFTER_MS = 10 * 60 * 1000;
export const POSITION = 'Медіабаєр — Facebook';
export const CREATE_URL = /\/api\/v1\/vacancies$/;
export const errorText = {
  headcountRange: t.errors.headcountRange
    .replace('{min}', '1')
    .replace('{max}', '100'),
  titleLong: t.errors.titleLong.replace('{max}', '200'),
};
export const NEWEST_OWN_VACANCY = Math.max(
  ...VISIBLE_VACANCIES['recruiter1.gambling@demo'],
);
export const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,64}$/;
export const notFound = (page: Page) =>
  page.getByRole('heading', { level: 1, name: messages.errors.notFoundTitle });
export const heading = (page: Page) =>
  page.getByRole('heading', { level: 1, name: t.title, exact: true });
export const field = (page: Page, name: string) =>
  page.getByRole('textbox', { name: new RegExp(`^${name}`) });
export const position = (page: Page) =>
  page.getByRole('combobox', { name: new RegExp(`^${t.position.label}`) });
export const vertical = (page: Page) =>
  page.getByRole('combobox', { name: new RegExp(`^${t.vertical.label}`) });
export const teamLead = (page: Page) =>
  page.getByRole('combobox', { name: new RegExp(`^${t.teamLead.label}`) });
export const LEADS = {
  vasyl: 'Василь Мороз',
  taras: 'Тарас Лисенко',
  dmytro: 'Дмитро Савченко',
};
export const leadOption = (page: Page, name: string) =>
  page.getByRole('option', { name: new RegExp(`^${name}`) });
export const saveDraft = (page: Page) =>
  page.getByRole('button', { name: t.actions.saveDraft, exact: true });
export const publish = (page: Page) =>
  page.getByRole('button', { name: t.actions.create, exact: true });
export const creates = (page: Page) => {
  const seen: Request[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && CREATE_URL.test(request.url()))
      seen.push(request);
  });
  return seen;
};

/** Runs after a failure too; a leftover of an earlier broken run (older than ten minutes) goes as well: «Усі» of this user must stay as seeded for vacancies.spec.ts. */
export async function sweepDrafts(request: APIRequestContext) {
  const stale = Date.now() - STALE_AFTER_MS;
  // A cancelled draft is the author's too (D112), so a test that cancelled one leaves it under «Скасовані».
  for (const status of ['DRAFT', 'CANCELLED']) {
    const list = await request.get(`/api/v1/vacancies?status=${status}`);
    const { items } = (await list.json()) as {
      items: { id: string; title: string; createdAt: string }[];
    };
    for (const item of items.filter(
      (draft) =>
        draft.title.startsWith(OWN_DRAFT_PREFIX) ||
        (draft.title.startsWith(E2E_DRAFT_PREFIX) &&
          Date.parse(draft.createdAt) < stale),
    )) {
      const removed = await request.delete(`/api/v1/vacancies/${item.id}`, {
        headers: MUTATION_HEADERS,
        data: {},
      });
      expect([200, 404], await removed.text()).toContain(removed.status());
    }
  }
}

export const sweepOwnDrafts = (page: Page) => sweepDrafts(page.request);

export type StubbedCreate = {
  verticalId: string;
  positionId?: string;
  title: string;
  headcount: number;
  priority: VacancyDetail['priority'];
};

/** The answer a create would give, built from the request: contract and UI are exercised without leaving residue in the seeded lists. */
export function stubbedVacancy(
  body: StubbedCreate,
  status: VacancyDetail['status'],
): VacancyDetail {
  const now = new Date().toISOString();
  return {
    id: '5c1d4f6a-7b8e-4c9d-8e0f-1a2b3c4d5e6f',
    number: 'V-9999',
    title: body.title,
    vertical: { id: body.verticalId, name: 'Гемблінг' },
    position: body.positionId ? { id: body.positionId, name: POSITION } : null,
    teamLead: null,
    recruiters: [],
    status,
    priority: body.priority,
    source: 'APP',
    openedAt: status === 'OPEN' ? now : null,
    createdAt: now,
    updatedAt: now,
    headcount: body.headcount,
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
  };
}

export async function choosePosition(page: Page) {
  await position(page).click();
  await page.getByRole('option', { name: POSITION, exact: true }).click();
  await expect(field(page, t.titleField.label)).toHaveValue(POSITION);
}

export const DRAFT_CHIP = new RegExp(
  `^${messages.vacancies.filterStatuses.DRAFT}(, \\d+)?$`,
);
export const statusChips = (page: Page) =>
  page.getByRole('radiogroup', {
    name: messages.vacancies.filterStatus,
    exact: true,
  });
export const level = (page: Page) =>
  page.getByRole('combobox', { name: new RegExp(`^${t.seniority.label}`) });
export const workFormat = (page: Page) =>
  page.getByRole('combobox', { name: new RegExp(`^${t.workFormat.label}`) });
export const employment = (page: Page) =>
  page.getByRole('combobox', {
    name: new RegExp(`^${t.employmentType.label}`),
  });
export const currency = (page: Page) =>
  page.getByRole('combobox', { name: new RegExp(`^${t.salary.currency}`) });
export const salaryFrom = (page: Page) => field(page, t.salary.from);
export const salaryTo = (page: Page) => field(page, t.salary.to);
export const probation = (page: Page) => field(page, t.probation.label);
export const NBSP = '\u00a0';
export const probationRange = t.errors.probationRange
  .replace('{min}', '30')
  .replace('{max}', '90');
export const probationReadOnly = createTranslator({
  locale: 'uk',
  messages,
  namespace: 'vacancyForm',
})('probation.readOnly', { days: 90 });
export const draftLimitReason =
  messages.vacancies.createErrors.draftLimitReached.replace('{count}', '50');
export const COUNT_URL = /\/api\/v1\/vacancies\/drafts\/count$/;

/** Fills the title and the vertical so the group under test is the only thing left to do. */
export async function startDraft(page: Page, title: string) {
  await openHydrated(page, '/vacancies/new');
  if (await vertical(page).isEnabled())
    await chooseOption(page, vertical(page), 'Гемблінг');
  await field(page, t.titleField.label).fill(title);
}

/** The save is refused by a stub, so a test can read the request without storing a draft or spending the create limit. */
export const refuseCreate = (page: Page) =>
  page.route(CREATE_URL, async (route) =>
    route.request().method() === 'POST'
      ? route.fulfill(await problemFulfill(500, 'INTERNAL'))
      : route.fallback(),
  );

/** Opens the focused select with the arrow key and walks `downs` options down; Radix moves focus in a timeout, so each step waits for it. */
export async function pickByKeys(
  page: Page,
  trigger: ReturnType<typeof level>,
  downs: number,
  label: string,
) {
  await expect(trigger).toHaveAttribute('data-state', 'closed');
  await page.keyboard.press('ArrowDown');
  await expect(optionsOf(page).first()).toBeFocused();
  for (let index = 1; index <= downs; index += 1) {
    await page.keyboard.press('ArrowDown');
    await expect(optionsOf(page).nth(index)).toBeFocused();
  }
  await page.keyboard.press('Enter');
  await expect(listboxOf(page)).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveText(label);
}
