import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { gallerySection, openGallery, settleFrames } from '../support/dev-ui';

const t = messages.devUi.filterChips;

async function expectRevealed(group: Locator, chip: Locator) {
  const row = await group.boundingBox();
  const button = await chip.boundingBox();
  const startFade =
    (await group.getAttribute('data-overflow-start')) === 'true' ? 16 : 0;
  const endFade =
    (await group.getAttribute('data-overflow-end')) === 'true' ? 16 : 0;
  expect(button!.x - 4).toBeGreaterThanOrEqual(row!.x + startFade - 0.5);
  // A chip wider than the row minus both reveal insets can only show its start (component aligns it to the left snap point).
  const fitsRow = button!.width <= row!.width - 40;
  if (fitsRow)
    expect(button!.x + button!.width + 4).toBeLessThanOrEqual(
      row!.x + row!.width - endFade + 0.5,
    );
  expect(button!.y - 4).toBeGreaterThanOrEqual(row!.y - 0.5);
  expect(button!.y + button!.height + 4).toBeLessThanOrEqual(
    row!.y + row!.height + 0.5,
  );
}

test.describe('FilterChips [UI-F6a]', () => {
  test.beforeEach(async ({ page }) => openGallery(page));

  test('counts have Ukrainian names, tabular digits and optional values stay absent', async ({
    page,
  }) => {
    const group = page.getByRole('radiogroup', {
      name: t.statuses,
      exact: true,
    });
    const radios = group.getByRole('radio');
    await expect(radios).toHaveCount(6);
    for (const [label, count] of [
      [t.all, '1\u00a0284'],
      [t.open, '24'],
      [t.drafts, '1'],
      [t.onHold, '0'],
    ] as const) {
      const radio = group.getByRole('radio', {
        name: `${label}, ${count}`,
        exact: true,
      });
      await expect(radio).toBeVisible();
      await expect(radio.locator('span')).toHaveText(count);
      await expect(radio.locator('span')).toHaveCSS(
        'font-variant-numeric',
        'tabular-nums',
      );
    }
    await expect(
      group.getByRole('radio', { name: t.filled, exact: true }).locator('span'),
    ).toHaveCount(0);
    await expect(
      group.getByRole('radio', { name: t.cancelled, exact: true }),
    ).toHaveAttribute('aria-checked', 'false');
    await expect(radios.first()).toHaveAttribute('aria-checked', 'true');
    await expect(
      page
        .getByRole('radiogroup', { name: t.withoutDrafts, exact: true })
        .getByRole('radio', { name: /Чернетки/ }),
    ).toHaveCount(0);
  });

  test('one Tab stop, arrows wrap and Home/End select without page scrolling', async ({
    page,
  }) => {
    const group = page.getByRole('radiogroup', {
      name: t.statuses,
      exact: true,
    });
    const radios = group.getByRole('radio');
    await radios.first().focus();
    await group.scrollIntoViewIfNeeded();
    const y = await page.evaluate(() => window.scrollY);
    for (const [key, index] of [
      ['ArrowRight', 1],
      ['ArrowDown', 2],
      ['ArrowLeft', 1],
      ['ArrowUp', 0],
      ['ArrowLeft', 5],
      ['ArrowRight', 0],
      ['End', 5],
      ['Home', 0],
    ] as const) {
      await page.keyboard.press(key);
      await expect(radios.nth(index)).toBeFocused();
      await expect(radios.nth(index)).toHaveAttribute('aria-checked', 'true');
      await expect(group.locator('[tabindex="0"]')).toHaveCount(1);
      await expect(group.locator('[aria-checked="true"]')).toHaveCount(1);
      await settleFrames(page);
      expect(await page.evaluate(() => window.scrollY)).toBe(y);
      await expectRevealed(group, radios.nth(index));
    }
    await page.keyboard.press('Tab');
    await expect(
      page
        .getByRole('radiogroup', { name: t.offscreen, exact: true })
        .getByRole('radio')
        .last(),
    ).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(radios.first()).toBeFocused();
  });

  test('disabled options are skipped and disabled or empty groups are not Tab stops', async ({
    page,
  }) => {
    const group = page.getByRole('radiogroup', {
      name: t.disabledOption,
      exact: true,
    });
    const radios = group.getByRole('radio');
    await expect(radios.nth(1)).toBeDisabled();
    await radios.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(radios.nth(2)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(radios.first()).toBeFocused();
    await radios.nth(1).click({ force: true });
    await expect(radios.first()).toHaveAttribute('aria-checked', 'true');
    const disabled = page.getByRole('radiogroup', {
      name: t.disabled,
      exact: true,
    });
    await expect(disabled).toHaveAttribute('aria-disabled', 'true');
    await expect(disabled.locator('[tabindex="0"]')).toHaveCount(0);
    expect(
      await disabled
        .getByRole('radio')
        .evaluateAll((nodes) =>
          nodes.every((node) => (node as HTMLButtonElement).disabled),
        ),
    ).toBe(true);
    await expect(
      page.getByRole('radiogroup', { name: t.empty, exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText(t.empty, { exact: true })).toBeVisible();
    await radios.first().focus();
    await page.keyboard.press('Tab');
    await expect(
      page
        .getByRole('radiogroup', { name: t.one, exact: true })
        .getByRole('radio'),
    ).toBeFocused();
  });

  test('selection and keyboard input only transition press scale and run no animations', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const group = page.getByRole('radiogroup', {
      name: t.statuses,
      exact: true,
    });
    await expect(group).toHaveCSS('scroll-behavior', 'auto');
    await group.getByRole('radio').first().focus();
    await page.keyboard.down('ArrowRight');
    const styles = await group.getByRole('radio').evaluateAll((nodes) =>
      nodes.map((node) => {
        const style = getComputedStyle(node);
        return {
          property: style.transitionProperty,
          duration: style.transitionDuration,
          animation: style.animationName,
          transform: style.transform,
          running: node.getAnimations().length,
        };
      }),
    );
    await page.keyboard.up('ArrowRight');
    expect(
      styles.every(
        (style) =>
          (style.property === 'scale' || style.duration === '0s') &&
          style.animation === 'none' &&
          style.transform === 'none' &&
          style.running === 0,
      ),
    ).toBe(true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await group.getByRole('radio').nth(2).click();
    expect(
      await group.evaluate(
        (node) => node.getAnimations({ subtree: true }).length,
      ),
    ).toBe(0);
  });

  test('resize and 200% text keep selected chips and their focus outlines visible', async ({
    page,
  }) => {
    const group = page.getByRole('radiogroup', {
      name: t.offscreen,
      exact: true,
    });
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await group.scrollIntoViewIfNeeded();
      await settleFrames(page);
      await expectRevealed(group, group.getByRole('radio').last());
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    await settleFrames(page);
    await expectRevealed(group, group.getByRole('radio').last());
    // Other gallery sections overflow at 200% text; only this section must not widen the page.
    expect(
      await page.evaluate(() => {
        const section = document.querySelector('#filter-chips')!;
        return section.scrollWidth <= section.clientWidth;
      }),
    ).toBe(true);
  });

  test('Tab reentry reveals a selected chip after manual row scroll without moving the page', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    const group = page.getByRole('radiogroup', {
      name: t.statuses,
      exact: true,
    });
    const radios = group.getByRole('radio');
    await group.scrollIntoViewIfNeeded();
    await radios.first().focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Tab');
    await group.evaluate((node) => {
      node.scrollLeft = node.scrollWidth;
    });
    await settleFrames(page);
    const y = await page.evaluate(() => scrollY);
    await page.keyboard.press('Shift+Tab');
    await expect(radios.nth(1)).toBeFocused();
    await settleFrames(page);
    await expectRevealed(group, radios.nth(1));
    expect(await page.evaluate(() => scrollY)).toBe(y);
  });

  test('forced colors keeps a visible selected cue and keyboard focus', async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    const radio = page
      .getByRole('radiogroup', { name: t.statuses, exact: true })
      .getByRole('radio')
      .first();
    await radio.focus();
    await expect(radio).toHaveAttribute('aria-checked', 'true');
    await expect(radio).toHaveCSS('outline-style', 'solid');
    const colors = await radio.evaluate((node) => {
      const selected = getComputedStyle(node);
      const unselected = getComputedStyle(node.nextElementSibling!);
      return {
        selected: selected.borderColor,
        unselected: unselected.borderColor,
      };
    });
    expect(colors.selected).not.toBe(colors.unselected);
  });
});

for (const theme of ['light', 'dark'] as const) {
  test(`FilterChips tokens and axe in ${theme} [UI-F6a]`, async ({
    page,
  }, testInfo) => {
    await openGallery(page, theme);
    const section = gallerySection(page, t.title);
    await section.scrollIntoViewIfNeeded();
    const selected = page
      .getByRole('radiogroup', { name: t.statuses, exact: true })
      .getByRole('radio')
      .first();
    const styles = await selected.evaluate((node) => {
      const style = getComputedStyle(node);
      const probe = document.createElement('span');
      node.append(probe);
      const resolve = (token: string) => {
        probe.style.backgroundColor = `var(${token})`;
        return getComputedStyle(probe).backgroundColor;
      };
      const expectedBackground = resolve('--primary-subtle');
      const expectedRing = resolve('--brand');
      probe.remove();
      return {
        background: style.backgroundColor,
        expectedBackground,
        shadow: style.boxShadow,
        expectedRing,
        height: node.getBoundingClientRect().height,
      };
    });
    expect(styles.background).toBe(styles.expectedBackground);
    expect(styles.shadow).toContain(styles.expectedRing);
    expect(styles.shadow).toContain('2px');
    expect(styles.height).toBeGreaterThanOrEqual(
      testInfo.project.name.endsWith('mobile') ? 44 : 36,
    );
    const result = await new AxeBuilder({ page })
      .include('#filter-chips')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    await testInfo.attach('filter-chips-accessibility', {
      body: JSON.stringify(result.violations),
      contentType: 'application/json',
    });
    expect(result.violations).toEqual([]);
  });
}
