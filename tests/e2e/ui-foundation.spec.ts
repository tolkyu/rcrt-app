import { expect, test, type Locator, type Page } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { E2E_ORIGIN, sessionFile } from '../support/e2e-session';
import { openHydrated } from '../support/hydration';
import { chooseOption, listboxOf, optionsOf } from '../support/select';

const t = messages;
const RADIX_SELECT_MARKER = 'data-radix-select-viewport';
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

test.describe('vacancy chips and the lazy tooltip [UI-F2]', () => {
  test.use({ storageState: sessionFile('admin@demo') });

  const visibleChip = (page: Page, text: string) =>
    page
      .getByRole('region', { name: t.vacancies.resultsLabel, exact: true })
      .locator('[data-slot="badge"]')
      .filter({ hasText: new RegExp(`^${text}$`) })
      .and(page.locator(':visible'))
      .first();
  const styleOf = (chip: Locator, property: string) =>
    chip.evaluate(
      (node, name) => getComputedStyle(node).getPropertyValue(name),
      property,
    );

  for (const status of ['OPEN', 'ON_HOLD'] as const) {
    test(`the ${status} chip is a one-line pill`, async ({ page }) => {
      await openHydrated(page, `/vacancies?status=${status}`);
      const chip = visibleChip(page, t.vacancies.status[status]);
      await expect(chip).toBeVisible();
      expect(await styleOf(chip, 'white-space')).toBe('nowrap');
      expect(
        parseFloat(await styleOf(chip, 'border-top-left-radius')),
      ).toBeGreaterThan(1000);
      expect((await chip.boundingBox())!.height).toBeLessThanOrEqual(28);
    });
  }

  test('the draft chip has a dashed border', async ({ page }) => {
    await openHydrated(page, '/vacancies?status=DRAFT');
    const chip = visibleChip(page, t.vacancies.status.DRAFT);
    await expect(chip).toBeVisible();
    expect(await styleOf(chip, 'border-top-style')).toBe('dashed');
  });

  test('an open urgent vacancy shows the red flame chip and a closed one the neutral chip', async ({
    page,
  }) => {
    await openHydrated(page, '/vacancies?status=ON_HOLD');
    const highlighted = visibleChip(page, t.vacancies.urgent);
    await expect(highlighted).toHaveAttribute('data-urgent', 'true');
    await expect(highlighted.locator('svg.lucide-flame')).toHaveCount(1);

    await openHydrated(page, '/vacancies?status=CANCELLED');
    const closed = visibleChip(page, t.vacancies.urgent);
    await expect(closed).toHaveAttribute('data-urgent', 'false');
    await expect(closed.locator('svg.lucide-flame')).toHaveCount(1);
  });

  test('the vacancy list requests no tooltip chunk', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await openHydrated(page, '/vacancies');
    expect(requests.filter((url) => /tooltip/i.test(url))).toEqual([]);
  });
});

