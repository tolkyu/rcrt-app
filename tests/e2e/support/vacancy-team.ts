import { randomUUID } from 'node:crypto';
import {
  expect,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type PlaywrightWorkerArgs,
} from '@playwright/test';
import type { VacancyDetail } from '../../../lib/schemas/vacancy';
import messages from '../../../messages/uk.json' with { type: 'json' };
import {
  E2E_ORIGIN,
  sessionFile,
  type E2EUser,
} from '../../support/e2e-session';
import { openHydrated } from '../../support/hydration';
import type { TeamFixture } from '../../support/vacancy-team-db';
import { write } from './vacancy-edit';

export const tv = messages.vacancies;
export const tt = messages.vacancies.team;
export const ts = messages.vacancies.statusMenu;

export const SEEDED = {
  recruiter1: 'Марія Шевченко',
  recruiter2: 'Андрій Бондар',
  vasyl: 'Василь Мороз',
} as const;

/** A title no seeded vacancy shares, so a list search finds exactly the fixture. */
export const uniqueTitle = (label: string) =>
  `${label} ${randomUUID().slice(0, 8)}`;

export const fill = (template: string, values: Record<string, string>) =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    template,
  );

export const cardPath = (fixture: TeamFixture) => `/vacancies/${fixture.id}`;
export const searchPath = (fixture: TeamFixture) =>
  `/vacancies?q=${encodeURIComponent(fixture.title)}`;

export const apiAs = (
  playwright: PlaywrightWorkerArgs['playwright'],
  user: E2EUser,
) =>
  playwright.request.newContext({
    baseURL: E2E_ORIGIN,
    storageState: sessionFile(user),
  });

export async function detailOf(api: APIRequestContext, id: string) {
  const answer = await api.get(`/api/v1/vacancies/${id}`);
  expect(answer.status(), await answer.text()).toBe(200);
  return (await answer.json()) as VacancyDetail;
}

export const statusOf = (
  api: APIRequestContext,
  id: string,
  body: Record<string, unknown>,
) =>
  api.put(`/api/v1/vacancies/${id}/status`, {
    headers: write(),
    data: body,
  });

export async function claimByApi(api: APIRequestContext, id: string) {
  const answer = await api.post(`/api/v1/vacancies/${id}/recruiters/claim`, {
    headers: write(),
    data: {},
  });
  expect(answer.status(), await answer.text()).toBe(200);
}

/** A visitor in a context of his own, signed in as a seeded user. */
export async function withVisitor(
  browser: Browser,
  user: E2EUser,
  run: (page: Page, context: BrowserContext) => Promise<void>,
) {
  const context = await browser.newContext({
    baseURL: E2E_ORIGIN,
    storageState: sessionFile(user),
  });
  try {
    await run(await context.newPage(), context);
  } finally {
    await context.close();
  }
}

export const toastWith = (page: Page, title: string) =>
  page.locator('[data-slot="toast"]').filter({ hasText: title });

export const cardTitle = (page: Page, fixture: TeamFixture) =>
  page.getByRole('heading', { level: 1, name: fixture.title });
export const header = (page: Page) =>
  page.locator('[data-slot="detail-header"]');
export const chip = (page: Page, status: keyof typeof tv.status) =>
  header(page).getByText(tv.status[status], { exact: true });
export const teamSection = (page: Page) =>
  page.getByRole('region', { name: tv.teamTitle, exact: true });
export const subheading = (page: Page, name: string) =>
  teamSection(page).getByRole('heading', { name, exact: true });
export const button = (scope: Page | Locator, name: string) =>
  scope.getByRole('button', { name, exact: true });

export async function openCard(page: Page, fixture: TeamFixture) {
  await openHydrated(page, cardPath(fixture));
  await expect(cardTitle(page, fixture)).toBeVisible();
}

export const dialogNamed = (page: Page, name: string) =>
  page.getByRole('dialog', { name, exact: true });
export const alertDialogNamed = (page: Page, name: string) =>
  page.getByRole('alertdialog', { name, exact: true });

/** The desktop table row or the mobile card of one fixture in a list opened with `searchPath`. */
export const listRow = (page: Page, isMobile: boolean, fixture: TeamFixture) =>
  (isMobile
    ? page
        .getByRole('list', { name: tv.caption, exact: true })
        .getByRole('listitem')
    : page
        .getByRole('table', { name: tv.caption, exact: true })
        .getByRole('row')
  ).filter({ hasText: fixture.title });

export async function openList(
  page: Page,
  isMobile: boolean,
  fixture: TeamFixture,
) {
  await openHydrated(page, searchPath(fixture));
  await expect(listRow(page, isMobile, fixture)).toBeVisible();
}

/** The card's `⋯`: a dropdown from 768 px, a bottom sheet with an icon button «Інші дії» below it (BUG-V3-3). */
export const cardMenu = (page: Page, isMobile: boolean, title: string) =>
  isMobile
    ? {
        trigger: button(page, ts.moreActions),
        item: (name: string) =>
          page.getByRole('dialog').getByRole('button', { name, exact: true }),
      }
    : {
        trigger: button(page, fill(ts.menuLabel, { title })),
        item: (name: string) =>
          page.getByRole('menuitem', { name, exact: true }),
      };

export const rowMenu = (row: Locator, fixture: TeamFixture) =>
  button(row, fill(ts.menuLabel, { title: fixture.title }));

/** Holds the first write to `url` until `release`, so a test can look at the optimistic state first. */
export async function holdWrite(page: Page, url: RegExp, method: string) {
  let release = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(url, async (route) => {
    if (route.request().method() !== method) return route.fallback();
    await gate;
    return route.fallback();
  });
  return release;
}
