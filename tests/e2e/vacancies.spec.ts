import { expect, test, type Locator, type Page } from '@playwright/test';
import { createTranslator } from 'use-intl';
import { DEMO_VERTICALS } from '../../server/db/seed';
import messages from '../../messages/uk.json' with { type: 'json' };
import type { VacancyDetail, VacancyPage } from '../../lib/schemas/vacancy';
import { E2E_ORIGIN, sessionFile } from '../support/e2e-session';
import { openHydrated, waitForHydration } from '../support/hydration';
import {
  ALL_VISIBLE,
  DELETED_VACANCY,
  NEWEST_VISIBLE,
  VISIBLE_VACANCIES,
  demoVacancy,
  newestFirst,
  vacancyNumber,
} from '../support/vacancy-demo';

const t = messages.vacancies;
const tr = createTranslator({
  locale: 'uk',
  messages: t,
});
const TOTAL = 13;
const NUMBER = /V-\d{4,}/;

type VacancyUser = keyof typeof VISIBLE_VACANCIES;
const USERS = Object.keys(VISIBLE_VACANCIES) as VacancyUser[];

const rowsOf = (page: Page, isMobile: boolean): Locator =>
  isMobile
    ? page
        .getByRole('list', { name: t.caption, exact: true })
        .getByRole('listitem')
    : page
        .getByRole('table', { name: t.caption, exact: true })
        .getByRole('row')
        .filter({ has: page.getByRole('rowheader') });

async function listedNumbers(page: Page, isMobile: boolean) {
  const rows = rowsOf(page, isMobile);
  await expect(rows.first()).toBeVisible();
  return (await rows.allInnerTexts()).map((text) => NUMBER.exec(text)?.[0]);
}

const search = (page: Page) =>
  page.getByRole('searchbox', { name: t.searchLabel, exact: true });
const statusFilter = (page: Page) =>
  page.getByLabel(t.filterStatus, { exact: true });
const verticalFilter = (page: Page) =>
  page.getByLabel(t.filterVertical, { exact: true });
const notFound = (page: Page) =>
  page.getByRole('heading', { level: 1, name: messages.errors.notFoundTitle });
const resultsRegion = (page: Page) =>
  page.getByRole('region', { name: t.resultsLabel, exact: true });
const kyivDate = (iso: string) =>
  new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));

async function expectNumbers(
  page: Page,
  isMobile: boolean,
  expected: readonly number[],
) {
  await expect
    .poll(async () => {
      const rows = rowsOf(page, isMobile);
      return (await rows.allInnerTexts()).map((text) => NUMBER.exec(text)?.[0]);
    })
    .toEqual(newestFirst(expected));
}

