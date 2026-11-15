import { copyFileSync, mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { openGallery } from '../support/dev-ui';
import { settleRendering, viewportOf } from '../e2e/screens';

test.use({ reducedMotion: 'reduce' });
const t = messages.devUi.pageFrame;
const rowMenu = t.rowMenu.replace('{title}', t.rowTitle);

for (const theme of ['light', 'dark'] as const) {
  test(`page frame gallery ${theme} [SHOT-01..03, UI-F9]`, async ({
    page,
  }, testInfo) => {
    await page.clock.setFixedTime(new Date('2026-11-15T10:00:00Z'));
    await openGallery(page, theme);
    await page.addStyleTag({
      content: 'nextjs-portal { display: none !important; }',
    });
    for (const directory of ['screenshots/phase-2', 'screenshots/latest'])
      mkdirSync(directory, { recursive: true });
    const save = async (
      state: string,
      shoot: (path: string) => Promise<unknown>,
    ) => {
      await settleRendering(page);
      const file = `37-admin-ui-page-frame-${state}-${viewportOf(testInfo)}-${theme}.png`;
      const path = `screenshots/phase-2/${file}`;
      await shoot(path);
      copyFileSync(path, `screenshots/latest/${file}`);
      await testInfo.attach(file, { path, contentType: 'image/png' });
    };

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
  });
}
