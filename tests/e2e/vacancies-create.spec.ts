import { expect, test, type Page, type Request } from '@playwright/test';
import { DEMO_VERTICALS } from '../../server/db/seed';
import messages from '../../messages/uk.json' with { type: 'json' };
import type { VacancyDetail } from '../../lib/schemas/vacancy';
import { MUTATION_HEADERS, sessionFile } from '../support/e2e-session';
import { openHydrated, waitForHydration } from '../support/hydration';
import { problemFulfill } from '../support/problem';
import {
  chooseOption,
  expectOptions,
  listboxOf,
  optionsOf,
} from '../support/select';
import {
  E2E_DRAFT_PREFIX,
  VISIBLE_VACANCIES,
  vacancyNumber,
} from '../support/vacancy-demo';

const t = messages.vacancyForm;
/** The desktop and the phone project run side by side as the same user: each sweeps only its own drafts, so it cannot delete the other's mid-test. */
const OWN_DRAFT_PREFIX = `${E2E_DRAFT_PREFIX} ${Math.random().toString(36).slice(2, 8)}`;
const STALE_AFTER_MS = 10 * 60 * 1000;
const POSITION = 'Медіабаєр — Facebook';
const CREATE_URL = /\/api\/v1\/vacancies$/;
const errorText = {
  headcountRange: t.errors.headcountRange
    .replace('{min}', '1')
    .replace('{max}', '100'),
  titleLong: t.errors.titleLong.replace('{max}', '200'),
};
const NEWEST_OWN_VACANCY = Math.max(
  ...VISIBLE_VACANCIES['recruiter1.gambling@demo'],
);
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,64}$/;
const notFound = (page: Page) =>
  page.getByRole('heading', { level: 1, name: messages.errors.notFoundTitle });
const heading = (page: Page) =>
  page.getByRole('heading', { level: 1, name: t.title, exact: true });
const field = (page: Page, name: string) =>
  page.getByRole('textbox', { name: new RegExp(`^${name}`) });
const position = (page: Page) =>
  page.getByRole('combobox', { name: new RegExp(`^${t.position.label}`) });
const vertical = (page: Page) =>
  page.getByRole('combobox', { name: new RegExp(`^${t.vertical.label}`) });
const teamLead = (page: Page) =>
  page.getByRole('combobox', { name: new RegExp(`^${t.teamLead.label}`) });
const LEADS = {
  vasyl: 'Василь Мороз',
  taras: 'Тарас Лисенко',
  dmytro: 'Дмитро Савченко',
};
const leadOption = (page: Page, name: string) =>
  page.getByRole('option', { name: new RegExp(`^${name}`) });
const saveDraft = (page: Page) =>
  page.getByRole('button', { name: t.actions.saveDraft, exact: true });
const publish = (page: Page) =>
  page.getByRole('button', { name: t.actions.create, exact: true });
const creates = (page: Page) => {
  const seen: Request[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && CREATE_URL.test(request.url()))
      seen.push(request);
  });
  return seen;
};

/** Runs after a failure too; a leftover of an earlier broken run (older than ten minutes) goes as well: «Усі» of this user must stay as seeded for vacancies.spec.ts. */
async function sweepOwnDrafts(page: Page) {
  const list = await page.request.get('/api/v1/vacancies?status=DRAFT');
  const { items } = (await list.json()) as {
    items: { id: string; title: string; createdAt: string }[];
  };
  const stale = Date.now() - STALE_AFTER_MS;
  for (const item of items.filter(
    (draft) =>
      draft.title.startsWith(OWN_DRAFT_PREFIX) ||
      (draft.title.startsWith(E2E_DRAFT_PREFIX) &&
        Date.parse(draft.createdAt) < stale),
  )) {
    const removed = await page.request.delete(`/api/v1/vacancies/${item.id}`, {
      headers: MUTATION_HEADERS,
      data: {},
    });
    expect([200, 404], await removed.text()).toContain(removed.status());
  }
}

type StubbedCreate = {
  verticalId: string;
  positionId?: string;
  title: string;
  headcount: number;
  priority: VacancyDetail['priority'];
};

/** The answer a create would give, built from the request: contract and UI are exercised without leaving residue in the seeded lists. */
function stubbedVacancy(
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

async function choosePosition(page: Page) {
  await position(page).click();
  await page.getByRole('option', { name: POSITION, exact: true }).click();
  await expect(field(page, t.titleField.label)).toHaveValue(POSITION);
}

for (const user of [
  'recruiter1.gambling@demo',
  'head.recruiter.gambling@demo',
  'admin@demo',
] as const) {
  test.describe(`${user} authors vacancies`, () => {
    test.use({ storageState: sessionFile(user) });

    test('the list offers a real link to the form (header on desktop, sticky bar on a phone) and the direct URL opens it [D89, STORY-VAC-01-1]', async ({
      page,
      isMobile,
    }) => {
      await openHydrated(page, '/vacancies');
      const link = page
        .locator(
          isMobile ? '[data-sticky-action-bar] a' : 'a[href="/vacancies/new"]',
        )
        .filter({ visible: true })
        .first();
      await expect(link).toHaveText(messages.vacancies.draft.create);
      await expect(link).toHaveAttribute('href', '/vacancies/new');
      if (isMobile)
        await expect(page.locator('[data-sticky-action-bar]')).toBeVisible();
      await link.click();
      await expect(page).toHaveURL(/\/vacancies\/new$/);
      await expect(heading(page)).toBeVisible();

      const direct = await page.goto('/vacancies/new');
      expect(direct?.status()).toBe(200);
      await expect(heading(page)).toBeVisible();
    });
  });
}

test.describe('leave guard, Recruiter [F9, STORY-VAC-01-1]', () => {
  test.use({ storageState: sessionFile('recruiter1.gambling@demo') });

  test('browser Back with unsaved input asks first; staying keeps the values, leaving goes back', async ({
    page,
  }) => {
    await openHydrated(page, '/vacancies');
    await page
      .locator('a[href="/vacancies/new"]')
      .filter({ visible: true })
      .first()
      .click();
    await expect(heading(page)).toBeVisible();
    await field(page, t.titleField.label).fill('Незбережена назва');

    await page.goBack();
    const dialog = page.getByRole('alertdialog');
    await expect(
      dialog.getByText(messages.common.leaveTitle, { exact: true }),
    ).toBeVisible();
    await dialog
      .getByRole('button', { name: messages.common.leaveStay, exact: true })
      .click();
    await expect(page).toHaveURL(/\/vacancies\/new$/);
    await expect(field(page, t.titleField.label)).toHaveValue(
      'Незбережена назва',
    );

    await page.goBack();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: messages.common.leaveConfirm, exact: true })
      .click();
    await expect(page).toHaveURL(/\/vacancies$/);
  });

  test('a clean form leaves without a question, a dirty one asks first [F9]', async ({
    page,
  }) => {
    await openHydrated(page, '/vacancies/new');
    await page.getByRole('link', { name: messages.common.cancel }).click();
    await expect(page).toHaveURL(/\/vacancies$/);
    await page.goto('/vacancies/new');
    await field(page, t.titleField.label).fill('Незбережена назва');
    await page.getByRole('link', { name: messages.common.cancel }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(
      dialog.getByText(messages.common.leaveTitle, { exact: true }),
    ).toBeVisible();
    await dialog
      .getByRole('button', { name: messages.common.leaveStay, exact: true })
      .click();
    await expect(page).toHaveURL(/\/vacancies\/new$/);
    await expect(field(page, t.titleField.label)).toHaveValue(
      'Незбережена назва',
    );
  });
});

for (const user of [
  'hr@demo',
  'head.hr@demo',
  'vasyl.tl@demo',
  'taras.tl@demo',
  'finance@demo',
] as const) {
  test.describe(`${user} cannot author`, () => {
    test.use({ storageState: sessionFile(user) });

    test('the list has no create control and /vacancies/new is a 404 [D89, VIS-02]', async ({
      page,
    }) => {
      if (user !== 'finance@demo') {
        await openHydrated(page, '/vacancies');
        await expect(
          page.getByRole('link', { name: messages.vacancies.draft.create }),
        ).toHaveCount(0);
      }
      const response = await page.goto('/vacancies/new');
      expect(response?.status()).toBe(404);
      await expect(notFound(page)).toBeVisible();
    });
  });
}

