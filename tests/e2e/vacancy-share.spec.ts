import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { FIXED_CLOCK_ISO } from '../../lib/fixed-clock';
import messages from '../../messages/uk.json' with { type: 'json' };
import { checkAccessibility } from '../support/accessibility';
import { demoTotpCode, magicLinkTokenHash } from '../support/demo-auth';
import {
  E2E_ORIGIN,
  sessionFile,
  signIn,
  type E2EUser,
} from '../support/e2e-session';
import { openHydrated, waitForHydration } from '../support/hydration';
import { demoVacancy } from '../support/vacancy-demo';
import { vacancyRecordCounts } from '../support/vacancy-evidence-db';

const t = messages.vacancies;
const target = demoVacancy(5);
const path = `/vacancies/${target.id}`;
/** The login form refuses addresses without a domain, so the seeded `@demo` mailbox is only used for the token. */
const MAILBOX = 'recipient@fixture.test';
const unknownPath = `/vacancies/${crypto.randomUUID()}`;

const shareButton = (page: Page) =>
  page.getByRole('button', { name: t.share, exact: true });
const copiedToast = (page: Page) =>
  page.locator('[data-slot="toast"]').filter({ hasText: t.shareCopied });
const failureAlert = (page: Page) =>
  page.getByRole('alert').filter({ hasText: t.shareFailed });
const cardTitle = (page: Page) =>
  page.getByRole('heading', { level: 1, name: target.title });
const notFound = (page: Page) =>
  page.getByRole('heading', { level: 1, name: messages.errors.notFoundTitle });

async function blockClipboard(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('denied')) },
    });
  });
}

/** A visitor in a context of his own, signed in as a seeded user or signed out (no `user`). */
async function withVisitor(
  browser: Browser,
  user: E2EUser | null,
  run: (page: Page, context: BrowserContext) => Promise<void>,
) {
  const context = await browser.newContext({
    baseURL: E2E_ORIGIN,
    ...(user ? { storageState: sessionFile(user) } : {}),
  });
  try {
    await run(await context.newPage(), context);
  } finally {
    await context.close();
  }
}

test.describe('the pasted link [STORY-UI-09-1, UI-09, D58, VIS-01]', () => {
  test.use({ storageState: sessionFile('head.recruiter.gambling@demo') });

  test('a colleague with access opens exactly the copied link and sees the card', async ({
    page,
    context,
    browser,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openHydrated(page, path);
    await shareButton(page).click();
    await expect(copiedToast(page)).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(`${E2E_ORIGIN}${path}`);
    for (const colleague of [
      'recruiter2.gambling@demo',
      'recruiter1.gambling@demo',
    ] as const)
      await withVisitor(browser, colleague, async (visitor) => {
        const response = await visitor.goto(copied);
        expect(response?.status()).toBe(200);
        await expect(cardTitle(visitor)).toBeVisible();
        await expect(visitor.getByText(target.number).first()).toBeVisible();
      });
  });

  test('a clean card link is copied from the list preview even with a search in the URL', async ({
    page,
    context,
    isMobile,
  }) => {
    test.skip(isMobile, 'the preview panel exists on wide screens only');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openHydrated(page, `/vacancies?q=${target.number}`);
    const preview = page.getByRole('complementary', { name: t.previewLabel });
    await expect(preview.getByRole('heading', { level: 2 })).toBeVisible();
    await preview.getByRole('button', { name: t.share, exact: true }).click();
    await expect(copiedToast(page)).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      `${E2E_ORIGIN}${path}`,
    );
  });
});

