import { expect, test } from '@playwright/test';
import type { UserDetail, UserPage } from '../../lib/schemas/user';
import messages from '../../messages/uk.json' with { type: 'json' };
import { checkAccessibility } from '../support/accessibility';
import { sessionFile } from '../support/e2e-session';

test.use({ storageState: sessionFile('admin@demo') });
test.afterEach(({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }));

test('10k loaded users keep bounded DOM, reach both ends by keyboard and preserve drawer focus [STORY-ROLE-05-4, PERF-05]', async ({
  page,
  isMobile,
}, testInfo) => {
  test.setTimeout(90_000);
  const response = await page.request.get('/api/v1/users?q=finance%40demo');
  expect(response.status()).toBe(200);
  const base = ((await response.json()) as UserPage).items[0]!;
  const detailResponse = await page.request.get(`/api/v1/users/${base.id}`);
  expect(detailResponse.status()).toBe(200);
  const detail = (await detailResponse.json()) as UserDetail;
  const users = Array.from({ length: 10_000 }, (_, index) => ({
    ...base,
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    fullName: `Користувач ${String(index + 1).padStart(5, '0')}`,
    email: `user-${index + 1}@demo`,
    lastLoginAt: null,
  }));
  let pages = 0;
  let shrink = false;
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route(
    (url) =>
      url.pathname === '/api/v1/users' &&
      url.searchParams.get('q') === 'Велика вибірка',
    (route) => {
      pages += 1;
      const after = new URL(route.request().url()).searchParams.has('cursor');
      return route.fulfill({
        json: {
          items: after
            ? users.slice(100, shrink ? 500 : undefined)
            : users.slice(0, 100),
          total: after ? null : shrink ? 500 : users.length,
          nextCursor: after ? null : users[99]!.id,
        },
      });
    },
  );
  await page.route(
    (url) =>
      /^\/api\/v1\/users\/00000000-0000-4000-8000-\d+$/.test(url.pathname),
    (route) => {
      const id = new URL(route.request().url()).pathname.split('/').at(-1);
      const user = users.find((item) => item.id === id)!;
      return route.fulfill({
        json: {
          ...detail,
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          lastLoginAt: null,
        },
      });
    },
  );
  await page.goto('/settings/users');
  await page
    .getByLabel(messages.settings.users.searchLabel, { exact: true })
    .fill('Велика вибірка');
  await expect(page.locator('[data-user-id]')).toHaveCount(100);
  await expect(page.locator('[data-users-virtual]')).toHaveCount(0);
  await page
    .getByRole('button', {
      name: messages.settings.users.loadMore,
      exact: true,
    })
    .click();
  const list = page.locator('[data-users-virtual]');
  await expect(list).toBeVisible();
  await expect
    .poll(() => list.locator('[data-user-index]').count())
    .toBeLessThan(50);
  expect(pages).toBe(2);
  await page.evaluate(() => window.scrollTo(0, 0));
  const first = list.locator(`[data-user-id="${users[0]!.id}"]`);
  await expect(first).toBeVisible();
  await first.focus();
  await page.keyboard.press('End');
  const last = list.locator(`[data-user-id="${users.at(-1)!.id}"]`);
  await expect(last).toBeVisible();
  await expect(last).toBeFocused();
  await expect
    .poll(() => list.locator('[data-user-index]').count())
    .toBeLessThan(50);
  if (isMobile)
    await expect(last.locator('..').locator('..')).toHaveAttribute(
      'aria-posinset',
      '10000',
    );
  else
    await expect(list.getByRole('table')).toHaveAttribute(
      'aria-rowcount',
      '10001',
    );
  await last.click();
  const drawer = page.getByRole('dialog');
  await expect(
    drawer.getByRole('heading', { name: users.at(-1)!.fullName, exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(last).toBeFocused();
  await page.keyboard.press('Home');
  await expect(first).toBeVisible();
  await expect(first).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(list.locator(`[data-user-id="${users[1]!.id}"]`)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(first).toBeFocused();
  await checkAccessibility(page, testInfo);
  await page.keyboard.press('End');
  await expect(last).toBeFocused();
  shrink = true;
  await page.clock.install();
  await page.clock.fastForward(61_000);
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true })),
  );
  await expect.poll(() => pages).toBeGreaterThanOrEqual(4);
  await expect(list).toBeVisible();
  await expect
    .poll(() => list.locator('[data-user-index]').count())
    .toBeLessThan(50);
  expect(pageErrors).toEqual([]);
  await page
    .getByLabel(messages.settings.users.searchLabel, { exact: true })
    .fill('Немає такого користувача');
  await expect(
    page.getByText(messages.settings.users.empty.title, { exact: true }),
  ).toBeVisible();
  await expect(list).toHaveCount(0);
});
