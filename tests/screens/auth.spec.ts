import { mkdirSync } from 'node:fs';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { FIXED_CLOCK_ISO } from '../../lib/fixed-clock';
import messages from '../../messages/uk.json' with { type: 'json' };
import { settleRendering } from '../e2e/screens';
import { E2E_ORIGIN, GOOGLE_E2E_ORIGIN } from '../support/origins';

const screens = [
  { id: '01-public-login', path: '/login', heading: 'Вхід до Hiring' },
  {
    id: '02-public-confirm',
    path: `/auth/confirm#token_hash=${'a'.repeat(56)}`,
    heading: 'Підтвердіть вхід',
  },
  {
    id: '03-public-confirm-invalid',
    path: '/auth/confirm',
    heading: messages.auth.confirm.invalidTitle,
  },
  {
    id: '04-public-invite-invalid',
    path: '/invite',
    heading: 'Запрошення недійсне',
  },
  {
    id: '05-public-session-expired',
    path: '/session-expired',
    heading: 'Сесію завершено',
  },
] as const;

async function capture(page: Page, testInfo: TestInfo, id: string) {
  await settleRendering(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const variant = testInfo.project.name.replace('screens-foundation-', '');
  mkdirSync('screenshots/phase-1', { recursive: true });
  await page.screenshot({
    path: `screenshots/phase-1/${id}-${variant}.png`,
    animations: 'disabled',
    scale: 'css',
    fullPage: true,
  });
}

for (const screen of screens) {
  test(screen.id, async ({ page }, testInfo) => {
    await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
    await page.goto(screen.path);
    await expect(
      page.getByRole('heading', { name: screen.heading, exact: true }),
    ).toBeVisible();
    if (screen.id === '02-public-confirm')
      await expect(
        page.getByRole('button', { name: 'Увійти', exact: true }),
      ).toBeVisible();
    if (screen.id === '03-public-confirm-invalid')
      await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
    await capture(page, testInfo, screen.id);
  });
}

const inviteT = messages.auth.invite;
/** The preview is answered by the browser, so no real invitation is read; the person is the seeded HR (CLAUDE.md §8). */
const INVITE_PREVIEW = {
  state: 'VALID',
  fullName: 'Оксана Олійник',
  email: 'hr@demo',
  roles: [
    { role: 'HR', vertical: 'Гемблінг' },
    { role: 'HR', vertical: 'Крипто' },
  ],
};
const INVITE_TOKEN = 'q7Vd2LmX9sKe4TbR1wYzA0cNfHjP3uGi8oE5rS6tWxU';

/** The Google-enabled server must render its buttons without reaching Google or any other host. */
async function stayLocal(page: Page) {
  const external: string[] = [];
  await page.route(
    (url) => !['localhost', '127.0.0.1'].includes(url.hostname),
    (route) => {
      external.push(route.request().url());
      return route.abort();
    },
  );
  return external;
}

for (const [id, origin, google] of [
  ['21-public-invite-valid', E2E_ORIGIN, false],
  ['22-public-invite-google', GOOGLE_E2E_ORIGIN, true],
] as const) {
  test(id, async ({ page }, testInfo) => {
    const external = await stayLocal(page);
    let inspected = 0;
    await page.route(`${origin}/api/v1/auth/invites/inspect`, (route) => {
      expect(route.request().postDataJSON()).toEqual({ token: INVITE_TOKEN });
      inspected += 1;
      return route.fulfill({ json: INVITE_PREVIEW });
    });
    await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
    await page.goto(`${origin}/invite#t=${INVITE_TOKEN}`);
    await expect(
      page.getByRole('heading', { name: inviteT.title, exact: true }),
    ).toBeVisible();
    await expect(page.getByText('HR-менеджер · Крипто')).toBeVisible();
    await expect(
      page.getByRole('button', { name: inviteT.acceptGoogle }),
    ).toHaveCount(google ? 1 : 0);
    expect(new URL(page.url()).hash).toBe('');
    expect(inspected).toBe(1);
    await capture(page, testInfo, id);
    expect(external).toEqual([]);
  });
}

test('22-public-login-google', async ({ page }, testInfo) => {
  const external = await stayLocal(page);
  await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
  await page.goto(`${GOOGLE_E2E_ORIGIN}/login`);
  await expect(
    page.getByRole('heading', { name: messages.auth.login.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: messages.auth.login.google }),
  ).toBeVisible();
  await capture(page, testInfo, '22-public-login-google');
  expect(external).toEqual([]);
});
