import { copyFileSync, mkdirSync } from 'node:fs';
import { test } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { openGallery, gallerySection } from '../support/dev-ui';
import { settleRendering, viewportOf } from '../e2e/screens';

test.use({ reducedMotion: 'reduce' });

for (const theme of ['light', 'dark'] as const) {
  test(`FilterChips gallery ${theme} [SHOT-01..03, UI-F6a]`, async ({
    page,
  }, testInfo) => {
    await page.clock.setFixedTime(new Date('2026-11-12T10:00:00Z'));
    await openGallery(page, theme);
    await page.addStyleTag({
      content: 'nextjs-portal { display: none !important; }',
    });
    const section = gallerySection(page, messages.devUi.filterChips.title);
    await section.scrollIntoViewIfNeeded();
    await settleRendering(page);
    await page.mouse.move(0, 0);
    for (const directory of ['screenshots/phase-2', 'screenshots/latest'])
      mkdirSync(directory, { recursive: true });
    const file = `35-admin-ui-filter-chips-states-${viewportOf(testInfo)}-${theme}.png`;
    const path = `screenshots/phase-2/${file}`;
    await section.screenshot({ path, animations: 'disabled', scale: 'css' });
    copyFileSync(path, `screenshots/latest/${file}`);
    await testInfo.attach(file, { path, contentType: 'image/png' });
  });
}