for (const user of USERS) {
  test.describe(user, () => {
    test.use({ storageState: sessionFile(user) });
    const visible = VISIBLE_VACANCIES[user];

    test('lands on and lists exactly the permitted vacancies, newest first, with a correct count and no untranslated keys [VAC-04, VIS-01..03, D67, STORY-VAC-04-1]', async ({
      page,
      isMobile,
    }) => {
      const response = await page.goto(
        user === 'admin@demo' ? '/vacancies' : '/',
      );
      expect(response?.status()).toBe(200);
      await expect(page).toHaveURL(/\/vacancies$/);
      await expect(
        page.getByRole('heading', { level: 1, name: t.title, exact: true }),
      ).toBeVisible();
      expect(await listedNumbers(page, isMobile)).toEqual(newestFirst(visible));
      await expect(
        page.getByText(tr('shown', { count: visible.length }), {
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.locator('body')).not.toContainText(
        demoVacancy(DELETED_VACANCY).number,
      );
      expect(await page.locator('body').innerText()).not.toMatch(
        /\bvacancies\.[a-zA-Z]|MISSING_MESSAGE/,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    });

    test('every vacancy outside the scope is a 404 for the card, the page, the number search and the list [VIS-01..03, D19, STORY-VAC-07-1]', async ({
      page,
    }) => {
      const list = await page.request.get('/api/v1/vacancies?limit=100');
      expect(list.status()).toBe(200);
      expect(
        ((await list.json()) as VacancyPage).items.map((item) => item.number),
      ).toEqual(newestFirst(visible));
      for (let position = 1; position <= TOTAL; position += 1) {
        const vacancy = demoVacancy(position);
        const allowed = visible.includes(position);
        const card = await page.request.get(`/api/v1/vacancies/${vacancy.id}`);
        expect(card.status(), vacancy.number).toBe(allowed ? 200 : 404);
        const route = await page.request.get(`/vacancies/${vacancy.id}`);
        expect(route.status(), vacancy.number).toBe(allowed ? 200 : 404);
        if (!allowed)
          expect(await route.text(), vacancy.number).not.toContain(
            vacancy.title,
          );
        const found = await page.request.get(
          `/api/v1/vacancies?q=${vacancy.number}`,
        );
        expect(found.status()).toBe(200);
        expect(
          ((await found.json()) as VacancyPage).items.map(
            (item) => item.number,
          ),
          vacancy.number,
        ).toEqual(allowed ? [vacancy.number] : []);
      }
    });
  });
}

test.describe('finance@demo', () => {
  test.use({ storageState: sessionFile('finance@demo') });

  test('has no vacancy access: pages, cards, list and navigation are an actual 404 [VIS-01, VIS-02, STORY-VAC-04-1]', async ({
    page,
  }) => {
    const vacancy = demoVacancy(1);
    for (const path of ['/vacancies', `/vacancies/${vacancy.id}`]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
      await expect(notFound(page), path).toBeVisible();
      await expect(page.locator('body')).not.toContainText(vacancy.title);
    }
    for (const path of [
      '/api/v1/vacancies',
      `/api/v1/vacancies/${vacancy.id}`,
      '/api/v1/vacancies?q=V-0001',
    ])
      expect((await page.request.get(path)).status(), path).toBe(404);
    await page.goto('/profile');
    await expect(page.getByRole('link', { name: t.title })).toHaveCount(0);
  });

  test('a stored header vertical never turns the vacancy 404 into a redirect [D83, VIS-01]', async ({
    page,
  }) => {
    await page
      .context()
      .addCookies([
        { name: 'vertical', value: DEMO_VERTICALS.crypto, url: E2E_ORIGIN },
      ]);
    const response = await page.goto('/vacancies');
    expect(response?.status()).toBe(404);
    await expect(page).toHaveURL(/\/vacancies$/);
    await expect(notFound(page)).toBeVisible();
  });
});

test.describe('recruiter.crypto@demo', () => {
  test.use({ storageState: sessionFile('recruiter.crypto@demo') });

  test('a single-vertical user is never redirected by a stored header vertical and has no switcher [D83]', async ({
    page,
    isMobile,
  }) => {
    for (const value of [DEMO_VERTICALS.crypto, DEMO_VERTICALS.gambling]) {
      await page
        .context()
        .addCookies([{ name: 'vertical', value, url: E2E_ORIGIN }]);
      await page.goto('/vacancies?status=OPEN');
      await waitForHydration(page);
      await expect(page).toHaveURL(/\/vacancies[?]status=OPEN$/);
      await expectNumbers(page, isMobile, [12, 7, 3]);
      await expect(
        page.getByRole('button', { name: /^Вертикаль:/ }),
      ).toHaveCount(0);
    }
  });
});

test.describe('head.recruiter.gambling@demo', () => {
  test.use({ storageState: sessionFile('head.recruiter.gambling@demo') });
  const visible = VISIBLE_VACANCIES['head.recruiter.gambling@demo'];

  test('search by title and by number intersects the scope; the query lives in the URL and survives reload and Back [VAC-04, VAC-07, STORY-VAC-04-1]', async ({
    page,
    isMobile,
  }) => {
    await openHydrated(page, '/vacancies');
    await search(page).fill('tiktok');
    await expectNumbers(page, isMobile, [9, 8, 2]);
    await expect(page).toHaveURL(/[?&]q=tiktok(&|$)/);
    await page.reload();
    await waitForHydration(page);
    await expect(search(page)).toHaveValue('tiktok');
    await expectNumbers(page, isMobile, [9, 8, 2]);

    await search(page).fill('V-0001');
    await expectNumbers(page, isMobile, [1]);
    await search(page).fill('v-0004');
    await expectNumbers(page, isMobile, [4]);
    await expect(page).toHaveURL(/[?&]q=v-0004(&|$)/);

    for (const hidden of [3, DELETED_VACANCY]) {
      await search(page).fill(vacancyNumber(hidden));
      await expect(page).toHaveURL(
        new RegExp(`[?&]q=${vacancyNumber(hidden)}(&|$)`),
      );
      await expect(
        page.getByText(t.filteredEmpty.title, { exact: true }),
      ).toBeVisible();
      await expect(rowsOf(page, isMobile)).toHaveCount(0);
    }

    await search(page).fill('Фейсбук');
    await expect(
      page.getByText(t.filteredEmpty.title, { exact: true }),
    ).toBeVisible();
    await search(page).fill('медіабаєр');
    await expectNumbers(page, isMobile, [9, 8, 4, 2, 1]);
    const first = rowsOf(page, isMobile).first();
    await first.getByRole('link').first().click();
    await expect(page).toHaveURL(/\/vacancies\/[0-9a-f-]{36}$/);
    await page.goBack();
    await waitForHydration(page);
    await expect(page).toHaveURL(/[?&]q=/);
    await expect(search(page)).toHaveValue('медіабаєр');
    await expectNumbers(page, isMobile, [9, 8, 4, 2, 1]);
  });

  test('a query shorter than three characters is ignored instead of hiding the list [VAC-04, Q-162]', async ({
    page,
    isMobile,
  }) => {
    await openHydrated(page, '/vacancies');
    for (const short of ['V', 'ме']) {
      await search(page).fill(short);
      await expectNumbers(page, isMobile, visible);
      await expect(
        page.getByText(t.filteredEmpty.title, { exact: true }),
      ).toHaveCount(0);
    }
  });

  test('the vertical filter offers only the permitted vertical; unknown, foreign and malformed URL values neither leak nor break the page [VIS-01, STORY-VAC-04-1]', async ({
    page,
    isMobile,
  }) => {
    await openHydrated(page, '/vacancies');
    await expect(verticalFilter(page).locator('option')).toHaveText([
      t.all,
      'Гемблінг',
    ]);
    await expect(statusFilter(page).locator('option')).toHaveText([
      t.all,
      ...Object.values(t.status),
    ]);
    await openHydrated(page, `/vacancies?vertical=${DEMO_VERTICALS.crypto}`);
    await expect(
      page.getByText(t.filteredEmpty.title, { exact: true }),
    ).toBeVisible();
    await expect(
      verticalFilter(page).locator('option', { hasText: t.unknownVertical }),
    ).toHaveCount(1);
    await expect(page.locator('body')).not.toContainText('Крипто');
    await openHydrated(
      page,
      '/vacancies?status=ARCHIVED&vertical=not-a-uuid&cursor=abc&limit=7&q=x',
    );
    await expectNumbers(page, isMobile, visible);
  });

  test('a cursor past the newest row restarts at the first page, and one past the oldest keeps paging by position [VAC-04]', async ({
    page,
    isMobile,
  }) => {
    await openHydrated(page, '/vacancies?cursor=999999999&direction=newer');
    await expect(page).toHaveURL(/\/vacancies$/);
    await expectNumbers(page, isMobile, visible);
    await openHydrated(page, '/vacancies?cursor=999999999&direction=older');
    await expectNumbers(page, isMobile, visible);
  });

  test('the default preview ships with the page and another row is prefetched on hover [PERF-02, UI-06, VAC-04]', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'the preview pane exists on wide screens only');
    const detailRequests: string[] = [];
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (/^\/api\/v1\/vacancies\/[0-9a-f-]{36}$/.test(pathname))
        detailRequests.push(pathname);
    });
    await openHydrated(page, '/vacancies');
    const rows = rowsOf(page, false);
    const firstTitle = (
      await rows.first().getByRole('link').first().innerText()
    ).trim();
    await expect(
      page
        .getByRole('complementary', { name: t.previewLabel })
        .getByRole('heading', { level: 2, name: firstTitle, exact: true }),
    ).toBeVisible();
    expect(detailRequests).toEqual([]);
    await rows.nth(1).getByRole('button').hover();
    await expect.poll(() => detailRequests.length).toBe(1);
  });

  test('the card back link returns to the list with its filters [VAC-04, UI-09]', async ({
    page,
    isMobile,
  }) => {
    await openHydrated(page, '/vacancies');
    await search(page).fill('медіабаєр');
    await expectNumbers(page, isMobile, [9, 8, 4, 2, 1]);
    await rowsOf(page, isMobile).first().getByRole('link').first().click();
    await expect(page).toHaveURL(/\/vacancies\/[0-9a-f-]{36}$/);
    await page.getByRole('link', { name: t.detail.back }).click();
    await expect(page).toHaveURL(/[?&]q=/);
    await waitForHydration(page);
    await expect(search(page)).toHaveValue('медіабаєр');
    await expectNumbers(page, isMobile, [9, 8, 4, 2, 1]);
  });

  test('missing, malformed, foreign and deleted ids are an actual HTTP 404 that discloses nothing [VAC-04, STORY-VAC-04-2]', async ({
    page,
  }) => {
    for (const position of [3, DELETED_VACANCY]) {
      const vacancy = demoVacancy(position);
      const response = await page.goto(`/vacancies/${vacancy.id}`);
      expect(response?.status(), vacancy.number).toBe(404);
      await expect(notFound(page)).toBeVisible();
      await expect(page.locator('body')).not.toContainText(vacancy.title);
      await expect(page.locator('body')).not.toContainText(vacancy.number);
    }
    for (const id of [
      '00000000-0000-4000-8000-000000000000',
      'not-a-uuid',
      '1',
    ]) {
      const response = await page.goto(`/vacancies/${id}`);
      expect(response?.status(), id).toBe(404);
      await expect(notFound(page)).toBeVisible();
    }
    await expect(
      page
        .getByRole('main')
        .getByRole('link', { name: messages.states.toStart }),
    ).toBeVisible();
  });

  test('the detail card shows the stored request, the team and the Kyiv opening date, and reloads to the same record [VAC-04, STORY-VAC-04-2, UI-09]', async ({
    page,
  }) => {
    const vacancy = demoVacancy(1);
    const api = await page.request.get(`/api/v1/vacancies/${vacancy.id}`);
    const stored = (await api.json()) as VacancyDetail;
    await openHydrated(page, `/vacancies/${vacancy.id}`);
    await expect(page).toHaveTitle(
      new RegExp(`${vacancy.number}.*${vacancy.title}`),
    );
    await expect(
      page.getByRole('heading', { level: 1, name: vacancy.title, exact: true }),
    ).toBeVisible();
    const main = page.getByRole('main');
    await expect(main.getByText(vacancy.number, { exact: true })).toBeVisible();
    await expect(main.getByText(t.status.OPEN, { exact: true })).toBeVisible();
    await expect(main.getByText(t.urgent, { exact: true })).toHaveAttribute(
      'data-urgent',
      'true',
    );
    const field = (label: string) =>
      main
        .locator('dt', { hasText: new RegExp(`^${label}$`) })
        .locator('xpath=following-sibling::dd[1]');
    await expect(field(t.fields.teamLead)).toHaveText(
      stored.teamLead!.fullName,
    );
    for (const recruiter of stored.recruiters)
      await expect(field(t.fields.recruiters)).toContainText(
        recruiter.fullName,
      );
    await expect(field(t.fields.vertical)).toHaveText('Гемблінг');
    await expect(field(t.fields.position)).toHaveText(stored.position!.name);
    await expect(field(t.fields.headcount)).toHaveText(
      tr('headcount', { count: stored.headcount }),
    );
    await expect(field(t.fields.probation)).toHaveText(
      tr('probationDays', { count: stored.probationDays }),
    );
    await expect(field(t.fields.workFormat)).toHaveText(t.workFormat.REMOTE);
    await expect(field(t.fields.salary)).toContainText('USD');
    await expect(field(t.fields.openedAt)).toHaveText(
      kyivDate(stored.openedAt!),
    );
    await expect(field(t.fields.createdAt)).toHaveText(
      kyivDate(stored.createdAt),
    );
    await expect(field(t.fields.origin)).toHaveText(t.teamLeadRequest);
    await expect(main.getByRole('link', { name: t.openCard })).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole('heading', { level: 1, name: vacancy.title, exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: t.detail.back }).click();
    await expect(page).toHaveURL(/\/vacancies$/);
  });

  test('absent fields are shown honestly: a draft has no opening date or position, a recruiter-initiated vacancy has no Team Lead [VAC-04, STORY-VAC-04-2]', async ({
    page,
  }) => {
    await openHydrated(page, `/vacancies/${demoVacancy(8).id}`);
    const main = page.getByRole('main');
    const field = (label: string) =>
      main
        .locator('dt', { hasText: new RegExp(`^${label}$`) })
        .locator('xpath=following-sibling::dd[1]');
    await expect(main.getByText(t.status.DRAFT, { exact: true })).toBeVisible();
    await expect(
      main.locator('dt', { hasText: t.fields.openedAt }),
    ).toHaveCount(0);
    await expect(field(t.fields.position)).toHaveText(t.notSpecified);
    await expect(field(t.fields.salary)).toHaveText(t.notSpecified);

    await openHydrated(page, `/vacancies/${demoVacancy(10).id}`);
    await expect(field(t.fields.teamLead)).toHaveText(t.unassigned);
    await expect(field(t.fields.origin)).toHaveText(t.recruiterInitiated);

    await openHydrated(page, `/vacancies/${demoVacancy(11).id}`);
    await expect(main.getByText(t.fromBot, { exact: true })).toBeVisible();
  });

  test('filtered-empty offers a working reset that restores the list and clears the URL [VAC-04, UI-06, STORY-VAC-04-1]', async ({
    page,
    isMobile,
  }) => {
    await openHydrated(page, '/vacancies');
    await search(page).fill('немає такої вакансії');
    const results = resultsRegion(page);
    await expect(
      results.getByText(t.filteredEmpty.title, { exact: true }),
    ).toBeVisible();
    await expect(
      results.getByText(t.filteredEmpty.description, { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/^Показано/)).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: t.resetFilters }),
    ).toHaveCount(1);
    await results.getByRole('button', { name: t.resetFilters }).click();
    await expect(search(page)).toHaveValue('');
    await expect(page).toHaveURL(/\/vacancies$/);
    await expectNumbers(page, isMobile, visible);

    await statusFilter(page).selectOption({ label: t.status.FILLED });
    await expect(page).toHaveURL(/[?&]status=FILLED(&|$)/);
    await expect(
      results.getByText(t.filteredEmpty.title, { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: t.resetFilters }).first().click();
    await expect(statusFilter(page)).toHaveValue('');
    await expectNumbers(page, isMobile, visible);
  });

  test('a failed list request shows the retryable error, keeps the URL and the shell usable, and retry restores the list [UI-06, STORY-VAC-04-1]', async ({
    page,
    isMobile,
  }) => {
    test.setTimeout(60_000);
    await openHydrated(page, '/vacancies');
    const failing = (url: URL) =>
      url.pathname === '/api/v1/vacancies' &&
      url.searchParams.get('status') === 'ON_HOLD';
    await page.route(failing, (route) =>
      route.fulfill({ status: 503, json: { code: 'INTERNAL_ERROR' } }),
    );
    await statusFilter(page).selectOption({ label: t.status.ON_HOLD });
    await expect(
      page.getByText(messages.states.errorTitle, { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/[?&]status=ON_HOLD(&|$)/);
    await expect(statusFilter(page)).toHaveValue('ON_HOLD');
    await page.getByRole('button', { name: messages.shell.userMenu }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.unroute(failing);
    await page
      .getByRole('button', { name: messages.common.retry, exact: true })
      .click();
    await expectNumbers(page, isMobile, [2]);
    await expect(
      page.getByText(messages.states.errorTitle, { exact: true }),
    ).toHaveCount(0);
  });
});

test.describe('admin@demo', () => {
  test.use({ storageState: sessionFile('admin@demo') });

  test('status and vertical filters intersect with the scope; the selection lives in the URL, survives reload, Back and reset [VAC-04, STORY-VAC-04-1]', async ({
    page,
    isMobile,
  }) => {
    await openHydrated(page, '/vacancies');
    await expect(verticalFilter(page).locator('option')).toHaveText([
      t.all,
      'Гемблінг',
      'Крипто',
    ]);

    await statusFilter(page).selectOption({ label: t.status.ON_HOLD });
    await expectNumbers(page, isMobile, [2]);
    await expect(page).toHaveURL(/[?&]status=ON_HOLD(&|$)/);

    await statusFilter(page).selectOption({ label: t.status.OPEN });
    await verticalFilter(page).selectOption({ label: 'Крипто' });
    await expectNumbers(page, isMobile, [12, 7, 3]);
    await expect(page).toHaveURL(/[?&]vertical=[0-9a-f-]{36}(&|$)/);
    await expect(page).toHaveURL(/[?&]status=OPEN(&|$)/);

    await page.reload();
    await waitForHydration(page);
    await expect(verticalFilter(page)).toHaveValue(DEMO_VERTICALS.crypto);
    await expect(statusFilter(page)).toHaveValue('OPEN');
    await expectNumbers(page, isMobile, [12, 7, 3]);

    await statusFilter(page).selectOption({ label: t.status.DRAFT });
    await expect(
      page.getByText(t.filteredEmpty.title, { exact: true }),
    ).toBeVisible();
    await verticalFilter(page).selectOption({ label: 'Гемблінг' });
    await expectNumbers(page, isMobile, [8]);
    await statusFilter(page).selectOption({ label: t.status.CANCELLED });
    await expectNumbers(page, isMobile, [6]);

    await rowsOf(page, isMobile).first().getByRole('link').first().click();
    await expect(page).toHaveURL(/\/vacancies\/[0-9a-f-]{36}$/);
    await page.goBack();
    await expect(verticalFilter(page)).toHaveValue(DEMO_VERTICALS.gambling);
    await expect(statusFilter(page)).toHaveValue('CANCELLED');
    await expectNumbers(page, isMobile, [6]);

    await page.getByRole('button', { name: t.resetFilters }).click();
    await expect(page).toHaveURL(/\/vacancies\?vertical=all$/);
    await expectNumbers(page, isMobile, ALL_VISIBLE);
  });

  test('the header vertical seeds the vertical filter; the filter follows it, can be changed or cleared, and an explicit URL wins [D83, VAC-04]', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'the header vertical switcher is hidden on mobile');
    const inVertical = (key: 'gambling' | 'crypto') =>
      ALL_VISIBLE.filter((position) => demoVacancy(position).vertical === key);
    const switcher = (name: string) =>
      page.getByRole('button', {
        name: messages.shell.verticalFilter.replace('{name}', name),
        exact: true,
      });
    const storedVertical = async () =>
      (await page.context().cookies()).find(
        (cookie) => cookie.name === 'vertical',
      )?.value;

    await openHydrated(page, '/vacancies');
    await expect(switcher(messages.shell.allVerticals)).toBeVisible();
    await expectNumbers(page, isMobile, ALL_VISIBLE);

    await switcher(messages.shell.allVerticals).click();
    await page
      .getByRole('menuitemradio', { name: 'Крипто', exact: true })
      .click();
    await expectNumbers(page, isMobile, inVertical('crypto'));
    await expect(page).toHaveURL(
      new RegExp(`[?&]vertical=${DEMO_VERTICALS.crypto}(&|$)`),
    );
    await expect(verticalFilter(page)).toHaveValue(DEMO_VERTICALS.crypto);
    await expect(switcher('Крипто')).toBeVisible();
    expect(await storedVertical()).toBe(DEMO_VERTICALS.crypto);

    await verticalFilter(page).selectOption({ label: 'Гемблінг' });
    await expectNumbers(page, isMobile, inVertical('gambling'));
    await expect(switcher('Гемблінг')).toBeVisible();
    expect(await storedVertical()).toBe(DEMO_VERTICALS.crypto);

    await page.goto('/vacancies');
    await waitForHydration(page);
    await expect(page).toHaveURL(
      new RegExp(`/vacancies[?]vertical=${DEMO_VERTICALS.crypto}$`),
    );
    await expect(verticalFilter(page)).toHaveValue(DEMO_VERTICALS.crypto);
    await expectNumbers(page, isMobile, inVertical('crypto'));

    await page.goto(`/vacancies?vertical=${DEMO_VERTICALS.gambling}`);
    await waitForHydration(page);
    await expect(page).toHaveURL(
      new RegExp(`/vacancies[?]vertical=${DEMO_VERTICALS.gambling}$`),
    );
    await expect(verticalFilter(page)).toHaveValue(DEMO_VERTICALS.gambling);
    await expectNumbers(page, isMobile, inVertical('gambling'));

    await verticalFilter(page).selectOption({ label: t.all });
    await expect(page).toHaveURL(/\/vacancies\?vertical=all$/);
    await expectNumbers(page, isMobile, ALL_VISIBLE);
    await expect(switcher(messages.shell.allVerticals)).toBeVisible();
    await page.reload();
    await waitForHydration(page);
    await expect(page).toHaveURL(/\/vacancies\?vertical=all$/);
    await expect(verticalFilter(page)).toHaveValue('');
    await expectNumbers(page, isMobile, ALL_VISIBLE);

    await page.goBack();
    await expect(verticalFilter(page)).toHaveValue(DEMO_VERTICALS.crypto);
    await expectNumbers(page, isMobile, inVertical('crypto'));
  });

  test('a stored header vertical presets a bare list link once; an unknown stored value is ignored [D83]', async ({
    page,
    isMobile,
  }) => {
    const store = (value: string) =>
      page.context().addCookies([{ name: 'vertical', value, url: E2E_ORIGIN }]);

    await store(DEMO_VERTICALS.crypto);
    await page.goto('/vacancies?status=OPEN&cursor=5');
    await waitForHydration(page);
    await expect(page).toHaveURL(
      new RegExp(`/vacancies[?]vertical=${DEMO_VERTICALS.crypto}&status=OPEN$`),
    );
    await expectNumbers(page, isMobile, [12, 7, 3]);

    await store('5b1f7a3c-9d4e-4f6a-8b2c-1d3e5f7a9b0c');
    await page.goto('/vacancies');
    await waitForHydration(page);
    await expect(page).toHaveURL(/\/vacancies$/);
    await expectNumbers(page, isMobile, ALL_VISIBLE);
  });

  test('choosing a header vertical and then following the sidebar «Вакансії» link client-side opens the list already filtered [D83]', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'the header vertical switcher is hidden on mobile');
    const nav = page.getByRole('navigation', { name: messages.shell.mainNav });
    const link = (name: string) => nav.getByRole('link', { name, exact: true });

    await openHydrated(page, '/vacancies');
    await page
      .getByRole('button', {
        name: messages.shell.verticalFilter.replace(
          '{name}',
          messages.shell.allVerticals,
        ),
        exact: true,
      })
      .click();
    await page
      .getByRole('menuitemradio', { name: 'Крипто', exact: true })
      .click();
    await expectNumbers(page, isMobile, [14, 12, 7, 3]);

    await link(messages.nav.profile).click();
    await expect(page).toHaveURL(/\/profile$/);
    await link(messages.nav.vacancies).click();
    await expect(page).toHaveURL(
      new RegExp(`/vacancies[?]vertical=${DEMO_VERTICALS.crypto}$`),
    );
    await expect(verticalFilter(page)).toHaveValue(DEMO_VERTICALS.crypto);
    await expectNumbers(page, isMobile, [14, 12, 7, 3]);
  });

  test('the vacancy navigation item is current on the list and on a card [UI-04, VIS-02]', async ({
    page,
    isMobile,
  }) => {
    await openHydrated(page, '/vacancies');
    const nav = page.getByRole('navigation', {
      name: isMobile ? messages.shell.mobileNav : messages.shell.mainNav,
    });
    const link = nav.getByRole('link', {
      name: messages.nav.vacancies,
      exact: true,
    });
    await expect(link).toHaveAttribute('aria-current', 'page');
    await openHydrated(page, `/vacancies/${demoVacancy(1).id}`);
    await expect(link).toHaveAttribute('aria-current', 'page');
  });

  test('older and newer pages move through the cursor in the URL and Back returns to the previous page [VAC-04, STORY-VAC-04-1]', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'the cursor contract is viewport independent');
    await openHydrated(page, '/vacancies');
    const requests: string[] = [];
    const open9 = (await (
      await page.request.get('/api/v1/vacancies?status=OPEN')
    ).json()) as VacancyPage;
    await page.route(
      (url) =>
        url.pathname === '/api/v1/vacancies' &&
        url.searchParams.get('status') === 'OPEN',
      (route) => {
        const url = new URL(route.request().url());
        requests.push(url.search);
        const cursor = url.searchParams.get('cursor');
        return route.fulfill({
          json: {
            items: cursor ? open9.items.slice(-2) : open9.items.slice(0, 2),
            nextCursor: cursor ? null : '9',
            prevCursor: cursor ? '8' : null,
          },
        });
      },
    );
    await statusFilter(page).selectOption({ label: t.status.OPEN });
    const older = page.getByRole('button', { name: t.older });
    const newer = page.getByRole('button', { name: t.newer });
    await expect(older).toBeEnabled();
    await expect(newer).toBeDisabled();
    await older.click();
    await expect(page).toHaveURL(/[?&]cursor=9(&|$)/);
    await expect(page).toHaveURL(/[?&]direction=older(&|$)/);
    await expect(newer).toBeEnabled();
    await expect(older).toBeDisabled();
    expect(requests.at(-1)).toContain('cursor=9');
    await expect(resultsRegion(page)).toBeFocused();
    await page.goBack();
    await expect(page).not.toHaveURL(/cursor=/);
    await expect(older).toBeEnabled();
    await page.goForward();
    await expect(page).toHaveURL(/[?&]cursor=9(&|$)/);
    await newer.click();
    await expect(page).toHaveURL(/[?&]direction=newer(&|$)/);
    expect(requests.at(-1)).toContain('direction=newer');
  });

  test('desktop preview follows the selected row, lives in the URL and matches the card [VIS-01, STORY-VAC-04-2]', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'the side preview exists on wide screens only');
    await openHydrated(page, '/vacancies');
    const preview = page.getByRole('complementary', { name: t.previewLabel });
    const first = demoVacancy(NEWEST_VISIBLE);
    const second = demoVacancy(7);
    const pick = (title: string) =>
      page.getByRole('button', {
        name: t.previewSelect.replace('{title}', title),
      });
    const firstButton = pick(first.title).first();
    await expect(firstButton).toHaveAttribute('aria-pressed', 'true');
    await expect(
      preview.getByRole('heading', { level: 2, name: first.title }),
    ).toBeVisible();
    await expect(
      preview.getByText(first.number, { exact: true }),
    ).toBeVisible();

    const secondRow = rowsOf(page, false).filter({ hasText: second.number });
    const secondButton = secondRow.getByRole('button');
    await secondButton.click();
    await expect(page).toHaveURL(new RegExp(`[?&]vacancy=${second.id}(&|$)`));
    await expect(secondButton).toHaveAttribute('aria-pressed', 'true');
    await expect(firstButton).toHaveAttribute('aria-pressed', 'false');
    await expect(
      preview.getByText(second.number, { exact: true }),
    ).toBeVisible();
    await expect(
      preview.getByRole('heading', { level: 2, name: second.title }),
    ).toBeVisible();

    await page.reload();
    await expect(secondButton).toHaveAttribute('aria-pressed', 'true');
    await expect(
      preview.getByText(second.number, { exact: true }),
    ).toBeVisible();

    await rowsOf(page, false)
      .filter({ hasText: demoVacancy(3).number })
      .getByRole('cell')
      .nth(1)
      .click();
    await expect(page).toHaveURL(
      new RegExp(`[?&]vacancy=${demoVacancy(3).id}(&|$)`),
    );
    await expect(
      preview.getByText(demoVacancy(3).number, { exact: true }),
    ).toBeVisible();

    await preview.getByRole('link', { name: t.openCard }).click();
    await expect(page).toHaveURL(
      new RegExp(`/vacancies/${demoVacancy(3).id}$`),
    );
    await expect(
      page.getByRole('heading', { level: 1, name: demoVacancy(3).title }),
    ).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(
      new RegExp(`[?&]vacancy=${demoVacancy(3).id}(&|$)`),
    );
    await expect(
      preview.getByText(demoVacancy(3).number, { exact: true }),
    ).toBeVisible();
  });

  test('a changed filter drops the preview selection that belonged to the previous result [VAC-04]', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'the side preview exists on wide screens only');
    await openHydrated(page, `/vacancies?vacancy=${demoVacancy(2).id}`);
    const preview = page.getByRole('complementary', { name: t.previewLabel });
    await expect(
      preview.getByText(demoVacancy(2).number, { exact: true }),
    ).toBeVisible();
    await statusFilter(page).selectOption({ label: t.status.OPEN });
    await expect(page).not.toHaveURL(/vacancy=/);
    await expect(
      preview.getByText(demoVacancy(12).number, { exact: true }),
    ).toBeVisible();
  });

  test('a failing preview has its own retry while the list stays usable [UI-06, VIS-01]', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'the side preview exists on wide screens only');
    test.setTimeout(60_000);
    await openHydrated(page, '/vacancies');
    const target = demoVacancy(2);
    const failing = (url: URL) =>
      url.pathname === `/api/v1/vacancies/${target.id}`;
    await page.route(failing, (route) =>
      route.fulfill({ status: 503, json: { code: 'INTERNAL_ERROR' } }),
    );
    await rowsOf(page, false)
      .filter({ hasText: target.number })
      .getByRole('button')
      .click();
    const preview = page.getByRole('complementary', { name: t.previewLabel });
    await expect(
      preview.getByText(messages.states.errorTitle, { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(rowsOf(page, false)).toHaveCount(ALL_VISIBLE.length);
    await expect(search(page)).toBeEnabled();
    await page.unroute(failing);
    await preview
      .getByRole('button', { name: messages.common.retry, exact: true })
      .click();
    await expect(
      preview.getByText(target.number, { exact: true }),
    ).toBeVisible();
    await search(page).fill(demoVacancy(5).number);
    await expectNumbers(page, false, [5]);
  });

  test('keyboard: Tab reaches the title link, Enter opens the card, the preview button toggles with Space [WCAG 2.1.1, VAC-04]', async ({
    page,
    isMobile,
  }) => {
    await openHydrated(page, '/vacancies');
    await search(page).focus();
    await page.keyboard.press('Tab');
    await expect(verticalFilter(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(statusFilter(page)).toBeFocused();
    await page.keyboard.press('Tab');
    const first = demoVacancy(NEWEST_VISIBLE);
    const link = rowsOf(page, isMobile)
      .first()
      .getByRole('link', { name: first.title });
    await expect(link).toBeFocused();
    if (!isMobile) {
      await page.keyboard.press('Tab');
      await expect(
        rowsOf(page, false).first().getByRole('button'),
      ).toBeFocused();
      const nextToggle = rowsOf(page, false).nth(1).getByRole('button');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await expect(nextToggle).toBeFocused();
      await page.keyboard.press('Space');
      await expect(nextToggle).toHaveAttribute('aria-pressed', 'true');
      await expect(page).toHaveURL(/[?&]vacancy=/);
      await link.focus();
    }
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/vacancies/${first.id}$`));
    await expect(
      page.getByRole('heading', { level: 1, name: first.title }),
    ).toBeVisible();
  });
});

test.describe('layouts', () => {
  test.use({ storageState: sessionFile('head.recruiter.gambling@demo') });

  test('mobile 390: stacked cards with number, vertical, status, Team Lead and date; the whole card opens it; the long title wraps [UI-04, STORY-VAC-04-1]', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'phone layout');
    await openHydrated(page, '/vacancies');
    await expect(page.getByRole('table')).toBeHidden();
    await expect(
      page.getByRole('complementary', { name: t.previewLabel }),
    ).toBeHidden();
    await expect(
      page.getByRole('button', { name: /^Показати огляд/ }),
    ).toHaveCount(0);
    const cards = rowsOf(page, true);
    await expect(cards).toHaveCount(
      VISIBLE_VACANCIES['head.recruiter.gambling@demo'].length,
    );
    const urgent = cards.filter({ hasText: demoVacancy(1).number });
    await expect(urgent).toContainText(
      tr('numberInVertical', {
        number: demoVacancy(1).number,
        vertical: 'Гемблінг',
      }),
    );
    await expect(urgent).toContainText(t.status.OPEN);
    await expect(urgent).toContainText(t.urgent);
    await expect(urgent).toContainText('Василь Мороз');
    await expect(urgent).toContainText(/Відкрита з \d{2}\.\d{2}\.2026/);
    await expect(
      cards.filter({ hasText: demoVacancy(10).number }),
    ).toContainText(t.unassigned);
    const overflow = await cards.evaluateAll((items) =>
      items.map((item) => item.scrollWidth - item.clientWidth),
    );
    expect(Math.max(...overflow)).toBeLessThanOrEqual(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    const long = cards.filter({ hasText: demoVacancy(9).number });
    const box = (await long.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeLessThanOrEqual(390);
    await long.click({ position: { x: box.width - 12, y: box.height / 2 } });
    await expect(page).toHaveURL(
      new RegExp(`/vacancies/${demoVacancy(9).id}$`),
    );
    await expect(
      page.getByRole('heading', { level: 1, name: demoVacancy(9).title }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });

  test('desktop: the table with the side preview fits 1440, and a 900 tablet shows the table without the preview [UI-04, VIS-01]', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'desktop layout');
    await openHydrated(page, '/vacancies');
    const preview = page.getByRole('complementary', { name: t.previewLabel });
    await expect(page.getByRole('table')).toBeVisible();
    await expect(preview.getByRole('heading', { level: 2 })).toBeVisible();
    const columns = page.getByRole('columnheader');
    await expect(columns).toHaveText([
      t.columns.title,
      t.columns.vertical,
      t.columns.teamLead,
      t.columns.status,
      t.columns.preview,
    ]);
    const fits = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
    expect(await fits()).toBe(true);
    await page.setViewportSize({ width: 900, height: 900 });
    await expect(page.getByRole('table')).toBeVisible();
    await expect(preview.getByRole('heading', { level: 2 })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /^Показати огляд/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('columnheader', { name: t.columns.openedAt }),
    ).toBeVisible();
    expect(await fits()).toBe(true);
  });
});

test.describe('sharing', () => {
  test.use({ storageState: sessionFile('head.recruiter.gambling@demo') });

  test('«Поділитися» copies the real card link and says access is checked for each person [UI-09, D58]', async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'clipboard permissions are Chromium-only',
    );
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const vacancy = demoVacancy(1);
    await openHydrated(page, `/vacancies/${vacancy.id}`);
    await page.getByRole('button', { name: t.share }).click();
    await expect(page.getByText(t.shareCopied, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      new URL(`/vacancies/${vacancy.id}`, page.url()).href,
    );
  });

  test('a copy failure shows the link to copy by hand [UI-09]', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error('denied')) },
      });
    });
    const vacancy = demoVacancy(1);
    await openHydrated(page, `/vacancies/${vacancy.id}`);
    await page.getByRole('button', { name: t.share }).click();
    const alert = page.getByRole('alert').filter({ hasText: t.shareFailed });
    await expect(alert).toBeVisible();
    await expect(alert.getByRole('link')).toHaveAttribute(
      'href',
      `/vacancies/${vacancy.id}`,
    );
  });
});
