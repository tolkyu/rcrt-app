import { expect, test, type Locator, type Page } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { E2E_ORIGIN, sessionFile } from '../support/e2e-session';
import { openHydrated } from '../support/hydration';

const t = messages;
const THEME_COLOR = { light: '#ffffff', dark: '#111827' } as const;
const SUBTLE_FILL = {
  OPEN: { light: 'rgb(240, 253, 244)', dark: 'rgb(23, 54, 57)' },
  ON_HOLD: { light: 'rgb(255, 251, 235)', dark: 'rgb(54, 51, 39)' },
} as const;

test.use({ storageState: sessionFile('recruiter1.gambling@demo') });

const themeCookie = (value: 'light' | 'dark' | 'system') => ({
  name: 'theme',
  value,
  url: E2E_ORIGIN,
});

const themeColors = (page: Page) =>
  page.locator('meta[name="theme-color"]').evaluateAll((metas) =>
    metas.map((meta) => ({
      media: meta.getAttribute('media'),
      content: meta.getAttribute('content'),
    })),
  );

const scaleOf = (element: Locator) =>
  element.evaluate((node) => getComputedStyle(node).scale);
const isActive = (element: Locator) =>
  element.evaluate((node) => node.matches(':active'));

async function centre(element: Locator) {
  const box = await element.boundingBox();
  if (!box) throw new Error('element has no box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** «Зберегти» is enabled once the name differs; the request is refused so no press can persist anything. */
async function enabledSaveButton(page: Page) {
  await page.route('**/api/v1/me', (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({
          status: 500,
          contentType: 'application/problem+json',
          json: { status: 500, code: 'INTERNAL' },
        })
      : route.fallback(),
  );
  await openHydrated(page, '/profile');
  const input = page.getByLabel(t.profile.nameLabel);
  await input.fill(`${await input.inputValue()} Тест`);
  const save = page.getByRole('button', {
    name: t.profile.save,
    exact: true,
  });
  await expect(save).toBeEnabled();
  return { input, save };
}

test.afterEach(({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }));

test.describe('button press feedback [UI-F1]', () => {
  test('a mouse press scales the button to 0.97 and releases back to none', async ({
    page,
  }) => {
    const { save } = await enabledSaveButton(page);
    await expect.poll(() => scaleOf(save)).toBe('none');

    await page.mouse.move((await centre(save)).x, (await centre(save)).y);
    await page.mouse.down();
    await expect.poll(() => scaleOf(save)).toBe('0.97');

    await page.mouse.move(0, 0);
    await page.mouse.up();
    await expect.poll(() => scaleOf(save)).toBe('none');
  });

  test('a keyboard Space press keeps the scale at none while the button is active', async ({
    page,
  }) => {
    const { input, save } = await enabledSaveButton(page);
    await input.focus();
    await page.keyboard.press('Tab');
    await expect(save).toBeFocused();

    await page.keyboard.down('Space');
    await expect.poll(() => isActive(save)).toBe(true);
    expect(await scaleOf(save)).toBe('none');
    await page.keyboard.up('Space');
  });

  test('prefers-reduced-motion removes the press scale and collapses the motion tokens to opacity-only', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { save } = await enabledSaveButton(page);

    await page.mouse.move((await centre(save)).x, (await centre(save)).y);
    await page.mouse.down();
    await expect.poll(() => isActive(save)).toBe(true);
    expect(await scaleOf(save)).toBe('none');
    await page.mouse.move(0, 0);
    await page.mouse.up();

    const tokens = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.setProperty('scale', 'var(--motion-scale)');
      probe.style.setProperty('translate', '0 var(--motion-shift)');
      probe.style.setProperty('transition-duration', 'var(--duration-dialog)');
      document.body.append(probe);
      const style = getComputedStyle(probe);
      const resolved = {
        scale: style.scale,
        translate: style.translate,
        duration: style.transitionDuration,
      };
      probe.remove();
      return resolved;
    });
    expect(tokens).toEqual({
      scale: '1',
      translate: '0px 0%',
      duration: '0.12s',
    });
  });

  test('an aria-disabled button does not scale when pressed', async ({
    page,
  }) => {
    const { save } = await enabledSaveButton(page);
    await save.evaluate((node) => node.setAttribute('aria-disabled', 'true'));

    await page.mouse.move((await centre(save)).x, (await centre(save)).y);
    await page.mouse.down();
    await expect.poll(() => isActive(save)).toBe(true);
    expect(await scaleOf(save)).toBe('none');
    await page.mouse.move(0, 0);
    await page.mouse.up();
  });

  test('no element animates `transition-property: all`', async ({ page }) => {
    await openHydrated(page, '/profile');
    const offenders = await page.evaluate(() =>
      [...document.querySelectorAll('*')]
        .filter((node) => {
          const style = getComputedStyle(node);
          return (
            style.transitionProperty.split(',').includes('all') &&
            style.transitionDuration.split(',').some((d) => parseFloat(d) > 0)
          );
        })
        .map((node) => node.tagName.toLowerCase()),
    );
    expect(offenders).toEqual([]);
  });
});

