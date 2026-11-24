import { randomUUID } from 'node:crypto';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type Request,
} from '@playwright/test';
import {
  VACANCY_HEADCOUNT_MAX,
  VACANCY_REQUEST_COMMENT_MAX,
  VACANCY_REQUEST_COMMENT_MAX_LINES,
} from '../../lib/vacancy-limits';
import {
  E2E_ORIGIN,
  MUTATION_HEADERS,
  sessionFile,
  type E2EUser,
} from '../support/e2e-session';
import { openHydrated } from '../support/hydration';
import { problemFulfill } from '../support/problem';
import { removeRequests, storedRequests } from '../support/vacancy-request-db';
import messages from '../../messages/uk.json' with { type: 'json' };
import { notFound, POSITION } from './support/vacancy-create';
import { toastWith } from './support/vacancy-edit';

const t = messages.vacancyRequest;
const REQUEST_PAGE = '/vacancies/request';
const REQUEST_API = /\/api\/v1\/vacancies\/request$/;
const NEW_CARD = /\/vacancies\/[0-9a-f-]{36}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,64}$/;
/** Every comment this spec writes carries the marker, so the cleanup removes only its own vacancies. */
const MARKER = `E2E-REQ-${Math.random().toString(36).slice(2, 8)}`;
const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );

const heading = (page: Page) =>
  page.getByRole('heading', { level: 1, name: t.title, exact: true });
const positionBox = (page: Page) =>
  page.getByRole('combobox', { name: new RegExp(`^${t.fields.positionId}`) });
const headcountBox = (page: Page) =>
  page.getByRole('textbox', { name: new RegExp(`^${t.fields.headcount}`) });
const commentBox = (page: Page) =>
  page.getByRole('textbox', { name: t.fields.comment });
const urgent = (page: Page) =>
  page.getByRole('radio', { name: t.urgent, exact: true });
const normal = (page: Page) =>
  page.getByRole('radio', { name: t.normal, exact: true });
const submit = (page: Page) =>
  page.getByRole('button', { name: new RegExp(`^(${t.title}|${t.pending})$`) });
const summary = (page: Page) => page.locator('[data-slot="form-error"]');

const posts = (page: Page) => {
  const seen: Request[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && REQUEST_API.test(request.url()))
      seen.push(request);
  });
  return seen;
};

async function choosePosition(page: Page) {
  await positionBox(page).click();
  await page.getByRole('option', { name: new RegExp(`^${POSITION}`) }).click();
  await expect(positionBox(page)).toHaveValue(POSITION);
}

