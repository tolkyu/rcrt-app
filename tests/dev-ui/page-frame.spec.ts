import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { openGallery } from '../support/dev-ui';

const t = messages.devUi.pageFrame;
const rowMenu = t.rowMenu.replace('{title}', t.rowTitle);

async function showFrame(page: Page) {
  await page.getByRole('button', { name: t.showFrame, exact: true }).click();
  return page.locator('[data-slot="page-frame-demo"]');
}

test('page header keeps [secondary, primary] on desktop and moves the primary into the bottom bar on a phone [UI-F9, G6]', async ({
  page,
  isMobile,
}) => {
  await openGallery(page);
  const frame = await showFrame(page);
  const visibleButtons = frame.getByRole('button').filter({ visible: true });
  const bar = page.locator('[data-sticky-action-bar]');
  const stickyBottom = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--sticky-bar-bottom')
        .trim(),
    );
  if (isMobile) {
    await expect(visibleButtons).toHaveText([t.secondary, t.primary]);
    await expect(frame.locator('[class="hidden md:contents"]')).toBeHidden();
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('button')).toHaveText(t.primary);
    const box = (await bar.boundingBox())!;
    expect(box.height).toBe(56);
    expect(box.x).toBe(0);
    expect(box.width).toBe(390);
    expect(Math.round(box.y + box.height)).toBe(844);
    expect(await stickyBottom()).toBe('3.5rem');
    const cta = (await bar.getByRole('button').boundingBox())!;
    expect(cta.height).toBeGreaterThanOrEqual(40);
    expect(cta.width).toBeGreaterThan(300);
  } else {
    await expect(visibleButtons).toHaveText([t.secondary, t.primary]);
    await expect(bar).toBeHidden();
    expect(await stickyBottom()).toBe('0px');
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('row menu opens from the keyboard on its first safe action, skips the disabled one and returns focus [UI-F9, G11]', async ({
  page,
  isMobile,
}) => {
  await openGallery(page);
  const trigger = page.getByRole('button', { name: rowMenu, exact: true });
  await trigger.scrollIntoViewIfNeeded();
  const size = (await trigger.boundingBox())!;
  expect(size.width).toBe(isMobile ? 44 : 32);
  expect(size.height).toBe(isMobile ? 44 : 32);
  await trigger.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: t.edit })).toBeFocused();
  await expect(menu.getByRole('menuitem')).toHaveText([
    t.edit,
    `${t.publish}${t.publishReason}`,
    t.delete,
    t.cancel,
  ]);
  await expect(menu.getByRole('separator')).toHaveCount(1);
  await expect(
    menu.getByRole('menuitem', { name: new RegExp(t.publish) }),
  ).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: t.delete })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
  await expect(
    page.getByRole('status').filter({ hasText: t.delete }),
  ).toHaveText(t.chosen.replace('{action}', t.delete));
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('row menu opens with a tap or click and runs the chosen action [UI-F9, G11]', async ({
  page,
  isMobile,
}) => {
  await openGallery(page);
  const trigger = page.getByRole('button', { name: rowMenu, exact: true });
  await trigger.scrollIntoViewIfNeeded();
  if (isMobile) await trigger.tap();
  else await trigger.click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const edit = menu.getByRole('menuitem', { name: t.edit });
  if (isMobile) await edit.tap();
  else await edit.click();
  await expect(menu).toBeHidden();
  await expect(
    page.getByRole('status').filter({ hasText: t.edit }),
  ).toBeVisible();
});

for (const theme of ['light', 'dark'] as const) {
  test(`page frame and open row menu pass axe in ${theme} [UI-F9]`, async ({
    page,
  }) => {
    await openGallery(page, theme);
    await showFrame(page);
    const trigger = page.getByRole('button', { name: rowMenu, exact: true });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    await expect(page.getByRole('menu')).toBeVisible();
    const audit = await new AxeBuilder({ page })
      .include('[data-slot="page-frame-demo"]')
      .include('[data-slot="row-actions-demo"]')
      .include('[role="menu"]')
      .analyze();
    expect(
      audit.violations.filter((violation) =>
        ['serious', 'critical'].includes(violation.impact ?? ''),
      ),
    ).toEqual([]);
  });
}