test.describe('Select in the vacancies filter [UI-F3]', () => {
  test.use({ storageState: sessionFile('admin@demo') });

  const status = (page: Page) =>
    page.getByLabel(t.vacancies.filterStatus, { exact: true });
  const vertical = (page: Page) =>
    page.getByLabel(t.vacancies.filterVertical, { exact: true });
  const statusParam = (page: Page) =>
    expect.poll(() => new URL(page.url()).searchParams.get('status'));
  const popup = (page: Page) => page.locator('[data-slot="select-content"]');

  test('a pointer choice writes the status to the URL, «Усі» clears it and the field does not move', async ({
    page,
  }) => {
    await openHydrated(page, '/vacancies');
    const field = status(page);
    const before = await field.boundingBox();
    await chooseOption(page, field, t.vacancies.status.ON_HOLD);
    await statusParam(page).toBe('ON_HOLD');
    await expect(field).toHaveText(t.vacancies.status.ON_HOLD);
    expect(await field.boundingBox()).toEqual(before);

    await chooseOption(page, field, t.vacancies.all);
    await statusParam(page).toBeNull();
    await expect(field).toHaveText(t.vacancies.all);
    expect(await field.boundingBox()).toEqual(before);
  });

  test('Escape closes the list, keeps the filter and returns focus to the field', async ({
    page,
  }) => {
    await openHydrated(page, '/vacancies');
    const field = status(page);
    await field.click();
    await expect(listboxOf(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(listboxOf(page)).toHaveCount(0);
    await expect(field).toBeFocused();
    await expect(field).toHaveText(t.vacancies.all);
    await statusParam(page).toBeNull();
  });

  test('keyboard: Tab reaches the field, ArrowDown opens it, arrows and Enter choose, type-ahead picks on the closed field', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'the keyboard contract is viewport independent');
    await openHydrated(page, '/vacancies');
    await page
      .getByRole('searchbox', { name: t.vacancies.searchLabel, exact: true })
      .focus();
    await page.keyboard.press('Tab');
    await expect(vertical(page)).toHaveAttribute('data-state', 'closed');
    await expect(vertical(page)).toBeFocused();
    await page.keyboard.press('Tab');
    const field = status(page);
    await expect(field).toHaveAttribute('data-state', 'closed');
    await expect(field).toBeFocused();

    await page.keyboard.press('ArrowDown');
    await expect(listboxOf(page)).toBeVisible();
    await expect(optionsOf(page).first()).toBeFocused();
    // Radix moves focus in a timeout, so a second key sent before the first has landed targets the old option.
    await page.keyboard.press('ArrowDown');
    await expect(optionsOf(page).nth(1)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(
      optionsOf(page).filter({ hasText: t.vacancies.status.OPEN }),
    ).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(listboxOf(page)).toHaveCount(0);
    await expect(field).toBeFocused();
    await statusParam(page).toBe('OPEN');
    await expect(field).toHaveText(t.vacancies.status.OPEN);

    // Playwright cannot press Cyrillic keys, so the key events Radix type-ahead listens to are dispatched.
    await page.evaluate(
      (typed) => {
        for (const key of typed)
          document.activeElement?.dispatchEvent(
            new KeyboardEvent('keydown', { key, bubbles: true }),
          );
      },
      t.vacancies.status.ON_HOLD.slice(0, 2),
    );
    await statusParam(page).toBe('ON_HOLD');
    await expect(field).toHaveText(t.vacancies.status.ON_HOLD);
  });

  test('touch: a tap opens the list, the field text is 16 px, options and the list fit a phone', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'touch targets are a phone contract');
    await openHydrated(page, '/vacancies');
    const field = status(page);
    const metrics = await field.evaluate((node) => ({
      height: node.getBoundingClientRect().height,
      font: getComputedStyle(node).fontSize,
    }));
    expect(metrics.font).toBe('16px');
    expect(metrics.height).toBeGreaterThanOrEqual(44);

    await field.tap();
    await expect(optionsOf(page)).toHaveCount(
      Object.keys(t.vacancies.status).length + 1,
    );
    await popup(page).evaluate((node) =>
      Promise.all(node.getAnimations().map((animation) => animation.finished)),
    );
    const heights = await optionsOf(page).evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().height),
    );
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
    const box = await popup(page).boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);

    await page
      .getByRole('option', { name: t.vacancies.status.ON_HOLD, exact: true })
      .tap();
    await expect(listboxOf(page)).toHaveCount(0);
    await statusParam(page).toBe('ON_HOLD');
    await expect(field).toHaveText(t.vacancies.status.ON_HOLD);
  });

  test('the Radix Select chunk is not requested on page load and arrives on the first hover', async ({
    page,
  }) => {
    const scripts: string[] = [];
    page.on('request', (request) => {
      if (/^\/_next\/static\/.*\.js$/.test(new URL(request.url()).pathname))
        scripts.push(request.url());
    });
    const hasSelectCode = async (url: string) =>
      (await (await page.request.get(url)).text()).includes(
        RADIX_SELECT_MARKER,
      );

    await openHydrated(page, '/vacancies');
    const onLoad = scripts.length;
    expect(onLoad).toBeGreaterThan(0);
    expect(await Promise.all(scripts.map(hasSelectCode))).not.toContain(true);

    await status(page).hover();
    await expect
      .poll(async () =>
        (await Promise.all(scripts.slice(onLoad).map(hasSelectCode))).some(
          Boolean,
        ),
      )
      .toBe(true);
    await expect(listboxOf(page)).toHaveCount(0);
  });
});