test.describe('Team Lead requests a vacancy [STORY-VAC-03-3, D86, D87, D90]', () => {
  test.use({ storageState: sessionFile('vasyl.tl@demo') });
  test.afterEach(async () => {
    await removeRequests(MARKER);
  });

  test('list link, form, submit: lands on the new OPEN card, comment lines kept, toast says so', async ({
    page,
  }) => {
    const sent = posts(page);
    const lines = [
      'Потрібен досвід з Facebook Ads',
      `Маркер ${MARKER}`,
      '',
      '<b>Не розмітка</b>',
    ];
    await openHydrated(page, '/vacancies');
    await page
      .getByRole('link', { name: messages.vacancies.requestLink })
      .click();
    await expect(page).toHaveURL(REQUEST_PAGE);
    await expect(heading(page)).toBeVisible();
    await expect(page.getByText(t.subtitle, { exact: true })).toBeVisible();
    await expect(page.getByText(t.verticalPending)).toBeVisible();
    await expect(
      page.getByText(fill(t.self, { name: 'Василь Мороз' })),
    ).toBeVisible();
    await expect(headcountBox(page)).toHaveValue('1');
    await expect(normal(page)).toBeChecked();

    await choosePosition(page);
    await expect(page.locator('dd', { hasText: 'Гемблінг' })).toBeVisible();
    await headcountBox(page).fill('3');
    await page.getByText(t.urgent, { exact: true }).click();
    await expect(urgent(page)).toBeChecked();
    await commentBox(page).fill(lines.join('\n'));
    await submit(page).click();

    await expect(page).toHaveURL(NEW_CARD);
    await expect(toastWith(page, t.success)).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 1, name: POSITION, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(messages.vacancies.status.OPEN, { exact: true }).first(),
    ).toBeVisible();

    expect(sent).toHaveLength(1);
    expect(sent[0]!.postDataJSON()).toEqual({
      positionId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      headcount: 3,
      priority: 'URGENT',
      comment: lines.join('\n'),
    });
    expect(await sent[0]!.headerValue('idempotency-key')).toMatch(
      IDEMPOTENCY_KEY,
    );

    const id = new URL(page.url()).pathname.split('/').pop()!;
    const detail = (await (
      await page.request.get(`/api/v1/vacancies/${id}`)
    ).json()) as Record<string, unknown>;
    expect(detail).toMatchObject({
      status: 'OPEN',
      title: POSITION,
      priority: 'URGENT',
      headcount: 3,
      source: 'APP',
      probationDays: 90,
      recruiterInitiated: false,
      recruiters: [],
      teamLead: { fullName: 'Василь Мороз' },
      seniority: null,
      salaryMinMinor: null,
    });
    const stored = await storedRequests(MARKER);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      id,
      status: 'OPEN',
      descriptionDoc: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: lines[0] }] },
          { type: 'paragraph', content: [{ type: 'text', text: lines[1] }] },
          { type: 'paragraph' },
          { type: 'paragraph', content: [{ type: 'text', text: lines[3] }] },
        ],
      },
    });
  });

  test('a double click creates exactly one vacancy', async ({ page }) => {
    const sent = posts(page);
    await openHydrated(page, REQUEST_PAGE);
    await choosePosition(page);
    await commentBox(page).fill(`Подвійне натискання ${MARKER}`);
    await submit(page).dblclick();
    await expect(page).toHaveURL(NEW_CARD);
    expect(sent).toHaveLength(1);
    expect(await storedRequests(MARKER)).toHaveLength(1);
  });

  test('Enter in a field does not submit; a double Ctrl+Enter submits once', async ({
    page,
  }) => {
    const sent = posts(page);
    await openHydrated(page, REQUEST_PAGE);
    await choosePosition(page);
    await commentBox(page).fill(`Клавіатура ${MARKER}`);
    await headcountBox(page).press('Enter');
    await expect(summary(page)).toHaveCount(0);
    expect(sent).toHaveLength(0);
    await commentBox(page).press('Control+Enter');
    await commentBox(page).press('Control+Enter');
    await expect(page).toHaveURL(NEW_CARD);
    expect(sent).toHaveLength(1);
    expect(await storedRequests(MARKER)).toHaveLength(1);
  });

  test('a rejected attempt keeps the form, shows a Ukrainian toast, and the retry reuses the same Idempotency-Key', async ({
    page,
  }) => {
    const sent = posts(page);
    let failed = false;
    await page.route(REQUEST_API, async (route) => {
      if (failed) return route.fallback();
      failed = true;
      return route.fulfill(await problemFulfill(500, 'INTERNAL_ERROR'));
    });
    await openHydrated(page, REQUEST_PAGE);
    await choosePosition(page);
    await commentBox(page).fill(`Повтор ${MARKER}`);
    await submit(page).click();

    await expect(toastWith(page, t.errors.failed)).toBeVisible();
    await expect(positionBox(page)).toHaveValue(POSITION);
    await expect(commentBox(page)).toHaveValue(`Повтор ${MARKER}`);
    await expect(submit(page)).toHaveAttribute('aria-busy', 'false');
    await page
      .locator('form')
      .getByRole('button', { name: t.retry, exact: true })
      .click();

    await expect(page).toHaveURL(NEW_CARD);
    expect(sent).toHaveLength(2);
    const keys = await Promise.all(
      sent.map((request) => request.headerValue('idempotency-key')),
    );
    expect(keys[0]).toMatch(IDEMPOTENCY_KEY);
    expect(keys[1]).toBe(keys[0]);
    expect(await storedRequests(MARKER)).toHaveLength(1);
  });

  test('429 keeps the input, names the limit in Ukrainian and offers the way back, not a retry', async ({
    page,
  }) => {
    await page.route(REQUEST_API, async (route) =>
      route.fulfill(await problemFulfill(429, 'RATE_LIMITED')),
    );
    await openHydrated(page, REQUEST_PAGE);
    await choosePosition(page);
    await submit(page).click();
    await expect(toastWith(page, t.errors.rateLimited)).toBeVisible();
    await expect(
      page.getByRole('alert').getByRole('link', { name: t.back, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: t.retry })).toHaveCount(0);
    await expect(positionBox(page)).toHaveValue(POSITION);
  });

  test('a position the server no longer offers is flagged on its field, keeps the other values and is not resent by Ctrl+Enter', async ({
    page,
  }) => {
    const sent = posts(page);
    await page.route(REQUEST_API, async (route) =>
      route.fulfill(
        await problemFulfill(400, 'VALIDATION_FAILED', [
          { path: 'body.positionId', code: 'position_inactive' },
        ]),
      ),
    );
    await openHydrated(page, REQUEST_PAGE);
    await choosePosition(page);
    await headcountBox(page).fill('4');
    await commentBox(page).fill('Коментар лишається');
    await submit(page).click();

    const unavailable = page.getByText(t.errors.positionUnavailable, {
      exact: true,
    });
    await expect(unavailable).toBeVisible();
    await expect(positionBox(page)).toBeFocused();
    await expect(headcountBox(page)).toHaveValue('4');
    await expect(commentBox(page)).toHaveValue('Коментар лишається');
    await positionBox(page).press('Control+Enter');
    await expect(unavailable).toBeVisible();
    expect(sent).toHaveLength(1);
  });

  test('pressing the button again after «position unavailable» keeps the error on screen instead of dropping it with the blur', async ({
    page,
  }) => {
    const sent = posts(page);
    await page.route(REQUEST_API, async (route) =>
      route.fulfill(
        await problemFulfill(400, 'VALIDATION_FAILED', [
          { path: 'body.positionId', code: 'position_inactive' },
        ]),
      ),
    );
    await openHydrated(page, REQUEST_PAGE);
    await choosePosition(page);
    await submit(page).click();
    const unavailable = page.getByText(t.errors.positionUnavailable, {
      exact: true,
    });
    await expect(unavailable).toBeVisible();
    await submit(page).click();
    await expect(unavailable).toBeVisible();
    expect(sent).toHaveLength(1);
  });

  test('invalid values are refused in Ukrainian before any request, the summary counts them and focus goes to the first', async ({
    page,
  }) => {
    const sent = posts(page);
    await openHydrated(page, REQUEST_PAGE);
    await headcountBox(page).fill('0');
    await commentBox(page).fill(
      'рядок\n'.repeat(VACANCY_REQUEST_COMMENT_MAX_LINES + 1),
    );
    await submit(page).click();

    await expect(summary(page)).toHaveText('Виправте 3 поля');
    await expect(
      page.getByText(t.errors.positionRequired, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        fill(t.errors.headcountRange, { max: VACANCY_HEADCOUNT_MAX }),
        {
          exact: true,
        },
      ),
    ).toBeVisible();
    await expect(
      page.getByText(
        fill(t.errors.commentLines, {
          lines: VACANCY_REQUEST_COMMENT_MAX_LINES,
        }),
        { exact: true },
      ),
    ).toBeVisible();
    await expect(positionBox(page)).toBeFocused();
    expect(sent).toHaveLength(0);

    await choosePosition(page);
    await headcountBox(page).fill(String(VACANCY_HEADCOUNT_MAX + 1));
    await commentBox(page).fill('а'.repeat(VACANCY_REQUEST_COMMENT_MAX + 1));
    await submit(page).click();
    await expect(
      page.getByText(new RegExp(`^Скоротіть коментар до 5\\D000 символів\\.$`)),
    ).toBeVisible();
    await expect(summary(page)).toHaveText('Виправте 2 поля');
    await expect(headcountBox(page)).toBeFocused();
    await expect(commentBox(page)).toHaveValue(
      'а'.repeat(VACANCY_REQUEST_COMMENT_MAX + 1),
    );
    await headcountBox(page).fill('1.5');
    await headcountBox(page).blur();
    await expect(
      page.getByText(
        fill(t.errors.headcountRange, { max: VACANCY_HEADCOUNT_MAX }),
        {
          exact: true,
        },
      ),
    ).toBeVisible();
    expect(sent).toHaveLength(0);
    expect(await storedRequests(MARKER)).toHaveLength(0);
  });

  test('the submit button stays reachable above the bottom bar at any scroll, and the page never scrolls sideways', async ({
    page,
  }) => {
    await openHydrated(page, REQUEST_PAGE);
    await choosePosition(page);
    await commentBox(page).fill('рядок\n'.repeat(40));
    const button = submit(page);
    await expect(button).toBeInViewport({ ratio: 1 });
    expect(
      await button.evaluate((node) => {
        const box = node.getBoundingClientRect();
        const hit = document.elementFromPoint(
          box.left + box.width / 2,
          box.top + box.height / 2,
        );
        return hit !== null && node.contains(hit);
      }),
    ).toBe(true);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.mouse.wheel(0, 2000);
    await expect(button).toBeInViewport({ ratio: 1 });
  });

  test('the list offers «Запросити вакансію» once, as the primary action', async ({
    page,
  }) => {
    await openHydrated(page, '/vacancies');
    await expect(
      page.getByRole('link', { name: messages.vacancies.requestLink }),
    ).toHaveCount(1);
  });
});

