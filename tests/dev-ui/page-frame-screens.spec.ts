import { copyFileSync, mkdirSync } from 'node:fs';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { openGallery } from '../support/dev-ui';
import { settleRendering, viewportOf } from '../e2e/screens';

test.use({ reducedMotion: 'reduce' });
const t = messages.devUi.pageFrame;
const rowMenu = t.rowMenu.replace('{title}', t.rowTitle);

/** The gallery group card that holds the heading `title`. */
const groupOf = (page: Page, title: string) =>
  page
    .getByRole('heading', { name: title, level: 3, exact: true })
    .locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]');

async function prepare(page: Page, theme: 'light' | 'dark') {
  await page.clock.setFixedTime(new Date('2026-11-15T10:00:00Z'));
  await openGallery(page, theme);
  await page.addStyleTag({
    content: 'nextjs-portal { display: none !important; }',
  });
  for (const directory of ['screenshots/phase-2', 'screenshots/latest'])
    mkdirSync(directory, { recursive: true });
}

function saver(
  page: Page,
  testInfo: TestInfo,
  theme: 'light' | 'dark',
  series: string,
) {
  return async (state: string, shoot: (path: string) => Promise<unknown>) => {
    await settleRendering(page);
    const file = `${series}-${state}-${viewportOf(testInfo)}-${theme}.png`;
    const path = `screenshots/phase-2/${file}`;
    await shoot(path);
    copyFileSync(path, `screenshots/latest/${file}`);
    await testInfo.attach(file, { path, contentType: 'image/png' });
  };
}

for (const theme of ['light', 'dark'] as const) {
  test(`page frame gallery ${theme} [SHOT-01..03, UI-F9]`, async ({
    page,
  }, testInfo) => {
    await prepare(page, theme);
    const save = saver(page, testInfo, theme, '37-admin-ui-page-frame');

    await page.getByRole('button', { name: t.showFrame, exact: true }).click();
    const frame = page.locator('[data-slot="page-frame-demo"]');
    await frame.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await save('header', (path) =>
      page.screenshot({ path, animations: 'disabled', scale: 'css' }),
    );

    const trigger = page.getByRole('button', { name: rowMenu, exact: true });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    await expect(page.getByRole('menu')).toBeVisible();
    await save('row-menu', (path) =>
      page.screenshot({ path, animations: 'disabled', scale: 'css' }),
    );
    await page.keyboard.press('Escape');

    const field = page.getByRole('textbox', { name: t.formField, exact: true });
    await field.scrollIntoViewIfNeeded();
    await field.fill('Медіабаєр — Facebook');
    await page.mouse.move(0, 0);
    await save('form', (path) =>
      page
        .locator('[data-slot="form-page-demo"]')
        .screenshot({ path, animations: 'disabled', scale: 'css' }),
    );
    await page
      .locator('[data-slot="form-page-demo"]')
      .getByRole('link', { name: t.formCancel })
      .click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await save('leave-dialog', (path) =>
      page.screenshot({ path, animations: 'disabled', scale: 'css' }),
    );
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`page frame loading, preview header and empty states ${theme} [SHOT-01..03, UI-F9]`, async ({
    page,
  }, testInfo) => {
    await prepare(page, theme);
    const save = saver(page, testInfo, theme, '38-admin-ui-page-frame');
    // A tall element capture would place the sticky footers at the viewport edge instead of under their form.
    await page.addStyleTag({
      content:
        '[data-slot="form-page-footer"] { position: static !important; }',
    });
    await expect(page.locator('[data-slot="form-skeleton"]')).toHaveCSS(
      'opacity',
      '1',
    );
    const shoot = (title: string) => async (path: string) => {
      await page.mouse.move(0, 0);
      await groupOf(page, title).screenshot({
        path,
        animations: 'disabled',
        scale: 'css',
      });
    };
    await save('skeletons', shoot(t.skeletonGroup));
    await save('preview-header', shoot(t.previewGroup));
    await save('empty', shoot(t.emptyGroup));
  });
}