test.describe('create form, Recruiter [STORY-VAC-01-1, STORY-VAC-01-3]', () => {
  test.use({ storageState: sessionFile('recruiter1.gambling@demo') });

  test.afterEach(({ page }) => sweepOwnDrafts(page));

  test('shows what is missing on each action, flags only that action’s fields and sends nothing [ux §4]', async ({
    page,
  }) => {
    const sent = creates(page);
    await openHydrated(page, '/vacancies/new');
    await expect(
      page.getByRole('combobox', {
        name: new RegExp(`^${t.vertical.label}`),
      }),
    ).toBeDisabled();

    await publish(page).click();
    await expect(
      page.getByRole('alert').filter({ hasText: /^Виправте 2 поля/ }),
    ).toBeVisible();
    await expect(
      page.getByText(messages.vacancies.draftErrors.positionRequired, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(t.errors.titleRequired, { exact: true }),
    ).toBeVisible();
    await expect(position(page)).toBeFocused();

    await saveDraft(page).click();
    await expect(
      page.getByText(messages.vacancies.draftErrors.positionRequired),
    ).toHaveCount(0);
    await expect(
      page.getByText(t.errors.titleRequired, { exact: true }),
    ).toBeVisible();
    await expect(field(page, t.titleField.label)).toBeFocused();

    await field(page, t.headcount.label).fill('101');
    await field(page, t.headcount.label).blur();
    await expect(
      page.getByText(errorText.headcountRange, { exact: true }),
    ).toBeVisible();
    expect(sent).toHaveLength(0);
  });

  test('Enter in a field never submits; a draft saves once with one key, lands on «Чернетки» and leaves no stale history [AC1, AC4, D83]', async ({
    page,
  }) => {
    const sent = creates(page);
    const title = `${OWN_DRAFT_PREFIX} ${Date.now()}`;
    await page.goto('/vacancies');
    await openHydrated(page, '/vacancies/new');
    const input = field(page, t.titleField.label);
    await input.fill(title);
    await input.press('Enter');
    await field(page, t.headcount.label).press('Enter');
    expect(sent).toHaveLength(0);

    await saveDraft(page).dblclick();
    await expect(page).toHaveURL(
      new RegExp(
        `/vacancies\\?(?=.*status=DRAFT)(?=.*vertical=${DEMO_VERTICALS.gambling})(?=.*vacancy=[0-9a-f-]{36})`,
      ),
    );
    expect(sent).toHaveLength(1);
    const body = sent[0]!.postDataJSON() as Record<string, unknown>;
    expect(body).toEqual({
      mode: 'DRAFT',
      verticalId: DEMO_VERTICALS.gambling,
      title,
      headcount: 1,
      priority: 'NORMAL',
    });
    expect(await sent[0]!.headerValue('idempotency-key')).toMatch(
      IDEMPOTENCY_KEY,
    );
    await expect(
      page.getByText(t.toast.draftSaved, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: title }).filter({ visible: true }).first(),
    ).toBeVisible();
    // Released before the replace: the form is one clean Back away (no leave question), with no ghost entry behind it.
    await page.goBack();
    await expect(page).toHaveURL(/\/vacancies\/new$/);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/vacancies$/);
  });

  test('publishing fills the title from the position, sends one request with the contract body and opens the card; Ctrl+Enter is the primary action [AC2, AC4]', async ({
    page,
  }) => {
    const sent = creates(page);
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    // A real publish cannot be undone (no delete for an open vacancy), so the answer is stubbed from the request: contract and UI, no residue in the seeded lists.
    await page.route(CREATE_URL, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      const body = route.request().postDataJSON() as StubbedCreate;
      await gate;
      const created = stubbedVacancy(body, 'OPEN');
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(created),
      });
    });

    await openHydrated(page, '/vacancies/new');
    await choosePosition(page);
    await expect(
      page.getByText(t.titleField.autoHint, { exact: true }),
    ).toBeVisible();
    // The visible segment is clicked, not the visually hidden radio input behind it.
    await page.getByText(t.priority.URGENT, { exact: true }).click();
    await expect(
      page.getByRole('radio', { name: t.priority.URGENT, exact: true }),
    ).toBeChecked();
    await field(page, t.titleField.label).press('Control+Enter');
    // A second press while the first request is in flight changes nothing.
    await publish(page).click();
    await expect(publish(page)).toHaveAttribute('aria-busy', 'true');
    await expect(saveDraft(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(field(page, t.titleField.label)).toHaveAttribute(
      'readonly',
      '',
    );
    release();
    await expect(page).toHaveURL(
      /\/vacancies\/5c1d4f6a-7b8e-4c9d-8e0f-1a2b3c4d5e6f$/,
    );

    expect(sent).toHaveLength(1);
    expect(sent[0]!.postDataJSON()).toEqual({
      mode: 'PUBLISH',
      verticalId: DEMO_VERTICALS.gambling,
      positionId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      title: POSITION,
      headcount: 1,
      priority: 'URGENT',
    });
    expect(await sent[0]!.headerValue('idempotency-key')).toMatch(
      IDEMPOTENCY_KEY,
    );
  });

  test('a network failure keeps the values and offers a retry that reuses the key [ux §4.2]', async ({
    page,
  }) => {
    const sent = creates(page);
    let attempt = 0;
    await page.route(CREATE_URL, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      attempt += 1;
      if (attempt === 1) return route.abort('failed');
      return route.fulfill(await problemFulfill(429, 'RATE_LIMITED'));
    });
    await openHydrated(page, '/vacancies/new');
    await choosePosition(page);
    await publish(page).click();
    await expect(
      page.getByText(t.toast.noConnection, { exact: true }),
    ).toBeVisible();
    await expect(field(page, t.titleField.label)).toHaveValue(POSITION);
    await page
      .getByRole('button', { name: t.toast.retry, exact: true })
      .click();
    await expect(
      page.getByText(t.toast.rateLimited, { exact: true }),
    ).toBeVisible();
    expect(sent).toHaveLength(2);
    expect(await sent[1]!.headerValue('idempotency-key')).toBe(
      await sent[0]!.headerValue('idempotency-key'),
    );
  });

  test('a saved draft is listed under «Чернетки» and absent from «Усі» and from a search [D110, STORY-VAC-01-3]', async ({
    page,
  }) => {
    const title = `${OWN_DRAFT_PREFIX} ${Date.now()}`;
    await openHydrated(page, '/vacancies/new');
    await field(page, t.titleField.label).fill(title);
    await saveDraft(page).click();
    await expect(page).toHaveURL(/\/vacancies\?.*status=DRAFT/);
    const chips = page.getByRole('radiogroup', {
      name: messages.vacancies.filterStatus,
      exact: true,
    });
    await expect(
      chips.getByRole('radio', {
        name: new RegExp(`^${messages.vacancies.filterStatuses.DRAFT}, \\d+$`),
      }),
    ).toBeChecked();
    const listed = (name: string) =>
      page.getByRole('link', { name }).filter({ visible: true });
    await expect(listed(title).first()).toBeVisible();

    await chips
      .getByRole('radio', { name: messages.vacancies.all, exact: true })
      .click();
    await expect(page).not.toHaveURL(/status=/);
    await expect(
      page
        .getByText(vacancyNumber(NEWEST_OWN_VACANCY))
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await expect(listed(title)).toHaveCount(0);

    const found = await page.request.get(
      `/api/v1/vacancies?q=${encodeURIComponent(title)}`,
    );
    expect(found.status()).toBe(200);
    expect(((await found.json()) as { items: unknown[] }).items).toEqual([]);
  });

  test('the footer keeps every action in reach and never covers the last field; on a phone it rides above the bottom navigation [ux §3]', async ({
    page,
    isMobile,
  }) => {
    await openHydrated(page, '/vacancies/new');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const footer = page.locator('[data-slot="form-page-footer"]');
    const actions = [
      footer.getByRole('link', { name: messages.common.cancel, exact: true }),
      saveDraft(page),
      publish(page),
    ];
    for (const action of actions) await expect(action).toBeInViewport();
    const bar = (await footer.boundingBox())!;
    const lastField = (await field(page, t.headcount.label).boundingBox())!;
    expect(lastField.y + lastField.height).toBeLessThanOrEqual(bar.y + 1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (!isMobile) return;
    const nav = (await page.locator('[data-bottom-nav]').boundingBox())!;
    expect(bar.y + bar.height).toBeLessThanOrEqual(nav.y + 1);
    const primary = (await publish(page).boundingBox())!;
    expect(primary.width).toBeGreaterThan(page.viewportSize()!.width * 0.8);
    expect(primary.height).toBeGreaterThanOrEqual(44);
  });

  test('a rejected save keeps every value and reports field errors from the server on the right field [ux §4.1]', async ({
    page,
  }) => {
    await page.route(CREATE_URL, async (route) =>
      route.request().method() === 'POST'
        ? route.fulfill(
            await problemFulfill(400, 'VALIDATION_FAILED', [
              { path: 'body.title', code: 'too_big' },
            ]),
          )
        : route.fallback(),
    );
    await openHydrated(page, '/vacancies/new');
    await field(page, t.titleField.label).fill('Назва для перевірки');
    await saveDraft(page).click();
    await expect(
      page.getByText(errorText.titleLong, { exact: true }),
    ).toBeVisible();
    await expect(field(page, t.titleField.label)).toBeFocused();
    await expect(field(page, t.titleField.label)).toHaveValue(
      'Назва для перевірки',
    );
    await expect(page).toHaveURL(/\/vacancies\/new$/);
  });

  test('the draft limit shows an inline alert with a link to the drafts in a new tab, and keeps the values [D112, ux §4.2]', async ({
    page,
  }) => {
    const sent = creates(page);
    await page.route(CREATE_URL, async (route) =>
      route.request().method() === 'POST'
        ? route.fulfill(await problemFulfill(409, 'DRAFT_LIMIT_REACHED'))
        : route.fallback(),
    );
    await openHydrated(page, '/vacancies/new');
    await field(page, t.titleField.label).fill('Назва для перевірки');
    await saveDraft(page).click();
    const alert = page
      .getByRole('alert')
      .filter({ hasText: /Досягнуто ліміт чернеток \(50\)/ });
    await expect(alert).toBeVisible();
    const drafts = alert.getByRole('link', {
      name: t.alerts.openDrafts,
      exact: true,
    });
    await expect(drafts).toHaveAttribute('href', '/vacancies?status=DRAFT');
    await expect(drafts).toHaveAttribute('target', '_blank');
    await expect(field(page, t.titleField.label)).toHaveValue(
      'Назва для перевірки',
    );
    await expect(page).toHaveURL(/\/vacancies\/new$/);
    await expect(saveDraft(page)).not.toHaveAttribute('aria-busy', 'true');
    expect(sent).toHaveLength(1);
  });

  for (const [status, code, outcome] of [
    [429, 'RATE_LIMITED', t.toast.rateLimited],
    [403, 'FORBIDDEN', t.toast.forbidden],
    [500, 'INTERNAL', t.toast.failed],
  ] as const) {
    test(`a ${status} answer keeps the values and says so in a toast, with a retry only when retrying can help [ux §4.2]`, async ({
      page,
    }) => {
      const sent = creates(page);
      await page.route(CREATE_URL, async (route) =>
        route.request().method() === 'POST'
          ? route.fulfill(await problemFulfill(status, code))
          : route.fallback(),
      );
      await openHydrated(page, '/vacancies/new');
      await field(page, t.titleField.label).fill('Назва для перевірки');
      await saveDraft(page).click();
      await expect(page.getByText(outcome, { exact: true })).toBeVisible();
      await expect(
        page.getByRole('button', { name: t.toast.retry, exact: true }),
      ).toHaveCount(status === 500 ? 1 : 0);
      await expect(field(page, t.titleField.label)).toHaveValue(
        'Назва для перевірки',
      );
      await expect(page).toHaveURL(/\/vacancies\/new$/);
      expect(sent).toHaveLength(1);
      const toast = page.locator('[data-slot="toast"]');
      let previous = '';
      await expect
        .poll(async () => {
          const current = JSON.stringify(await toast.boundingBox());
          const settled = current === previous;
          previous = current;
          return settled;
        })
        .toBe(true);
      const [toastBox, footerBox] = await Promise.all([
        toast.boundingBox(),
        page.locator('[data-slot="form-page-footer"]').boundingBox(),
      ]);
      expect(
        toastBox!.y + toastBox!.height <= footerBox!.y + 0.5 ||
          toastBox!.y >= footerBox!.y + footerBox!.height - 0.5,
      ).toBe(true);
    });
  }

  test('a vertical that is gone shows the inline alert and creates nothing [ux §4.2]', async ({
    page,
  }) => {
    await page.route(CREATE_URL, async (route) =>
      route.request().method() === 'POST'
        ? route.fulfill(await problemFulfill(404, 'NOT_FOUND'))
        : route.fallback(),
    );
    await openHydrated(page, '/vacancies/new');
    await field(page, t.titleField.label).fill('Назва для перевірки');
    await saveDraft(page).click();
    await expect(
      page.getByRole('alert').filter({ hasText: t.alerts.verticalUnavailable }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/vacancies\/new$/);
  });

  test('a reused idempotency key is retried once under a fresh key, then reported as a failure [ux §4.2]', async ({
    page,
  }) => {
    const sent = creates(page);
    await page.route(CREATE_URL, async (route) =>
      route.request().method() === 'POST'
        ? route.fulfill(await problemFulfill(409, 'IDEMPOTENCY_KEY_REUSED'))
        : route.fallback(),
    );
    await openHydrated(page, '/vacancies/new');
    await field(page, t.titleField.label).fill('Назва для перевірки');
    await saveDraft(page).click();
    await expect(page.getByText(t.toast.failed, { exact: true })).toBeVisible();
    expect(sent).toHaveLength(2);
    expect(await sent[1]!.headerValue('idempotency-key')).not.toBe(
      await sent[0]!.headerValue('idempotency-key'),
    );
  });

  test('after a successful save, more clicks and Ctrl+Enter while the list is still opening send nothing more [B1, STORY-VAC-01-1]', async ({
    page,
  }) => {
    const sent = creates(page);
    let landing = false;
    let openList = () => {};
    const listGate = new Promise<void>((resolve) => (openList = resolve));
    await page.route(CREATE_URL, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      landing = true;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(
          stubbedVacancy(
            route.request().postDataJSON() as StubbedCreate,
            'DRAFT',
          ),
        ),
      });
    });
    await page.route(
      (url) => url.pathname === '/vacancies',
      async (route) => {
        if (landing) await listGate;
        await route.continue();
      },
    );
    await openHydrated(page, '/vacancies/new');
    await field(page, t.titleField.label).fill('Назва для перевірки');
    await saveDraft(page).click();
    await expect(
      page.getByText(t.toast.draftSaved, { exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/vacancies\/new$/);

    // The form stays locked until the list opens; a locked button is still clickable for a real user, Playwright's actionability would refuse it.
    await saveDraft(page).click({ force: true });
    await field(page, t.titleField.label).focus();
    await page.keyboard.press('Control+Enter');
    await publish(page).click({ force: true });
    expect(sent).toHaveLength(1);

    openList();
    await expect(page).toHaveURL(/\/vacancies\?.*status=DRAFT/);
    expect(sent).toHaveLength(1);
  });

  test('a submit chunk that fails to load reports an error, and the form works again once it loads [B2]', async ({
    page,
  }) => {
    const submitChunks = new Set<string>();
    page.on('response', (response) => {
      const url = response.url();
      if (!/\/_next\/static\/chunks\/.+\.js/.test(url)) return;
      void response
        .text()
        .then((source) => {
          if (source.includes('DRAFT_LIMIT_REACHED')) submitChunks.add(url);
        })
        .catch(() => undefined);
    });
    await openHydrated(page, '/vacancies/new');
    await expect.poll(() => submitChunks.size).toBeGreaterThan(0);

    let blocked = true;
    await page.route(
      (url) => submitChunks.has(url.href),
      (route) => (blocked ? route.abort('failed') : route.continue()),
    );
    await page.reload();
    await waitForHydration(page);
    const sent = creates(page);
    await page.route(CREATE_URL, async (route) =>
      route.request().method() === 'POST'
        ? route.fulfill(await problemFulfill(429, 'RATE_LIMITED'))
        : route.fallback(),
    );
    await field(page, t.titleField.label).fill('Назва для перевірки');
    await saveDraft(page).click();
    const failure = page.locator('[data-slot="toast"]');
    await expect(failure).toBeVisible();
    expect(sent).toHaveLength(0);
    await expect(saveDraft(page)).not.toHaveAttribute('aria-busy', 'true');
    await expect(field(page, t.titleField.label)).not.toHaveAttribute(
      'readonly',
      '',
    );

    // On a phone the toast and its action cover the footer button.
    await failure
      .getByRole('button', { name: messages.common.close, exact: true })
      .click();
    await expect(failure).toHaveCount(0);

    blocked = false;
    await saveDraft(page).click();
    await expect(
      page.getByText(t.toast.rateLimited, { exact: true }),
    ).toBeVisible();
    expect(sent).toHaveLength(1);
  });

  test('a feedback chunk that fails to load never unmounts the form: a draft-limit answer reaches the user as a toast and the values stay [N1]', async ({
    page,
  }) => {
    const feedbackChunks = new Set<string>();
    page.on('response', (response) => {
      const url = response.url();
      if (!/\/_next\/static\/chunks\/.+\.js/.test(url)) return;
      void response
        .text()
        .then((source) => {
          // Only the inline alerts of the form use this key.
          if (source.includes('alerts.openDrafts')) feedbackChunks.add(url);
        })
        .catch(() => undefined);
    });
    await openHydrated(page, '/vacancies/new');
    await expect.poll(() => feedbackChunks.size).toBeGreaterThan(0);

    await page.route(
      (url) => feedbackChunks.has(url.href),
      (route) => route.abort('failed'),
    );
    await page.reload();
    await waitForHydration(page);
    const sent = creates(page);
    await page.route(CREATE_URL, async (route) =>
      route.request().method() === 'POST'
        ? route.fulfill(await problemFulfill(409, 'DRAFT_LIMIT_REACHED'))
        : route.fallback(),
    );
    const title = 'Назва для перевірки';
    await field(page, t.titleField.label).fill(title);
    await saveDraft(page).click();

    const limit = messages.vacancies.createErrors.draftLimitReached.replace(
      '{count}',
      '50',
    );
    await expect(page.getByText(limit, { exact: true })).toBeVisible();
    expect(sent).toHaveLength(1);
    await expect(page).toHaveURL(/\/vacancies\/new$/);
    await expect(heading(page)).toBeVisible();
    await expect(field(page, t.titleField.label)).toHaveValue(title);
    await expect(saveDraft(page)).not.toHaveAttribute('aria-busy', 'true');
    await expect(field(page, t.titleField.label)).not.toHaveAttribute(
      'readonly',
      '',
    );
    // No error page replaced the form.
    await expect(
      page.getByRole('heading', { name: messages.errors.appErrorTitle }),
    ).toHaveCount(0);
  });

  test('the urgency radios keep keyboard focus while a save is pending and after it failed [B-focus]', async ({
    page,
  }) => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route(CREATE_URL, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      await gate;
      await route.fulfill(await problemFulfill(500, 'INTERNAL'));
    });
    await openHydrated(page, '/vacancies/new');
    await choosePosition(page);
    const normal = page.getByRole('radio', {
      name: t.priority.NORMAL,
      exact: true,
    });
    await normal.focus();
    await normal.press('Control+Enter');
    await expect(saveDraft(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(normal).toBeFocused();

    release();
    await expect(page.getByText(t.toast.failed, { exact: true })).toBeVisible();
    await expect(normal).toBeFocused();
    await normal.press('ArrowRight');
    await expect(
      page.getByRole('radio', { name: t.priority.URGENT, exact: true }),
    ).toBeChecked();
  });

  test('a deactivated position is flagged on the position field, which gets the focus [ux §4.1]', async ({
    page,
  }) => {
    await page.route(CREATE_URL, async (route) =>
      route.request().method() === 'POST'
        ? route.fulfill(
            await problemFulfill(409, 'POSITION_INACTIVE', [
              { path: 'body.positionId', code: 'position_inactive' },
            ]),
          )
        : route.fallback(),
    );
    await openHydrated(page, '/vacancies/new');
    await choosePosition(page);
    await publish(page).click();
    await expect(
      page.getByText(messages.vacancies.draftErrors.positionInactive, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(position(page)).toBeFocused();
    await expect(field(page, t.titleField.label)).toHaveValue(POSITION);
  });
});

test.describe('Team Lead picker [STORY-VAC-01-1, vacancy.team_lead.set]', () => {
  test.describe('Admin', () => {
    test.use({ storageState: sessionFile('admin@demo') });
    test.afterEach(({ page }) => sweepOwnDrafts(page));

    test('picks a Team Lead of the chosen vertical by priority and saves it with the draft', async ({
      page,
    }) => {
      const sent = creates(page);
      await openHydrated(page, '/vacancies/new');
      await expect(teamLead(page)).toBeDisabled();
      await expect(teamLead(page)).toHaveAttribute(
        'placeholder',
        t.position.needVertical,
      );

      await chooseOption(page, vertical(page), 'Гемблінг');
      await expect(teamLead(page)).toBeEnabled();
      await expect(teamLead(page)).toHaveAttribute(
        'placeholder',
        t.teamLead.placeholder,
      );
      await teamLead(page).click();
      await expect(leadOption(page, LEADS.taras)).toBeVisible();
      const names = await page.getByRole('option').allTextContents();
      const at = (name: string) =>
        names.findIndex((text) => text.includes(name));
      expect(at(LEADS.vasyl)).toBeGreaterThanOrEqual(0);
      expect(at(LEADS.vasyl)).toBeLessThan(at(LEADS.taras));
      expect(at(LEADS.dmytro)).toBe(-1);
      await expect(leadOption(page, LEADS.vasyl)).toContainText(
        'Тімлід · Гемблінг · П0',
      );
      await leadOption(page, LEADS.taras).click();
      await expect(teamLead(page)).toHaveValue(LEADS.taras);

      const title = `${OWN_DRAFT_PREFIX} ${Date.now()}`;
      await field(page, t.titleField.label).fill(title);
      await saveDraft(page).click();
      await expect(page).toHaveURL(/\/vacancies\?.*status=DRAFT/);
      expect(sent).toHaveLength(1);
      expect(sent[0]!.postDataJSON()).toEqual({
        mode: 'DRAFT',
        verticalId: DEMO_VERTICALS.gambling,
        title,
        headcount: 1,
        priority: 'NORMAL',
        teamLeadId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        // The Admin sees the probation field with its default, so the default travels.
        probationDays: 90,
      });
      const id = new URL(page.url()).searchParams.get('vacancy');
      const stored = await page.request.get(`/api/v1/vacancies/${id}`);
      expect(
        ((await stored.json()) as { teamLead: { fullName: string } | null })
          .teamLead?.fullName,
      ).toBe(LEADS.taras);
    });

    test('a vertical change clears the Team Lead and the position and says so; the new vertical offers its own Team Leads', async ({
      page,
    }) => {
      await openHydrated(page, '/vacancies/new');
      await chooseOption(page, vertical(page), 'Гемблінг');
      await choosePosition(page);
      await teamLead(page).click();
      await leadOption(page, LEADS.vasyl).click();
      await expect(teamLead(page)).toHaveValue(LEADS.vasyl);

      await chooseOption(page, vertical(page), 'Крипто');
      await expect(teamLead(page)).toHaveValue('');
      await expect(position(page)).toHaveValue('');
      await expect(
        page.getByText(t.vertical.resetBoth, { exact: true }),
      ).toBeVisible();

      await teamLead(page).click();
      await expect(leadOption(page, LEADS.dmytro)).toBeVisible();
      await expect(leadOption(page, LEADS.vasyl)).toHaveCount(0);
      await leadOption(page, LEADS.dmytro).click();
      await chooseOption(page, vertical(page), 'Гемблінг');
      await expect(teamLead(page)).toHaveValue('');
      await expect(
        page.getByText(t.vertical.resetTeamLead, { exact: true }),
      ).toBeVisible();
    });

    test('a Team Lead the server refuses is flagged on its field, which gets the focus; the list is read again [ux §4.1]', async ({
      page,
    }) => {
      let listed = 0;
      await page.route(/\/verticals\/[^/]+\/team-leads$/, (route) => {
        listed += 1;
        return route.fallback();
      });
      await page.route(CREATE_URL, async (route) =>
        route.request().method() === 'POST'
          ? route.fulfill(
              await problemFulfill(400, 'VALIDATION_FAILED', [
                { path: 'body.teamLeadId', code: 'invalid_team_lead' },
              ]),
            )
          : route.fallback(),
      );
      await openHydrated(page, '/vacancies/new');
      await chooseOption(page, vertical(page), 'Гемблінг');
      await teamLead(page).click();
      await leadOption(page, LEADS.vasyl).click();
      await field(page, t.titleField.label).fill('Назва для перевірки');
      await saveDraft(page).click();
      await expect(
        page.getByText(messages.vacancies.draftErrors.teamLeadInvalid, {
          exact: true,
        }),
      ).toBeVisible();
      await expect(teamLead(page)).toBeFocused();
      await expect(teamLead(page)).toHaveValue(LEADS.vasyl);
      await expect(page).toHaveURL(/\/vacancies\/new$/);
      const before = listed;
      await teamLead(page).click();
      await expect(leadOption(page, LEADS.taras)).toBeVisible();
      expect(listed).toBeGreaterThan(before);
    });

    test('a failed list load shows the retry row and the retry loads the list', async ({
      page,
    }) => {
      let fail = true;
      await page.route(/\/verticals\/[^/]+\/team-leads$/, async (route) =>
        fail
          ? route.fulfill(await problemFulfill(403, 'FORBIDDEN'))
          : route.fallback(),
      );
      await openHydrated(page, '/vacancies/new');
      await chooseOption(page, vertical(page), 'Гемблінг');
      await teamLead(page).click();
      await expect(
        page.getByText(messages.common.comboboxFailed, { exact: true }),
      ).toBeVisible();
      fail = false;
      await page
        .getByRole('button', { name: messages.common.retry, exact: true })
        .click();
      await expect(leadOption(page, LEADS.vasyl)).toBeVisible();
    });
  });

  test.describe('Head Recruiter', () => {
    test.use({ storageState: sessionFile('head.recruiter.gambling@demo') });

    test('offers only the Team Leads of the own vertical, which is preset', async ({
      page,
    }) => {
      await openHydrated(page, '/vacancies/new');
      await expect(teamLead(page)).toBeEnabled();
      await teamLead(page).click();
      await expect(leadOption(page, LEADS.vasyl)).toBeVisible();
      await expect(leadOption(page, LEADS.taras)).toBeVisible();
      await expect(leadOption(page, LEADS.dmytro)).toHaveCount(0);
    });
  });

  test.describe('Recruiter', () => {
    test.use({ storageState: sessionFile('recruiter1.gambling@demo') });

    test('has no Team Lead field and the API refuses the list', async ({
      page,
    }) => {
      await openHydrated(page, '/vacancies/new');
      await expect(field(page, t.titleField.label)).toBeVisible();
      await expect(teamLead(page)).toHaveCount(0);
      await expect(page.getByText(t.teamLead.hint)).toHaveCount(0);
      const answer = await page.request.get(
        `/api/v1/verticals/${DEMO_VERTICALS.gambling}/team-leads`,
      );
      expect(answer.status()).toBe(403);
    });
  });
});

const DRAFT_CHIP = new RegExp(
  `^${messages.vacancies.filterStatuses.DRAFT}(, \\d+)?$`,
);
const statusChips = (page: Page) =>
  page.getByRole('radiogroup', {
    name: messages.vacancies.filterStatus,
    exact: true,
  });
const ownDraftCount = async (page: Page) =>
  (
    (await (
      await page.request.get('/api/v1/vacancies/drafts/count')
    ).json()) as {
      count: number;
    }
  ).count;

for (const [user, picksVertical] of [
  ['admin@demo', true],
  ['head.recruiter.gambling@demo', false],
  ['recruiter2.gambling@demo', false],
] as const) {
  test.describe(`own draft in the list after saving, ${user} [STORY-VAC-01-3, D110]`, () => {
    test.use({ storageState: sessionFile(user) });
    test.afterEach(({ page }) => sweepOwnDrafts(page));

    test('the «Чернетки» count follows the save and the new row is a draft row, selected on a wide screen', async ({
      page,
      isMobile,
    }) => {
      const title = `${OWN_DRAFT_PREFIX} ${Date.now()}`;
      await openHydrated(page, '/vacancies');
      const count = statusChips(page)
        .getByRole('radio', { name: DRAFT_CHIP })
        .locator('.tabular-nums');
      await expect(count).toHaveText(/^\d+$/);

      await page
        .locator(
          isMobile ? '[data-sticky-action-bar] a' : 'a[href="/vacancies/new"]',
        )
        .filter({ visible: true })
        .first()
        .click();
      await expect(heading(page)).toBeVisible();
      if (picksVertical) await chooseOption(page, vertical(page), 'Гемблінг');
      await field(page, t.titleField.label).fill(title);
      await saveDraft(page).click();
      await expect(page).toHaveURL(/\/vacancies\?.*status=DRAFT/);

      await expect(
        page.getByRole('link', { name: title }).filter({ visible: true }),
      ).toHaveCount(1);
      await expect
        .poll(
          async () =>
            (await count.innerText()) === String(await ownDraftCount(page)),
        )
        .toBe(true);
      expect(Number(await count.innerText())).toBeGreaterThanOrEqual(1);
      await expect(
        page.getByText(messages.vacancies.draft.empty.title),
      ).toHaveCount(0);

      const row = (
        isMobile
          ? page
              .getByRole('list', {
                name: messages.vacancies.caption,
                exact: true,
              })
              .getByRole('listitem')
          : page
              .getByRole('table', {
                name: messages.vacancies.caption,
                exact: true,
              })
              .getByRole('row')
      ).filter({ hasText: title });
      await expect(row).toHaveCount(1);
      const badge = row.getByText(messages.vacancies.status.DRAFT, {
        exact: true,
      });
      await expect(badge).toBeVisible();
      await expect(badge).toHaveCSS('border-top-style', 'dashed');
      await expect(row).toContainText(messages.vacancies.draft.noPosition);
      await expect(row).toContainText(messages.vacancies.notOpenedYet);
      if (isMobile) {
        const card = (await row.boundingBox())!;
        expect(card.x).toBeGreaterThanOrEqual(0);
        expect(card.x + card.width).toBeLessThanOrEqual(
          page.viewportSize()!.width,
        );
      } else {
        await expect(
          row.getByRole('button', {
            name: messages.vacancies.previewSelect.replace('{title}', title),
          }),
        ).toHaveAttribute('aria-pressed', 'true');
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    });
  });
}

test.describe('Head Recruiter names the Team Lead of the own vertical [STORY-VAC-01-1, vacancy.team_lead.set]', () => {
  test.use({ storageState: sessionFile('head.recruiter.gambling@demo') });
  test.afterEach(({ page }) => sweepOwnDrafts(page));

  test('the chosen Team Lead travels with the draft, and clearing it sends none', async ({
    page,
  }) => {
    const sent = creates(page);
    await openHydrated(page, '/vacancies/new');
    await teamLead(page).click();
    await leadOption(page, LEADS.vasyl).click();
    await expect(teamLead(page)).toHaveValue(LEADS.vasyl);
    await page
      .getByRole('button', { name: messages.common.comboboxClear, exact: true })
      .click();
    await expect(teamLead(page)).toHaveValue('');
    await teamLead(page).click();
    await leadOption(page, LEADS.taras).click();

    await field(page, t.titleField.label).fill(
      `${OWN_DRAFT_PREFIX} ${Date.now()}`,
    );
    await saveDraft(page).click();
    await expect(page).toHaveURL(/\/vacancies\?.*status=DRAFT/);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.postDataJSON()).toMatchObject({
      mode: 'DRAFT',
      verticalId: DEMO_VERTICALS.gambling,
      teamLeadId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    const id = new URL(page.url()).searchParams.get('vacancy');
    const stored = await page.request.get(`/api/v1/vacancies/${id}`);
    expect(
      ((await stored.json()) as { teamLead: { fullName: string } | null })
        .teamLead?.fullName,
    ).toBe(LEADS.taras);
  });
});

test.describe('Team Lead field layout, Admin [STORY-VAC-01-1, ux §3]', () => {
  test.use({ storageState: sessionFile('admin@demo') });

  test('it is a full-width row after the urgency control, readable without zoom; its list stays on the screen', async ({
    page,
    isMobile,
  }) => {
    await openHydrated(page, '/vacancies/new');
    await chooseOption(page, vertical(page), 'Гемблінг');
    const lead = (await teamLead(page).boundingBox())!;
    const title = (await field(page, t.titleField.label).boundingBox())!;
    const urgency = (await page
      .getByRole('radio', { name: t.priority.URGENT })
      .boundingBox())!;
    const { width: screenWidth, height: screenHeight } = page.viewportSize()!;
    expect(Math.abs(lead.width - title.width)).toBeLessThanOrEqual(1);
    expect(lead.y).toBeGreaterThan(urgency.y + urgency.height - 1);
    expect(lead.height).toBeGreaterThanOrEqual(isMobile ? 44 : 40);
    expect(lead.x + lead.width).toBeLessThanOrEqual(screenWidth);
    if (isMobile) await expect(teamLead(page)).toHaveCSS('font-size', '16px');
    await expect(
      page.getByText(t.teamLead.hint, { exact: true }),
    ).toBeVisible();

    await teamLead(page).click();
    const list = (await page.getByRole('listbox').boundingBox())!;
    expect(list.x).toBeGreaterThanOrEqual(0);
    expect(list.x + list.width).toBeLessThanOrEqual(screenWidth);
    expect(list.y).toBeGreaterThanOrEqual(0);
    expect(list.height).toBeLessThanOrEqual(screenHeight * 0.6 + 1);
    const option = (await leadOption(page, LEADS.vasyl).boundingBox())!;
    expect(option.height).toBeGreaterThanOrEqual(isMobile ? 44 : 36);
    await leadOption(page, LEADS.vasyl).click();
    await expect(teamLead(page)).toHaveValue(LEADS.vasyl);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
});

const level = (page: Page) =>
  page.getByRole('combobox', { name: new RegExp(`^${t.seniority.label}`) });
const workFormat = (page: Page) =>
  page.getByRole('combobox', { name: new RegExp(`^${t.workFormat.label}`) });
const employment = (page: Page) =>
  page.getByRole('combobox', {
    name: new RegExp(`^${t.employmentType.label}`),
  });
const currency = (page: Page) =>
  page.getByRole('combobox', { name: new RegExp(`^${t.salary.currency}`) });
const salaryFrom = (page: Page) => field(page, t.salary.from);
const salaryTo = (page: Page) => field(page, t.salary.to);
const probation = (page: Page) => field(page, t.probation.label);
const NBSP = '\u00a0';
const probationRange = t.errors.probationRange
  .replace('{min}', '30')
  .replace('{max}', '90');
const probationReadOnly = t.probation.readOnly.replace('{days}', '90');
const draftLimitReason =
  messages.vacancies.createErrors.draftLimitReached.replace('{count}', '50');
const COUNT_URL = /\/api\/v1\/vacancies\/drafts\/count$/;

/** Fills the title and the vertical so the group under test is the only thing left to do. */
async function startDraft(page: Page, title: string) {
  await openHydrated(page, '/vacancies/new');
  if (await vertical(page).isEnabled())
    await chooseOption(page, vertical(page), 'Гемблінг');
  await field(page, t.titleField.label).fill(title);
}

/** The save is refused by a stub, so a test can read the request without storing a draft or spending the create limit. */
const refuseCreate = (page: Page) =>
  page.route(CREATE_URL, async (route) =>
    route.request().method() === 'POST'
      ? route.fulfill(await problemFulfill(500, 'INTERNAL'))
      : route.fallback(),
  );

/** Opens the focused select with the arrow key and walks `downs` options down; Radix moves focus in a timeout, so each step waits for it. */
async function pickByKeys(
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

test.describe('group «Умови», Admin [STORY-VAC-01-1, D115, D116]', () => {
  test.use({ storageState: sessionFile('admin@demo') });
  test.afterEach(({ page }) => sweepOwnDrafts(page));

  test('offers the closed lists, shows amounts in their normal form, sends the contract body and stores every value', async ({
    page,
  }) => {
    const sent = creates(page);
    const title = `${OWN_DRAFT_PREFIX} ${Date.now()}`;
    await startDraft(page, title);
    await expectOptions(page, level(page), [
      messages.vacancies.notSpecified,
      'Джуніор',
      'Мідл',
      'Сеніор',
      'Лід',
    ]);
    await expectOptions(page, currency(page), [
      messages.vacancies.notSpecified,
      t.salary.currencies.USD,
      t.salary.currencies.EUR,
      t.salary.currencies.UAH,
    ]);
    await chooseOption(page, level(page), 'Мідл');
    await chooseOption(
      page,
      workFormat(page),
      messages.vacancies.workFormat.HYBRID,
    );
    await chooseOption(page, employment(page), 'Повна зайнятість');
    await field(page, t.location.label).fill('Київ');
    await salaryFrom(page).fill('2500');
    await salaryTo(page).fill('4000,50');
    await chooseOption(page, currency(page), t.salary.currencies.USD);
    await expect(salaryFrom(page)).toHaveValue(`2${NBSP}500`);
    await expect(salaryTo(page)).toHaveValue(`4${NBSP}000,5`);
    await expect(probation(page)).toHaveValue('90');
    await probation(page).fill('60');
    await saveDraft(page).click();
    await expect(page).toHaveURL(/\/vacancies\?.*status=DRAFT/);

    expect(sent).toHaveLength(1);
    expect(sent[0]!.postDataJSON()).toEqual({
      mode: 'DRAFT',
      verticalId: DEMO_VERTICALS.gambling,
      title,
      headcount: 1,
      priority: 'NORMAL',
      seniority: 'Мідл',
      workFormat: 'HYBRID',
      employmentType: 'Повна зайнятість',
      location: 'Київ',
      salaryMinMinor: '250000',
      salaryMaxMinor: '400050',
      salaryCurrency: 'USD',
      probationDays: 60,
    });
    const id = new URL(page.url()).searchParams.get('vacancy');
    const stored = (await (
      await page.request.get(`/api/v1/vacancies/${id}`)
    ).json()) as VacancyDetail;
    expect(stored).toMatchObject({
      seniority: 'Мідл',
      workFormat: 'HYBRID',
      employmentType: 'Повна зайнятість',
      location: 'Київ',
      salaryMinMinor: '250000',
      salaryMaxMinor: '400050',
      salaryCurrency: 'USD',
      probationDays: 60,
    });
  });

  test('an untouched group sends the default probation and nothing else of «Умови»; «Не вказано» clears a choice again', async ({
    page,
  }) => {
    const sent = creates(page);
    await page.route(CREATE_URL, async (route) =>
      route.request().method() === 'POST'
        ? route.fulfill(await problemFulfill(500, 'INTERNAL'))
        : route.fallback(),
    );
    const title = `${OWN_DRAFT_PREFIX} ${Date.now()}`;
    await startDraft(page, title);
    await chooseOption(page, level(page), 'Лід');
    await chooseOption(page, level(page), messages.vacancies.notSpecified);
    await saveDraft(page).click();
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0]!.postDataJSON()).toEqual({
      mode: 'DRAFT',
      verticalId: DEMO_VERTICALS.gambling,
      title,
      headcount: 1,
      priority: 'NORMAL',
      probationDays: 90,
    });
  });

  test('a probation outside 30–90 is refused on its field, which gets the focus, and nothing is sent', async ({
    page,
  }) => {
    const sent = creates(page);
    await startDraft(page, `${OWN_DRAFT_PREFIX} ${Date.now()}`);
    for (const value of ['29', '91', '9x']) {
      await probation(page).fill(value);
      await saveDraft(page).click();
      await expect(
        page.getByText(probationRange, { exact: true }),
      ).toBeVisible();
      await expect(probation(page)).toBeFocused();
      await expect(probation(page)).toHaveAttribute('aria-invalid', 'true');
    }
    await probation(page).fill('30');
    await probation(page).blur();
    await expect(page.getByText(probationRange, { exact: true })).toHaveCount(
      0,
    );
    expect(sent).toHaveLength(0);
  });

  test('the salary rules are checked before anything is sent: amount and currency go together, the maximum never undercuts the minimum, text is refused [ux §4.1]', async ({
    page,
  }) => {
    const sent = creates(page);
    await startDraft(page, `${OWN_DRAFT_PREFIX} ${Date.now()}`);

    await salaryFrom(page).fill('100');
    await saveDraft(page).click();
    await expect(
      page.getByText(t.errors.salaryCurrencyRequired, { exact: true }),
    ).toBeVisible();
    await expect(currency(page)).toBeFocused();

    await salaryFrom(page).fill('');
    await chooseOption(page, currency(page), t.salary.currencies.EUR);
    await saveDraft(page).click();
    await expect(
      page.getByText(t.errors.salaryCurrencyNoAmount, { exact: true }),
    ).toBeVisible();
    await expect(currency(page)).toBeFocused();

    await salaryFrom(page).fill('500');
    await salaryTo(page).fill('499,99');
    await saveDraft(page).click();
    await expect(
      page.getByText(t.errors.salaryMaxBelowMin, { exact: true }),
    ).toBeVisible();
    await expect(salaryTo(page)).toBeFocused();
    await expect(salaryTo(page)).toHaveAttribute('aria-invalid', 'true');

    await salaryTo(page).fill('abc');
    await salaryTo(page).blur();
    await expect(
      page.getByText(t.errors.salaryNumber, { exact: true }),
    ).toBeVisible();
    await expect(salaryTo(page)).toHaveValue('abc');

    await salaryTo(page).fill('99999999999999999');
    await salaryTo(page).blur();
    await expect(
      page.getByText(t.errors.salaryTooLarge, { exact: true }),
    ).toBeVisible();
    expect(sent).toHaveLength(0);
  });

  test('answers of the server land on the right fields, the first in page order gets the focus and every value stays [ux §4.1]', async ({
    page,
  }) => {
    await page.route(CREATE_URL, async (route) =>
      route.request().method() === 'POST'
        ? route.fulfill(
            await problemFulfill(400, 'VALIDATION_FAILED', [
              { path: 'body.probationDays', code: 'too_big' },
              { path: 'body.salaryMaxMinor', code: 'custom' },
              { path: 'body.location', code: 'too_big' },
            ]),
          )
        : route.fallback(),
    );
    await startDraft(page, 'Назва для перевірки');
    await field(page, t.location.label).fill('Київ');
    await salaryFrom(page).fill('100');
    await chooseOption(page, currency(page), t.salary.currencies.USD);
    await saveDraft(page).click();
    await expect(
      page.getByText(t.errors.locationLong.replace('{max}', '200'), {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(t.errors.salaryMaxBelowMin, { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(probationRange, { exact: true })).toBeVisible();
    await expect(field(page, t.location.label)).toBeFocused();
    await expect(field(page, t.location.label)).toHaveValue('Київ');
    await expect(salaryFrom(page)).toHaveValue('100');
    await expect(page).toHaveURL(/\/vacancies\/new$/);
  });

  test('a salary currency the server refuses reads as «choose a currency» when an amount was sent', async ({
    page,
  }) => {
    await page.route(CREATE_URL, async (route) =>
      route.request().method() === 'POST'
        ? route.fulfill(
            await problemFulfill(400, 'VALIDATION_FAILED', [
              { path: 'body.salaryCurrency', code: 'custom' },
            ]),
          )
        : route.fallback(),
    );
    await startDraft(page, 'Назва для перевірки');
    await salaryFrom(page).fill('100');
    await chooseOption(page, currency(page), t.salary.currencies.USD);
    await saveDraft(page).click();
    await expect(
      page.getByText(t.errors.salaryCurrencyRequired, { exact: true }),
    ).toBeVisible();
    await expect(currency(page)).toBeFocused();
  });
  test('every field of «Умови» can be filled and saved with the keyboard alone, in the order of the page [ux §8]', async ({
    page,
  }) => {
    const sent = creates(page);
    await refuseCreate(page);
    const title = `${OWN_DRAFT_PREFIX} ${Date.now()}`;
    await startDraft(page, title);
    const focused = async (locator: ReturnType<typeof field>) => {
      await page.keyboard.press('Tab');
      await expect(locator).toBeFocused();
    };
    await focused(field(page, t.headcount.label));
    await focused(page.getByRole('radio', { name: t.priority.NORMAL }));
    await focused(teamLead(page));
    await focused(level(page));
    await pickByKeys(page, level(page), 2, 'Мідл');
    await focused(workFormat(page));
    await pickByKeys(
      page,
      workFormat(page),
      3,
      messages.vacancies.workFormat.HYBRID,
    );
    await focused(employment(page));
    await pickByKeys(page, employment(page), 1, 'Повна зайнятість');
    await focused(field(page, t.location.label));
    await page.keyboard.type('Київ');
    await focused(salaryFrom(page));
    await page.keyboard.type('2 500,50');
    await focused(salaryTo(page));
    await page.keyboard.type('4000');
    await focused(currency(page));
    await pickByKeys(page, currency(page), 2, t.salary.currencies.EUR);
    await focused(probation(page));
    await page.keyboard.press('Control+A');
    await page.keyboard.type('45');
    await expect(salaryFrom(page)).toHaveValue(`2${NBSP}500,5`);
    await expect(salaryTo(page)).toHaveValue(`4${NBSP}000`);
    await focused(
      page
        .locator('[data-slot="form-page-footer"]')
        .getByRole('link', { name: messages.common.cancel, exact: true }),
    );
    await focused(saveDraft(page));
    await page.keyboard.press('Enter');
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0]!.postDataJSON()).toEqual({
      mode: 'DRAFT',
      verticalId: DEMO_VERTICALS.gambling,
      title,
      headcount: 1,
      priority: 'NORMAL',
      seniority: 'Мідл',
      workFormat: 'HYBRID',
      employmentType: 'Повна зайнятість',
      location: 'Київ',
      salaryMinMinor: '250050',
      salaryMaxMinor: '400000',
      salaryCurrency: 'EUR',
      probationDays: 45,
    });
  });

  for (const [name, from, shown, minor] of [
    ['the Ukrainian form of an amount', '2 500,50', `2${NBSP}500,5`, '250050'],
    ['zero', '0', '0', '0'],
    ['a plain amount with a dot', '1234.5', `1${NBSP}234,5`, '123450'],
    [
      'the largest amount the contract stores',
      '9999999999999,99',
      `9${NBSP}999${NBSP}999${NBSP}999${NBSP}999,99`,
      '999999999999999',
    ],
  ] as const)
    test(`salary edge: ${name} is accepted, shown in its normal form and sent as minor units [ux §4.1]`, async ({
      page,
    }) => {
      const sent = creates(page);
      await refuseCreate(page);
      await startDraft(page, 'Назва для перевірки');
      await salaryFrom(page).fill(from);
      await chooseOption(page, currency(page), t.salary.currencies.USD);
      await salaryFrom(page).blur();
      await expect(salaryFrom(page)).toHaveValue(shown);
      await expect(salaryFrom(page)).not.toHaveAttribute(
        'aria-invalid',
        'true',
      );
      await saveDraft(page).click();
      await expect.poll(() => sent.length).toBe(1);
      expect(sent[0]!.postDataJSON()).toMatchObject({
        salaryMinMinor: minor,
        salaryCurrency: 'USD',
      });
    });

  for (const [name, text, message] of [
    ['a 16-digit amount', '1234567890123456', t.errors.salaryTooLarge],
    ['a 14-digit amount', '10000000000000', t.errors.salaryTooLarge],
    ['a negative amount', '-5', t.errors.salaryNumber],
    ['a negative zero', '-0', t.errors.salaryNumber],
    ['an exponent', '1e3', t.errors.salaryNumber],
    ['three decimals', '2 500,555', t.errors.salaryNumber],
  ] as const)
    for (const [bound, input] of [
      ['minimum', salaryFrom],
      ['maximum', salaryTo],
    ] as const)
      test(`salary edge: ${name} in the ${bound} is refused on its field, keeps the text and sends nothing [ux §4.1]`, async ({
        page,
      }) => {
        const sent = creates(page);
        await startDraft(page, 'Назва для перевірки');
        await chooseOption(page, currency(page), t.salary.currencies.USD);
        await input(page).fill(text);
        await input(page).blur();
        await expect(page.getByText(message, { exact: true })).toBeVisible();
        await expect(input(page)).toHaveAttribute('aria-invalid', 'true');
        await expect(input(page)).toHaveValue(text);
        await saveDraft(page).click();
        await expect(input(page)).toBeFocused();
        expect(sent).toHaveLength(0);
      });

  for (const days of [30, 90])
    test(`probation boundary ${days} is accepted and travels as a number [PROB-02]`, async ({
      page,
    }) => {
      const sent = creates(page);
      await refuseCreate(page);
      await startDraft(page, 'Назва для перевірки');
      await probation(page).fill(String(days));
      await saveDraft(page).click();
      await expect.poll(() => sent.length).toBe(1);
      expect(sent[0]!.postDataJSON()).toMatchObject({ probationDays: days });
      await expect(page.getByText(probationRange, { exact: true })).toHaveCount(
        0,
      );
    });

  test('the widest amounts and the stacked salary errors keep every salary control inside the screen [ux §9]', async ({
    page,
  }) => {
    await startDraft(page, 'Назва для перевірки');
    await salaryFrom(page).fill('9999999999999,99');
    await salaryTo(page).fill('1');
    await salaryFrom(page).blur();
    await salaryTo(page).blur();
    await saveDraft(page).click();
    await expect(
      page.getByText(t.errors.salaryCurrencyRequired, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(t.errors.salaryMaxBelowMin, { exact: true }),
    ).toBeVisible();
    const { width } = page.viewportSize()!;
    for (const input of [salaryFrom(page), salaryTo(page), currency(page)]) {
      const box = (await input.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
});

for (const user of [
  'head.recruiter.gambling@demo',
  'recruiter1.gambling@demo',
] as const) {
  test.describe(`group «Умови», ${user} [D115]`, () => {
    test.use({ storageState: sessionFile(user) });

    test('the read-only probation line and the note after creation sit above the footer and inside the screen, at the end of the form [ux §3]', async ({
      page,
    }) => {
      await startDraft(page, 'Назва для перевірки');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const line = page.getByText(probationReadOnly, { exact: true });
      await expect(line).toBeInViewport();
      const footer = (await page
        .locator('[data-slot="form-page-footer"]')
        .boundingBox())!;
      const box = (await line.boundingBox())!;
      const { width } = page.viewportSize()!;
      expect(box.y + box.height).toBeLessThanOrEqual(footer.y + 1);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    });

    test('has no probation field, says why, and sends no probation key; the other terms still travel', async ({
      page,
    }) => {
      const sent = creates(page);
      // The save is refused by a stub, so no draft is stored and no daily create limit is spent.
      await page.route(CREATE_URL, async (route) =>
        route.request().method() === 'POST'
          ? route.fulfill(await problemFulfill(500, 'INTERNAL'))
          : route.fallback(),
      );
      await startDraft(page, 'Назва для перевірки');
      await expect(probation(page)).toHaveCount(0);
      await expect(
        page.getByText(probationReadOnly, { exact: true }),
      ).toBeVisible();
      await chooseOption(page, level(page), 'Сеніор');
      await field(page, t.location.label).fill('Львів');
      await saveDraft(page).click();
      await expect.poll(() => sent.length).toBe(1);
      const body = sent[0]!.postDataJSON() as Record<string, unknown>;
      expect(body).toMatchObject({ seniority: 'Сеніор', location: 'Львів' });
      expect(body).not.toHaveProperty('probationDays');
    });
  });
}

test.describe('50-draft limit on «Зберегти чернетку» [D98, ux §4.2]', () => {
  test.use({ storageState: sessionFile('head.recruiter.gambling@demo') });
  test.afterEach(({ page }) => sweepOwnDrafts(page));

  const stubCount = (page: Page, count: number) =>
    page.route(COUNT_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count }),
      }),
    );
  const helper = (page: Page) =>
    page
      .locator('[data-slot="form-page-footer"] span[id]')
      .filter({ hasText: draftLimitReason });

  test('at 50 drafts the button stays focusable, explains itself (tooltip on hover, text on touch) and sends nothing; publishing is not blocked', async ({
    page,
    isMobile,
  }) => {
    const sent = creates(page);
    await stubCount(page, 50);
    // Publishing is not blocked, so the press that proves it is answered by a stub instead of a real vacancy.
    await page.route(CREATE_URL, async (route) =>
      route.request().method() === 'POST'
        ? route.fulfill(await problemFulfill(500, 'INTERNAL'))
        : route.fallback(),
    );
    await openHydrated(page, '/vacancies/new');
    await choosePosition(page);
    await expect(saveDraft(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(saveDraft(page)).toHaveAccessibleDescription(draftLimitReason);
    await expect(publish(page)).not.toHaveAttribute('aria-disabled', 'true');
    await saveDraft(page).focus();
    await expect(saveDraft(page)).toBeFocused();
    if (isMobile) {
      await expect(helper(page)).toBeVisible();
      const [button, note] = await Promise.all([
        saveDraft(page).boundingBox(),
        helper(page).boundingBox(),
      ]);
      expect(note!.y).toBeGreaterThanOrEqual(button!.y + button!.height);
    } else {
      await saveDraft(page).hover();
      await expect(
        page
          .locator('[data-radix-popper-content-wrapper] .motion-tooltip')
          .filter({ hasText: draftLimitReason }),
      ).toBeVisible();
    }
    await saveDraft(page).click({ force: true });
    await saveDraft(page).press('Enter');
    expect(sent).toHaveLength(0);
    await field(page, t.titleField.label).press('Control+Enter');
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0]!.postDataJSON()).toMatchObject({ mode: 'PUBLISH' });
  });

  test('at 49 drafts the button works and shows no reason', async ({
    page,
  }) => {
    await stubCount(page, 49);
    await startDraft(page, `${OWN_DRAFT_PREFIX} ${Date.now()}`);
    await expect(saveDraft(page)).not.toHaveAttribute('aria-disabled', 'true');
    await expect(helper(page)).toHaveCount(0);
    await saveDraft(page).click();
    await expect(page).toHaveURL(/\/vacancies\?.*status=DRAFT/);
  });

  test('the keyboard reaches the disabled save in the tab order, its reason is announced and shown on focus, Enter and Space do nothing [ux §8]', async ({
    page,
    isMobile,
  }) => {
    const sent = creates(page);
    await stubCount(page, 50);
    await startDraft(page, `${OWN_DRAFT_PREFIX} ${Date.now()}`);
    const footer = page.locator('[data-slot="form-page-footer"]');
    await footer
      .getByRole('link', { name: messages.common.cancel, exact: true })
      .focus();
    await page.keyboard.press('Tab');
    await expect(saveDraft(page)).toBeFocused();
    await expect(saveDraft(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(saveDraft(page)).not.toHaveAttribute('disabled');
    const [reasonId] = (await saveDraft(page).getAttribute(
      'aria-describedby',
    ))!.split(' ');
    await expect(page.locator(`[id="${reasonId}"]`)).toHaveText(
      draftLimitReason,
    );
    const cdp = await page.context().newCDPSession(page);
    try {
      await expect
        .poll(async () => {
          const { nodes } = await cdp.send('Accessibility.getFullAXTree');
          return nodes
            .filter(
              (node) =>
                node.role?.value === 'button' &&
                node.name?.value === t.actions.saveDraft,
            )
            .map((node) => node.description?.value);
        })
        .toEqual([draftLimitReason]);
    } finally {
      await cdp.detach();
    }
    const tooltip = page
      .locator('[data-radix-popper-content-wrapper] .motion-tooltip')
      .filter({ hasText: draftLimitReason });
    if (isMobile) await expect(helper(page)).toBeVisible();
    else await expect(tooltip).toBeVisible();

    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    await expect(saveDraft(page)).toBeFocused();
    await expect(saveDraft(page)).not.toHaveAttribute('aria-busy', 'true');
    await expect(page).toHaveURL(/\/vacancies\/new$/);
    expect(sent).toHaveLength(0);

    if (!isMobile) {
      await page.keyboard.press('Escape');
      await expect(tooltip).toBeHidden();
      await expect(saveDraft(page)).toBeFocused();
    }
    await page.keyboard.press('Tab');
    await expect(publish(page)).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(saveDraft(page)).toBeFocused();
  });

  test('a 409 from the server turns the button into the same explanation and keeps the values', async ({
    page,
  }) => {
    await page.route(CREATE_URL, async (route) =>
      route.request().method() === 'POST'
        ? route.fulfill(await problemFulfill(409, 'DRAFT_LIMIT_REACHED'))
        : route.fallback(),
    );
    await startDraft(page, 'Назва для перевірки');
    await expect(saveDraft(page)).not.toHaveAttribute('aria-disabled', 'true');
    await saveDraft(page).click();
    await expect(
      page.getByRole('alert').filter({ hasText: draftLimitReason }),
    ).toBeVisible();
    await expect(saveDraft(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(saveDraft(page)).toHaveAccessibleDescription(draftLimitReason);
    await expect(field(page, t.titleField.label)).toHaveValue(
      'Назва для перевірки',
    );
  });
});

test.describe('layout of «Умови» and the readiness rail, Admin [ux §3]', () => {
  test.use({ storageState: sessionFile('admin@demo') });

  test('on a phone the terms stack and the salary pair shares a row; from the rail width the rail sits beside the form and follows what is filled in', async ({
    page,
    isMobile,
  }) => {
    await startDraft(page, '');
    const box = async (locator: ReturnType<typeof field>) =>
      (await locator.boundingBox())!;
    const [title, seniority, work, employmentBox, from, to, currencyBox] =
      await Promise.all([
        box(field(page, t.titleField.label)),
        box(level(page)),
        box(workFormat(page)),
        box(employment(page)),
        box(salaryFrom(page)),
        box(salaryTo(page)),
        box(currency(page)),
      ]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const rail = page.locator('[data-slot="readiness-rail"]');
    if (isMobile) {
      const { width } = page.viewportSize()!;
      for (const control of [seniority, work, employmentBox, currencyBox]) {
        expect(Math.abs(control.width - title.width)).toBeLessThanOrEqual(1);
        expect(control.height).toBeGreaterThanOrEqual(44);
        expect(control.x + control.width).toBeLessThanOrEqual(width);
      }
      expect(work.y).toBeGreaterThan(seniority.y + seniority.height - 1);
      expect(employmentBox.y).toBeGreaterThan(work.y + work.height - 1);
      expect(Math.abs(from.y - to.y)).toBeLessThanOrEqual(1);
      expect(to.x).toBeGreaterThan(from.x + from.width - 1);
      expect(currencyBox.y).toBeGreaterThan(from.y + from.height - 1);
      for (const input of [
        field(page, t.location.label),
        salaryFrom(page),
        salaryTo(page),
        probation(page),
      ])
        await expect(input).toHaveCSS('font-size', '16px');
      await expect(rail).toBeHidden();
      await expect(
        page.getByText(t.rail.afterCreateAssigner, { exact: true }).first(),
      ).toBeVisible();
      return;
    }
    expect(Math.abs(seniority.y - work.y)).toBeLessThanOrEqual(1);
    expect(work.x).toBeGreaterThan(seniority.x + seniority.width - 1);
    expect(Math.abs(from.y - to.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(to.y - currencyBox.y)).toBeLessThanOrEqual(1);
    await expect(rail).toBeVisible();
    const railBox = (await rail.boundingBox())!;
    expect(railBox.x).toBeGreaterThan(title.x + title.width);
    expect(Math.round(railBox.width)).toBe(320);
    await expect(
      page.getByText(t.rail.afterCreateAssigner, { exact: true }),
    ).toHaveCount(2);
    await expect(
      page.getByText(t.rail.afterCreateAssigner, { exact: true }).first(),
    ).toBeHidden();
    const items = rail.getByRole('listitem');
    await expect(items).toHaveText([
      `${t.rail.vertical}${t.rail.done}`,
      `${t.rail.title}${t.rail.todo}`,
      `${t.rail.position}${t.rail.todo}`,
    ]);
    await field(page, t.titleField.label).fill('Назва для перевірки');
    await expect(items.nth(1)).toHaveText(`${t.rail.title}${t.rail.done}`);
    await position(page).click();
    await page.getByRole('option', { name: POSITION, exact: true }).click();
    await expect(items.nth(2)).toHaveText(`${t.rail.position}${t.rail.done}`);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(rail).toBeInViewport();
  });
});

const railNotes = [
  [
    'recruiter1.gambling@demo',
    t.rail.afterCreateSelf,
    t.rail.afterCreateAssigner,
  ],
  [
    'head.recruiter.gambling@demo',
    t.rail.afterCreateAssigner,
    t.rail.afterCreateSelf,
  ],
  ['admin@demo', t.rail.afterCreateAssigner, t.rail.afterCreateSelf],
] as const;

for (const [user, shown, other] of railNotes) {
  test.describe(`note after creation and readiness rail, ${user} [D102, ux §2.1]`, () => {
    test.use({ storageState: sessionFile(user) });

    test('tells the author who assigns recruiters, in the rail when it fits and above the footer when it does not', async ({
      page,
      isMobile,
    }) => {
      await startDraft(page, '');
      const visible = (text: string) =>
        page.locator('p:visible', { hasText: text });
      await expect(visible(shown)).toHaveCount(1);
      await expect(visible(other)).toHaveCount(0);
      const rail = page.locator('[data-slot="readiness-rail"]');
      if (isMobile) {
        await expect(rail).toBeHidden();
        return;
      }
      await expect(rail.getByText(shown, { exact: true })).toBeVisible();
      await expect(
        rail.getByText(t.rail.draftNote, { exact: true }),
      ).toBeVisible();
      await expect(
        rail.getByRole('heading', { name: t.rail.label, level: 2 }),
      ).toBeVisible();
      await expect(
        rail.locator('[aria-live], [role="alert"], [role="status"]'),
      ).toHaveCount(0);
      await expect(
        rail.locator('a, button, input, select, textarea, [tabindex]'),
      ).toHaveCount(0);
    });
  });
}

test.describe('server refusals of the closed lists and the location text, Admin [ux §4.1]', () => {
  test.use({ storageState: sessionFile('admin@demo') });

  test('land on their own fields in page order, with the right copy, and keep every value', async ({
    page,
  }) => {
    await page.route(CREATE_URL, async (route) =>
      route.request().method() === 'POST'
        ? route.fulfill(
            await problemFulfill(400, 'VALIDATION_FAILED', [
              { path: 'body.location', code: 'custom' },
              { path: 'body.employmentType', code: 'invalid_value' },
              { path: 'body.workFormat', code: 'invalid_value' },
              { path: 'body.seniority', code: 'invalid_value' },
            ]),
          )
        : route.fallback(),
    );
    await startDraft(page, 'Назва для перевірки');
    await field(page, t.location.label).fill('Львів');
    await saveDraft(page).click();
    await expect(
      page.getByText(t.errors.optionInvalid, { exact: true }),
    ).toHaveCount(3);
    await expect(
      page.getByText(t.errors.locationChars, { exact: true }),
    ).toBeVisible();
    await expect(level(page)).toBeFocused();
    await expect(field(page, t.location.label)).toHaveValue('Львів');
    await expect(page).toHaveURL(/\/vacancies\/new$/);
  });
});
