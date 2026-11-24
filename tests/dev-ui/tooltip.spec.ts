import { expect, test, type Locator, type Page } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import {
  gallerySection,
  openGallery,
  settleFrames,
  tabIntoSection,
} from '../support/dev-ui';

const t = messages.devUi.tooltip;

/** The Motion section of the gallery also renders `.motion-tooltip` samples, so only the Radix popper content counts. */
const bubble = (page: Page) =>
  page.locator('[data-radix-popper-content-wrapper] .motion-tooltip');
const infoButton = (page: Page) =>
  gallerySection(page, t.title).getByRole('button', {
    name: t.basicLabel,
    exact: true,
  });

const animationName = (element: Locator) =>
  element.evaluate((node) => getComputedStyle(node).animationName);
const runningAnimations = (element: Locator) =>
  element.evaluate((node) => node.getAnimations().length);
const keyframeScales = (element: Locator) =>
  element.evaluate((node) =>
    node
      .getAnimations()
      .flatMap(
        (animation) =>
          (animation.effect as KeyframeEffect | null)?.getKeyframes() ?? [],
      )
      .map((frame) => String(frame.scale ?? 'none')),
  );

async function centre(element: Locator) {
  const box = await element.boundingBox();
  if (!box) throw new Error('element has no box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function openByKeyboard(page: Page) {
  await openGallery(page);
  await tabIntoSection(page, gallerySection(page, t.title));
  await expect(infoButton(page)).toBeFocused();
  await expect(bubble(page)).toBeVisible();
}

async function openByHover(page: Page) {
  await openGallery(page);
  await infoButton(page).hover();
  await expect(bubble(page)).toBeVisible();
}

test.describe('Tooltip [UI-F2]', () => {
  test('keyboard focus opens it, keeps focus on the trigger and Escape closes it', async ({
    page,
  }) => {
    await openByKeyboard(page);
    await expect(bubble(page)).toContainText(t.basicText);
    await page.keyboard.press('Escape');
    await expect(bubble(page)).toHaveCount(0);
    await expect(infoButton(page)).toBeFocused();
  });

  test('the content stays open while the pointer moves from the trigger onto it and closes once the pointer leaves both', async ({
    page,
  }) => {
    await openByHover(page);
    const content = await centre(bubble(page));
    await page.mouse.move(content.x, content.y, { steps: 12 });
    await settleFrames(page);
    await expect(bubble(page)).toBeVisible();
    await page.mouse.move(2, 2, { steps: 4 });
    await expect(bubble(page)).toHaveCount(0);
  });

  test('a keyboard-opened tooltip has no animation', async ({ page }) => {
    await openByKeyboard(page);
    expect(await animationName(bubble(page))).toBe('none');
    expect(await runningAnimations(bubble(page))).toBe(0);
  });

  test('a pointer-opened tooltip scales from .97 and fades in', async ({
    page,
  }) => {
    await openGallery(page);
    // The 125 ms entry would be over before the assertions run; a long duration keeps it observable.
    await page.addStyleTag({ content: ':root { --duration-tooltip: 10s; }' });
    await infoButton(page).hover();
    await expect(bubble(page)).toBeVisible();
    expect(await animationName(bubble(page))).toBe('motion-tooltip-in');
    expect(await keyframeScales(bubble(page))).toContain('0.97');
  });

  test('the Radix tooltip is not mounted until the first hover or keyboard focus', async ({
    page,
  }) => {
    await openGallery(page);
    await expect(infoButton(page)).not.toHaveAttribute('data-state', /.*/);
    await expect(bubble(page)).toHaveCount(0);
    await infoButton(page).hover();
    await expect(infoButton(page)).toHaveAttribute('data-state', /.+/);
    await expect(bubble(page)).toBeVisible();
  });

  test('keyboard focus mounts it as well', async ({ page }) => {
    await openGallery(page);
    await expect(infoButton(page)).not.toHaveAttribute('data-state', /.*/);
    await tabIntoSection(page, gallerySection(page, t.title));
    await expect(infoButton(page)).toHaveAttribute('data-state', /.+/);
    await expect(bubble(page)).toBeVisible();
  });
});

const tooltipScaleToken = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.setProperty('scale', 'var(--motion-scale-tooltip)');
    document.body.append(probe);
    const { scale } = getComputedStyle(probe);
    probe.remove();
    return scale;
  });

test.describe('Tooltip motion tokens [UI-F2]', () => {
  test('the entry scale is .97 by default', async ({ page }) => {
    await openGallery(page);
    expect(await tooltipScaleToken(page)).toBe('0.97');
  });

  test.describe('with prefers-reduced-motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('the entry scale collapses to 1 and a hover-opened tooltip has no scale keyframe', async ({
      page,
    }) => {
      await openGallery(page);
      // A long entry keeps the animation alive long enough to inspect its keyframes.
      await page.addStyleTag({ content: ':root { --duration-tooltip: 10s; }' });
      await infoButton(page).hover();
      await expect(bubble(page)).toBeVisible();
      expect(await tooltipScaleToken(page)).toBe('1');
      expect(await runningAnimations(bubble(page))).toBeGreaterThan(0);
      expect(
        (await keyframeScales(bubble(page))).filter(
          // `none` is the implicit end keyframe: the identity scale.
          (scale) => scale !== '1' && scale !== 'none',
        ),
      ).toEqual([]);
    });
  });
});