test.describe('theme-color meta [UI-F1]', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`the ${theme} cookie renders the ${theme} colour for both scheme variants`, async ({
      page,
    }) => {
      await page.context().addCookies([themeCookie(theme)]);
      await page.goto('/login');
      expect(await themeColors(page)).toEqual([
        {
          media: '(prefers-color-scheme: light)',
          content: THEME_COLOR[theme],
        },
        {
          media: '(prefers-color-scheme: dark)',
          content: THEME_COLOR[theme],
        },
      ]);
    });
  }

  test('without a cookie each scheme variant keeps its own colour', async ({
    page,
  }) => {
    await page.context().addCookies([themeCookie('system')]);
    await page.goto('/login');
    expect(await themeColors(page)).toEqual([
      { media: '(prefers-color-scheme: light)', content: THEME_COLOR.light },
      { media: '(prefers-color-scheme: dark)', content: THEME_COLOR.dark },
    ]);
  });

  test('the viewport covers the notch and resizes with the keyboard', async ({
    page,
  }) => {
    await page.goto('/login');
    const viewport = await page
      .locator('meta[name="viewport"]')
      .getAttribute('content');
    expect(viewport).toContain('viewport-fit=cover');
    expect(viewport).toContain('interactive-widget=resizes-content');
  });

  test('switching the theme rewrites both metas at once and survives a reload', async ({
    page,
  }) => {
    await page.context().addCookies([themeCookie('system')]);
    await openHydrated(page, '/profile');
    await page
      .getByRole('button', {
        name: t.theme.current.replace('{theme}', t.theme.system),
      })
      .click();
    await page
      .getByRole('menuitemradio', { name: t.theme.dark, exact: true })
      .click();
    await expect(page.locator('html')).toHaveClass('dark');
    expect((await themeColors(page)).map((meta) => meta.content)).toEqual([
      THEME_COLOR.dark,
      THEME_COLOR.dark,
    ]);

    await page.reload();
    expect((await themeColors(page)).map((meta) => meta.content)).toEqual([
      THEME_COLOR.dark,
      THEME_COLOR.dark,
    ]);

    await page.getByText(t.theme.system, { exact: true }).click();
    await expect(page.locator('html')).not.toHaveClass(/light|dark/);
    expect(await themeColors(page)).toEqual([
      { media: '(prefers-color-scheme: light)', content: THEME_COLOR.light },
      { media: '(prefers-color-scheme: dark)', content: THEME_COLOR.dark },
    ]);
  });
});

test.describe('status pills render a fill [UI-F1]', () => {
  test.use({ storageState: sessionFile('admin@demo') });

  for (const theme of ['light', 'dark'] as const) {
    for (const status of ['OPEN', 'ON_HOLD'] as const) {
      test(`${status} has its subtle background in the ${theme} theme`, async ({
        page,
      }) => {
        await page.context().addCookies([themeCookie(theme)]);
        await openHydrated(page, `/vacancies?status=${status}`);
        const pill = page
          .getByRole('region', { name: t.vacancies.resultsLabel, exact: true })
          .getByText(t.vacancies.status[status], { exact: true })
          .and(page.locator(':visible'))
          .first();
        await expect(pill).toBeVisible();
        await expect
          .poll(() =>
            pill.evaluate((node) => getComputedStyle(node).backgroundColor),
          )
          .toBe(SUBTLE_FILL[status][theme]);
      });
    }
  }
});
