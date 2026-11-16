import { expect, test, type Page, type Request } from '@playwright/test';
import { DEMO_VERTICALS } from '../../server/db/seed';
import messages from '../../messages/uk.json' with { type: 'json' };
import type { VacancyDetail } from '../../lib/schemas/vacancy';
import { MUTATION_HEADERS, sessionFile } from '../support/e2e-session';
import { openHydrated, waitForHydration } from '../support/hydration';
import { problemFulfill } from '../support/problem';
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

  // Runs after a failure too; a leftover of an earlier broken run (older than ten minutes) goes as well: «Усі» of this Recruiter must stay as seeded for vacancies.spec.ts.
  test.afterEach(async ({ page }) => {
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
      const removed = await page.request.delete(
        `/api/v1/vacancies/${item.id}`,
        { headers: MUTATION_HEADERS, data: {} },
      );
      expect([200, 404], await removed.text()).toContain(removed.status());
    }
  });

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
        name: messages.vacancies.filterStatuses.DRAFT,
        exact: true,
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
