import { mkdirSync } from 'node:fs';
import { test, type Page, type TestInfo } from '@playwright/test';
import { settleRendering } from '../e2e/screens';
import { openGallery } from '../support/dev-ui';
import { confirmButton, group, modal, open, t } from '../support/dialog';

const DIR = 'screenshots/phase-2';
const PREFIX = '34-admin-ui-dialogs';
const HOLD_MS = 60_000;

const viewportOf = (testInfo: TestInfo) =>
  testInfo.project.name.endsWith('mobile') ? 'mobile' : 'desktop';

/** The spinner rotates forever, so its angle would differ between captures. */
const FREEZE_SPINNER = '.skeleton-delayed svg { animation: none !important; }';
/** The dev server's indicator badge is not part of the screen. */
const HIDE_DEV_BADGE = 'nextjs-portal { display: none !important; }';

async function shoot(
  page: Page,
  testInfo: TestInfo,
  theme: string,
  state: string,
) {
  await page.mouse.move(0, 0);
  await settleRendering(page);
  await page.screenshot({
    path: `${DIR}/${PREFIX}-${state}-${viewportOf(testInfo)}-${theme}.png`,
  });
}

test.use({ reducedMotion: 'reduce' });
test.beforeAll(() => mkdirSync(DIR, { recursive: true }));

for (const theme of ['light', 'dark'] as const) {
  test.describe(`dialog family screenshots, ${theme} [SHOT-01..03, UI-F8]`, () => {
    test.beforeEach(async ({ page }) => {
      await openGallery(page, theme);
      await page.addStyleTag({ content: FREEZE_SPINNER + HIDE_DEV_BADGE });
    });

    const sizes = (testInfo: TestInfo) =>
      viewportOf(testInfo) === 'mobile'
        ? (['md'] as const)
        : (['sm', 'md', 'lg'] as const);

    test('Dialog sizes with icon header and footer', async ({
      page,
    }, testInfo) => {
      for (const size of sizes(testInfo)) {
        await open(page, t.sizes, t.sizeLabel[size]).click();
        await modal(page).waitFor();
        await shoot(page, testInfo, theme, `dialog-${size}`);
        await page.keyboard.press('Escape');
        await modal(page).waitFor({ state: 'detached' });
      }
    });

    test('ConfirmDialog neutral, destructive and long quoted title', async ({
      page,
    }, testInfo) => {
      const cases = [
        ['confirm-neutral', t.neutral],
        ['confirm-destructive', t.destructive],
        ['confirm-worst', t.worst],
        ['confirm-long-labels', t.longLabels],
      ] as const;
      for (const [state, label] of cases) {
        await open(page, t.confirms, label).click();
        await page.getByRole('alertdialog').waitFor();
        if (state === 'confirm-worst')
          await page.getByRole('textbox').fill('Ж'.repeat(500));
        if (state === 'confirm-long-labels')
          await page.getByRole('textbox').fill('Причина');
        await shoot(page, testInfo, theme, state);
        await page.keyboard.press('Escape');
        await modal(page).waitFor({ state: 'detached' });
      }
    });

    test('ConfirmDialog with a reason: empty, filled, pending and inline 409', async ({
      page,
    }, testInfo) => {
      await open(page, t.confirms, t.withReason).click();
      await page.getByRole('alertdialog').waitFor();
      await shoot(page, testInfo, theme, 'confirm-reason-empty');
      await page.getByRole('textbox').fill('Кандидата знайдено внутрішньо');
      await shoot(page, testInfo, theme, 'confirm-reason-filled');
      await page.clock.install();
      await page.clock.pauseAt(new Date(Date.now() + HOLD_MS));
      await confirmButton(page).click();
      await confirmButton(page)
        .and(page.locator('[aria-busy="true"]'))
        .waitFor();
      await shoot(page, testInfo, theme, 'confirm-pending');
      await page.clock.resume();
      await page.getByRole('alertdialog').waitFor({ state: 'detached' });

      await open(page, t.confirms, t.conflict).click();
      await page.getByRole('textbox').fill('Кандидата знайдено внутрішньо');
      await confirmButton(page).click();
      await page.getByRole('alert').waitFor();
      await shoot(page, testInfo, theme, 'confirm-conflict');
    });

    test('Select list above a dialog, and the side sheet', async ({
      page,
    }, testInfo) => {
      await open(page, t.layers, t.layersOpen).click();
      const dialog = page.getByRole('dialog', { name: t.layersTitle });
      await dialog.getByLabel(t.verticalLabel).click();
      await page.getByRole('listbox').waitFor();
      await shoot(page, testInfo, theme, 'layers-select-open');
      await page.keyboard.press('Escape');
      await page.getByRole('listbox').waitFor({ state: 'detached' });
      await page.keyboard.press('Escape');
      await modal(page).waitFor({ state: 'detached' });

      await group(page, t.sheets)
        .getByRole('button', { name: t.sheetLabel.md, exact: true })
        .click();
      await page.getByRole('dialog', { name: t.sheetTitle }).waitFor();
      await shoot(page, testInfo, theme, 'sheet-400');
    });
  });
}
