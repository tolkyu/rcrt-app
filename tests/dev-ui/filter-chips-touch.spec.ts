import { expect, test } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { openGallery, settleFrames } from '../support/dev-ui';

const t = messages.devUi.filterChips;

for (const width of [320, 390]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`touch scroll at ${width}px in ${theme} [UI-F6a]`, async ({
      page,
      context,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await openGallery(page, theme);
      const row = page.getByRole('radiogroup', {
        name: t.statuses,
        exact: true,
      });
      await row.scrollIntoViewIfNeeded();
      await expect(row).toHaveAttribute('data-overflow-start', 'false');
      await expect(row).toHaveAttribute('data-overflow-end', 'true');
      const before = await row.boundingBox();
      const first = await row.getByRole('radio').first().boundingBox();
      expect(first!.x - before!.x).toBeGreaterThanOrEqual(4);
      expect(first!.height).toBeGreaterThanOrEqual(44);
      const y = await page.evaluate(() => scrollY);
      const session = await context.newCDPSession(page);
      const lastChip = row.getByRole('radio').last();
      const start = before!.x + before!.width - 24;
      const touchY = before!.y + before!.height / 2;
      // Timestamps matter: untimed synthetic touches leave a pending fling that swallows the next tap.
      const swipe = async () => {
        const origin = Date.now() / 1000;
        const at = (tick: number) => origin + tick * 0.016;
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: start, y: touchY }],
          timestamp: at(0),
        });
        for (let step = 1; step <= 8; step++) {
          await session.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [
              { x: start - (step * (before!.width - 48)) / 8, y: touchY },
            ],
            timestamp: at(step),
          });
        }
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchEnd',
          touchPoints: [],
          timestamp: at(40),
        });
        await expect
          .poll(async () => {
            const previous = await row.evaluate((node) => node.scrollLeft);
            await settleFrames(page, 6);
            return (await row.evaluate((node) => node.scrollLeft)) === previous;
          })
          .toBe(true);
      };
      await swipe();
      expect(await row.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
      await expect(row).toHaveAttribute('data-overflow-start', 'true');
      expect(await page.evaluate(() => scrollY)).toBe(y);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      // At 320 px one swipe leaves the last chip off-screen; a finger keeps swiping until part of it is under the thumb.
      const visiblePart = async () => {
        const box = await lastChip.boundingBox();
        const left = Math.max(box!.x, before!.x);
        const right = Math.min(box!.x + box!.width, before!.x + before!.width);
        return { box: box!, left, right };
      };
      for (let swipes = 1; swipes < 4; swipes++) {
        const part = await visiblePart();
        if (part.right - part.left >= 24) break;
        await swipe();
      }
      const part = await visiblePart();
      expect(part.right - part.left).toBeGreaterThanOrEqual(24);
      // A finger taps the visible part of a clipped chip; Playwright's tap() would scroll it into view first.
      await page.touchscreen.tap(
        (part.left + part.right) / 2,
        part.box.y + part.box.height / 2,
      );
      await expect(row.getByRole('radio').last()).toHaveAttribute(
        'aria-checked',
        'true',
      );
      await settleFrames(page);
      await expect(row).toHaveAttribute('data-overflow-end', 'false');
      const last = await row.getByRole('radio').last().boundingBox();
      expect(last!.x + last!.width + 4).toBeLessThanOrEqual(
        before!.x + before!.width + 0.5,
      );
      await expect(
        page.getByRole('radiogroup', { name: t.one, exact: true }),
      ).toHaveAttribute('data-overflow-end', 'false');
      await session.detach();
    });
  }
}
