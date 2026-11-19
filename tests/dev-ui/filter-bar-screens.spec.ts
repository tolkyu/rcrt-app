import { copyFileSync, mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { openGallery } from '../support/dev-ui';
import { settleRendering, viewportOf } from '../e2e/screens';

test.use({ reducedMotion: 'reduce' });
const t = messages.devUi.filterChips;

for (const theme of ['light', 'dark'] as const) {
  test(`FilterBar gallery ${theme} [SHOT-01..03, UI-F6b]`, async ({
    page,
  }, testInfo) => {
    await page.clock.setFixedTime(new Date('2026-11-14T10:00:00Z'));
    await openGallery(page, theme);
    await page.addStyleTag({
      content: 'nextjs-portal { display: none !important; }',
    });
    const section = page
      .getByRole('heading', { name: t.barTitle, exact: true })
      .locator('../..');
    await section.scrollIntoViewIfNeeded();
    for (const directory of ['screenshots/phase-2', 'screenshots/latest'])
      mkdirSync(directory, { recursive: true });
    for (const state of ['idle', 'busy'] as const) {
      if (state === 'busy')
        await page
          .getByRole('button', { name: t.toggleBusy, exact: true })
          .click();
      await expect(
        page.getByRole('region', { name: t.barResults, exact: true }),
      ).toHaveCSS('opacity', state === 'busy' ? '0.6' : '1');
      await settleRendering(page);
      await page.mouse.move(0, 0);
      const file = `36-admin-ui-filter-bar-${state}-${viewportOf(testInfo)}-${theme}.png`;
      const path = `screenshots/phase-2/${file}`;
      await section.screenshot({ path, animations: 'disabled', scale: 'css' });
      copyFileSync(path, `screenshots/latest/${file}`);
      await testInfo.attach(file, { path, contentType: 'image/png' });
    }
  });
}
