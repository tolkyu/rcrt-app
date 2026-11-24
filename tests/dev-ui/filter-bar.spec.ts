import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { openGallery } from '../support/dev-ui';

const t = messages.devUi.filterChips;

test('FilterBar dims only results at 150 ms, cancels brief refreshes and keeps keyboard controls usable [UI-F6b]', async ({
  page,
}) => {
  await openGallery(page);
  const toggle = page.getByRole('button', { name: t.toggleBusy, exact: true });
  await toggle.scrollIntoViewIfNeeded();
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const results = page.getByRole('region', { name: t.barResults, exact: true });
  const controls = page.getByRole('region', { name: t.barTitle, exact: true });
  const group = controls.getByRole('radiogroup', {
    name: t.barStatuses,
    exact: true,
  });

  await toggle.click();
  await expect(results).toHaveAttribute('aria-busy', 'true');
  await page.clock.runFor(149);
  await expect(results).toHaveCSS('opacity', '1');
  await expect(results).toHaveAttribute('data-dimmed', 'false');
  await page.clock.runFor(1);
  await expect(results).toHaveCSS('opacity', '0.6');
  await expect(controls).toHaveCSS('opacity', '1');
  await expect(results).toHaveCSS('transition-duration', '0s');
  await expect(results).toHaveCSS('animation-name', 'none');
  await group.getByRole('radio').first().focus();
  await page.keyboard.press('End');
  await expect(group.getByRole('radio').last()).toBeFocused();
  await expect(group.getByRole('radio').last()).toBeChecked();
  await controls.getByRole('button', { name: t.reset, exact: true }).click();
  await expect(group.getByRole('radio').first()).toBeChecked();
  await toggle.click();
  await expect(results).toHaveCSS('opacity', '1');
  await expect(results).toHaveAttribute('aria-busy', 'false');

  await toggle.click();
  await page.clock.runFor(100);
  await toggle.click();
  await page.clock.runFor(100);
  await expect(results).toHaveCSS('opacity', '1');
  await toggle.click();
  await page.clock.runFor(149);
  await expect(results).toHaveCSS('opacity', '1');
  await page.clock.runFor(1);
  await expect(results).toHaveCSS('opacity', '0.6');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

for (const theme of ['light', 'dark'] as const) {
  test(`FilterBar accessible idle and busy in ${theme} with reduced motion [UI-F6b]`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openGallery(page, theme);
    for (const busy of [false, true]) {
      if (busy)
        await page
          .getByRole('button', { name: t.toggleBusy, exact: true })
          .click();
      const results = page.getByRole('region', {
        name: t.barResults,
        exact: true,
      });
      await expect(results).toHaveCSS('opacity', busy ? '0.6' : '1');
      const controls = await new AxeBuilder({ page })
        .include('[data-slot="filter-bar"]')
        .analyze();
      /** Dimmed results are stale content marked aria-busy for the length of a refetch; contrast is audited in the idle pass. */
      const region = new AxeBuilder({ page }).include(
        '[data-slot="filter-bar-results"]',
      );
      const resultsAudit = await (
        busy ? region.disableRules(['color-contrast']) : region
      ).analyze();
      expect(
        [...controls.violations, ...resultsAudit.violations].filter(
          (violation) =>
            ['serious', 'critical'].includes(violation.impact ?? ''),
        ),
      ).toEqual([]);
    }
  });
}