test.describe('who cannot open the link [STORY-UI-09-1, VIS-01, FIN-03]', () => {
  const DENIED = [
    [
      'recruiter.crypto@demo',
      'a Крипто user (no Крипто Head Recruiter is seeded)',
    ],
    ['finance@demo', 'Finance'],
    ['vasyl.tl@demo', 'a Team Lead of another vacancy'],
  ] as const;

  for (const [user, who] of DENIED)
    test(`${who} gets the 404 page of an unknown id and nothing about the vacancy`, async ({
      browser,
    }) => {
      await withVisitor(browser, user, async (visitor) => {
        const response = await visitor.goto(path);
        expect(response?.status()).toBe(404);
        await expect(notFound(visitor)).toBeVisible();
        const shown = await visitor.locator('body').innerText();
        expect(shown).not.toContain(target.title);
        expect(shown).not.toContain(target.number);
        expect(await shareButton(visitor).count()).toBe(0);

        const unknown = await visitor.goto(unknownPath);
        expect(unknown?.status()).toBe(404);
        await expect(notFound(visitor)).toBeVisible();
        expect(await visitor.locator('body').innerText()).toBe(shown);
      });
    });

  test('an HR of the vertical opens the card: vacancy.read is granted per vertical, so no 404 for hr@demo (story text expects 404)', async ({
    browser,
  }) => {
    await withVisitor(browser, 'hr@demo', async (visitor) => {
      const response = await visitor.goto(path);
      expect(response?.status()).toBe(200);
      await expect(cardTitle(visitor)).toBeVisible();
    });
  });
});

test.describe('signed-out recipient [STORY-UI-09-1 L3, DG-15]', () => {
  for (const [user, outcome] of [
    ['recruiter2.gambling@demo', 'returns to the card'],
    ['vasyl.tl@demo', 'gets the 404 page when the scope does not allow it'],
  ] as const)
    test(`signing in as ${user} ${outcome}`, async ({ browser }) => {
      await withVisitor(browser, null, async (visitor) => {
        await visitor.route('**/api/v1/auth/magic-link', (route) =>
          route.fulfill({ json: { accepted: true } }),
        );
        await visitor.goto(path);
        await expect(visitor).toHaveURL(
          `${E2E_ORIGIN}/login?next=${encodeURIComponent(path)}`,
        );
        await waitForHydration(visitor);
        await visitor.getByLabel(messages.auth.login.emailLabel).fill(MAILBOX);
        await visitor
          .getByRole('button', { name: messages.auth.login.submit })
          .click();
        await expect(
          visitor.getByRole('heading', { name: messages.auth.login.sentTitle }),
        ).toBeVisible();

        const token = await magicLinkTokenHash(user);
        await visitor.goto(`/auth/confirm#token_hash=${token}&type=email`);
        await visitor
          .getByRole('button', { name: messages.auth.confirm.submit })
          .click();
        await expect(visitor).toHaveURL(`${E2E_ORIGIN}${path}`);
        if (user === 'recruiter2.gambling@demo')
          await expect(cardTitle(visitor)).toBeVisible();
        else await expect(notFound(visitor)).toBeVisible();
      });
    });

  test('an Admin without the 2FA code completes the step-up first and then lands on the card [D63]', async ({
    browser,
  }) => {
    await withVisitor(browser, null, async (visitor, context) => {
      await signIn(context.request, 'admin@demo');
      await visitor.goto(path);
      await expect(visitor).toHaveURL(
        `${E2E_ORIGIN}/mfa/verify?next=${encodeURIComponent(path)}`,
      );
      await visitor
        .getByLabel(messages.auth.mfa.codeLabel)
        .fill(demoTotpCode());
      await visitor
        .getByRole('button', { name: messages.auth.mfa.submit })
        .click();
      await expect(visitor).toHaveURL(`${E2E_ORIGIN}${path}`);
      await expect(cardTitle(visitor)).toBeVisible();
    });
  });
});