const DENIED: readonly E2EUser[] = [
  'recruiter1.gambling@demo',
  'recruiter.crypto@demo',
  'head.recruiter.gambling@demo',
  'hr@demo',
  'head.hr@demo',
  'finance@demo',
  'admin@demo',
];

test.describe('Everyone but a Team Lead gets a real 404 and no write [STORY-VAC-03-3, D87]', () => {
  for (const user of DENIED) {
    test(`${user}: page 404, endpoint 404, no list link`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        storageState: sessionFile(user),
        baseURL: E2E_ORIGIN,
      });
      try {
        const page = await context.newPage();
        const response = await page.goto(REQUEST_PAGE);
        expect(response?.status()).toBe(404);
        await expect(notFound(page)).toBeVisible();
        await expect(heading(page)).toHaveCount(0);
        await expect(submit(page)).toHaveCount(0);

        const api: APIRequestContext = context.request;
        const answer = await api.post('/api/v1/vacancies/request', {
          headers: { ...MUTATION_HEADERS, 'idempotency-key': randomUUID() },
          data: { positionId: randomUUID(), comment: MARKER },
        });
        expect(answer.status()).toBe(404);
        expect(await storedRequests(MARKER)).toHaveLength(0);

        if (user !== 'finance@demo') {
          await openHydrated(page, '/vacancies');
          await expect(
            page.getByRole('link', { name: messages.vacancies.requestLink }),
          ).toHaveCount(0);
        }
      } finally {
        await context.close();
      }
    });
  }
});