test.describe('Admin presses «Поділитися» [STORY-UI-09-1]', () => {
  test.use({ storageState: sessionFile('admin@demo') });

  test('unavailable clipboard fallback clears after a successful retry', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: undefined,
      });
    });
    await openHydrated(page, path);
    await shareButton(page).click();
    await expect(
      failureAlert(page).getByRole('textbox', { name: t.shareLinkLabel }),
    ).toHaveValue(`${E2E_ORIGIN}${path}`);
    await expect(shareButton(page)).toBeFocused();
    await expect(copiedToast(page)).toHaveCount(0);
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.resolve() },
      });
    });
    await shareButton(page).click();
    await expect(copiedToast(page)).toBeVisible();
    await expect(failureAlert(page)).toHaveCount(0);
  });

  test('blocked clipboard fallback also works in the preview', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'the preview panel exists on wide screens only');
    await blockClipboard(page);
    await openHydrated(page, `/vacancies?q=${target.number}`);
    const preview = page.getByRole('complementary', { name: t.previewLabel });
    const share = preview.getByRole('button', { name: t.share, exact: true });
    await share.click();
    const alert = preview.getByRole('alert');
    await expect(
      alert.getByRole('textbox', { name: t.shareLinkLabel }),
    ).toHaveValue(`${E2E_ORIGIN}${path}`);
    await expect(share).toBeFocused();
    await alert
      .getByRole('button', { name: messages.common.close, exact: true })
      .click();
    await expect(alert).toHaveCount(0);
    await expect(share).toBeFocused();
  });

  test('a press writes no audit row, timeline event or request, with the clipboard working or blocked', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openHydrated(page, path);
    const before = await vacancyRecordCounts(target.id);
    const writes: string[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET') writes.push(request.url());
    });

    await shareButton(page).click();
    await expect(copiedToast(page)).toBeVisible();
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error('denied')) },
      });
    });
    await shareButton(page).click();
    await expect(failureAlert(page)).toBeVisible();

    expect(writes).toEqual([]);
    expect(await vacancyRecordCounts(target.id)).toEqual(before);
  });

  test('two quick presses show one toast and one copy', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openHydrated(page, path);
    await shareButton(page).dblclick();
    await expect(copiedToast(page)).toHaveCount(1);
    await expect(shareButton(page)).toBeEnabled();
    await expect(copiedToast(page)).toHaveCount(1);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      `${E2E_ORIGIN}${path}`,
    );
  });

  test('the success toast is announced politely and the button keeps focus', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openHydrated(page, path);
    await shareButton(page).focus();
    await page.keyboard.press('Enter');
    const toast = copiedToast(page);
    await expect(toast).toBeVisible();
    await expect(
      page.locator('[aria-live="polite"]').filter({ has: toast }),
    ).toHaveCount(1);
    await expect(shareButton(page)).toBeFocused();
  });

  test('a blocked clipboard shows the alert with the link, keeps focus on the button and shows no success toast; one alert after two presses', async ({
    page,
  }, testInfo) => {
    await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page
      .context()
      .addCookies([{ name: 'theme', value: 'light', url: E2E_ORIGIN }]);
    await blockClipboard(page);
    await openHydrated(page, path);
    await shareButton(page).click();
    const alert = failureAlert(page);
    await expect(alert).toBeVisible();
    const input = alert.getByRole('textbox', { name: t.shareLinkLabel });
    await expect(input).toHaveValue(`${E2E_ORIGIN}${path}`);
    await expect(input).toHaveAttribute('readonly');
    expect(
      await input.evaluate((element: HTMLInputElement) => ({
        start: element.selectionStart,
        end: element.selectionEnd,
        fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
      })),
    ).toEqual({ start: 0, end: `${E2E_ORIGIN}${path}`.length, fontSize: 16 });
    await expect(shareButton(page)).toBeFocused();
    await expect(copiedToast(page)).toHaveCount(0);
    await shareButton(page).click();
    await expect(failureAlert(page)).toHaveCount(1);
    await expect(shareButton(page)).toBeFocused();
    await checkAccessibility(page, testInfo);
    await alert
      .getByRole('button', { name: messages.common.close, exact: true })
      .click();
    await expect(failureAlert(page)).toHaveCount(0);
    await expect(shareButton(page)).toBeFocused();
  });

  for (const [name, size] of [
    ['320 px', { width: 320, height: 568 }],
    ['200 % zoom', { width: 720, height: 450 }],
  ] as const)
    test(`the button and the fallback alert stay inside the screen at ${name}`, async ({
      page,
    }) => {
      await blockClipboard(page);
      await page.setViewportSize(size);
      await openHydrated(page, path);
      await shareButton(page).click();
      const alert = failureAlert(page);
      await expect(alert).toBeVisible();
      const inside = await page.evaluate(() => {
        const width = window.innerWidth;
        const within = (element: Element | null) => {
          const box = element?.getBoundingClientRect();
          return Boolean(box && box.left >= 0 && box.right <= width);
        };
        return {
          page: document.documentElement.scrollWidth <= width,
          alert: within(document.querySelector('[role="alert"]')),
          input: within(document.querySelector('[role="alert"] input')),
        };
      });
      expect(inside).toEqual({ page: true, alert: true, input: true });
      await expect(shareButton(page)).toBeVisible();
    });
});
