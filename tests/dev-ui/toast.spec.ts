import { expect, test, type Locator, type Page } from '@playwright/test';
import { checkAccessibility } from '../support/accessibility';
import { openGallery } from '../support/dev-ui';
import {
  c,
  closeButton,
  dialog,
  flushReact,
  freezeClock,
  group,
  isRemoving,
  lineCount,
  listItem,
  openDialog,
  raise,
  raiseFromDialog,
  t,
  toaster,
  toastItems,
  toastWith,
  topmostAt,
  trigger,
  untilGone,
  warmToasts,
} from '../support/toast';

const TONES = [
  { tone: 'success', label: t.success, title: t.successTitle, ms: 4_000 },
  { tone: 'info', label: t.info, title: t.infoTitle, ms: 5_000 },
  { tone: 'warning', label: t.warning, title: t.warningTitle, ms: 8_000 },
  { tone: 'error', label: t.error, title: t.errorTitle, ms: 8_000 },
] as const;

const setTabHidden = (page: Page, hidden: boolean) =>
  page.evaluate((value) => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => value,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);

const description = (tone: (typeof TONES)[number]['tone']) =>
  t[`${tone}Description`];

const luminance = (rgb: string) => {
  const [red = 0, green = 0, blue = 0] = (rgb.match(/\d+(\.\d+)?/g) ?? []).map(
    Number,
  );
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
};

test.describe('Toast runtime loading [UI-F7]', () => {
  test('the Sonner chunk is not requested until the first toast', async ({
    page,
  }) => {
    const requested: string[] = [];
    page.on('request', (request) => {
      if (/sonner/i.test(request.url())) requested.push(request.url());
    });
    await openGallery(page);
    expect(requested).toEqual([]);
    await trigger(page, t.titleOnly, t.success).click();
    await expect(toastWith(page, t.successTitle)).toBeVisible();
    expect(requested.length).toBeGreaterThan(0);
  });
});

test.describe('Toast anatomy and roles [UI-F7]', () => {
  for (const { tone, label, title } of TONES) {
    test(`the ${tone} toast has an icon circle, title, description and a close button labelled «${c.close}»`, async ({
      page,
    }) => {
      await openGallery(page);
      await trigger(page, t.tones, label).click();
      const toast = toastWith(page, title);
      await expect(toast).toBeVisible();
      await expect(toast).toHaveAttribute('data-tone', tone);
      if (tone === 'error')
        await expect(toast).toHaveAttribute('role', 'alert');
      else await expect(toast).not.toHaveAttribute('role');
      await expect(toast.getByText(title, { exact: true })).toBeVisible();
      await expect(
        toast.getByText(description(tone), { exact: true }),
      ).toBeVisible();
      await expect(closeButton(toast)).toHaveCount(1);
      await expect(closeButton(toast)).toBeVisible();

      const circle = toast.locator('xpath=./span[1]');
      await expect(circle.locator('svg[aria-hidden="true"]')).toHaveCount(1);
      const look = await toast.evaluate((node) => {
        const ring = node.firstElementChild as HTMLElement;
        const style = getComputedStyle(node);
        const circleStyle = getComputedStyle(ring);
        const box = ring.getBoundingClientRect();
        return {
          surface: style.backgroundColor,
          circle: circleStyle.backgroundColor,
          radius: circleStyle.borderRadius,
          width: box.width,
          height: box.height,
          border: style.borderTopColor,
        };
      });
      expect(look.width).toBe(32);
      expect(look.height).toBe(32);
      expect(look.circle).not.toBe(look.surface);
      expect(look.border).not.toBe(look.surface);
    });
  }

  test('every tone has its own circle tint and border colour', async ({
    page,
  }) => {
    await openGallery(page);
    await warmToasts(page);
    await freezeClock(page);
    const tints = new Set<string>();
    const borders = new Set<string>();
    for (const { label, title } of TONES) {
      const toast = toastWith(page, title);
      await raise(page, trigger(page, t.tones, label), toast);
      const look = await toast.evaluate((node) => ({
        circle: getComputedStyle(node.firstElementChild as Element)
          .backgroundColor,
        border: getComputedStyle(node).borderTopColor,
      }));
      tints.add(look.circle);
      borders.add(look.border);
    }
    expect(tints.size).toBe(4);
    expect(borders.size).toBe(4);
  });

  test('only the error toast carries role=alert; the others rely on the polite region', async ({
    page,
  }) => {
    await openGallery(page);
    await warmToasts(page);
    await freezeClock(page);
    for (const { label, title } of TONES)
      await raise(page, trigger(page, t.tones, label), toastWith(page, title));
    const region = page.getByRole('region', {
      name: c.notifications,
      exact: true,
    });
    await expect(region.getByRole('alert')).toHaveCount(1);
    await expect(region.getByRole('alert')).toContainText(t.errorTitle);
    await expect(region.getByRole('status')).toHaveCount(0);
  });

  test('the toast region is labelled «Сповіщення» and is a live region', async ({
    page,
  }) => {
    await openGallery(page);
    await trigger(page, t.titleOnly, t.info).click();
    await expect(toastWith(page, t.infoTitle)).toBeVisible();
    const region = page
      .getByRole('region', { name: c.notifications, exact: true })
      .filter({ has: toaster(page) });
    await expect(region).toHaveCount(1);
    await expect(region).toHaveAttribute('aria-live', 'polite');
  });

  test('a title-only toast shows no description and no action', async ({
    page,
  }) => {
    await openGallery(page);
    await trigger(page, t.titleOnly, t.warning).click();
    const toast = toastWith(page, t.warningTitle);
    await expect(toast).toBeVisible();
    await expect(toast.locator('p')).toHaveCount(1);
    await expect(toast.getByRole('button')).toHaveCount(1);
  });

  test('the close button removes the toast and can be used from the keyboard', async ({
    page,
  }) => {
    await openGallery(page);
    await trigger(page, t.tones, t.info).click();
    const toast = toastWith(page, t.infoTitle);
    await expect(toast).toBeVisible();
    await closeButton(toast).focus();
    await expect(closeButton(toast)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(toastItems(page)).toHaveCount(0);
  });
});

test.describe('Toast actions, de-duplication and timing [UI-F7]', () => {
  test('the action runs once, then closes the toast', async ({ page }) => {
    await openGallery(page);
    await trigger(page, t.action, t.withAction).click();
    const toast = toastWith(page, t.successTitle);
    await expect(toast).toBeVisible();
    const action = toast.getByRole('button', { name: t.open, exact: true });
    await expect(group(page, t.action)).toContainText(
      t.actionCount.replace('{count}', '0'),
    );
    await action.click();
    await expect(toastItems(page)).toHaveCount(0);
    await expect(group(page, t.action)).toContainText(
      t.actionCount.replace('{count}', '1'),
    );
  });

  test('the action is reachable by keyboard and fires on Enter', async ({
    page,
  }) => {
    await openGallery(page);
    await trigger(page, t.action, t.withAction).click();
    const toast = toastWith(page, t.successTitle);
    const action = toast.getByRole('button', { name: t.open, exact: true });
    await action.focus();
    await page.keyboard.press('Enter');
    await expect(toastItems(page)).toHaveCount(0);
    await expect(group(page, t.action)).toContainText(
      t.actionCount.replace('{count}', '1'),
    );
  });

  test('a repeated id keeps one toast and starts its timer again', async ({
    page,
  }) => {
    await openGallery(page);
    await warmToasts(page);
    await freezeClock(page);
    const toast = toastWith(page, t.staleTitle);
    const button = trigger(page, t.dedupe, t.stale);
    await raise(page, button, toast);
    await page.clock.runFor(7_000);
    await expect(toast).toHaveCount(1);
    expect(await isRemoving(toast)).toBe(false);

    await button.click();
    await page.clock.runFor(1);
    await flushReact(page);
    await expect(toastItems(page)).toHaveCount(1);
    await page.clock.runFor(7_000);
    await expect(toastItems(page)).toHaveCount(1);
    expect(await isRemoving(toast)).toBe(false);

    await page.clock.runFor(1_100);
    await expect(listItem(toast)).toHaveAttribute('data-removed', 'true');
    await untilGone(page, toast);
  });

  test('toasts without an id stack instead of replacing each other', async ({
    page,
  }) => {
    await openGallery(page);
    await warmToasts(page);
    await freezeClock(page);
    await raise(
      page,
      trigger(page, t.titleOnly, t.success),
      toastWith(page, t.successTitle),
    );
    await raise(
      page,
      trigger(page, t.titleOnly, t.info),
      toastWith(page, t.infoTitle),
    );
    await expect(toastItems(page)).toHaveCount(2);
  });

  for (const { label, title, ms } of TONES) {
    test(`the ${title} toast closes after ${ms} ms and not earlier`, async ({
      page,
    }) => {
      await openGallery(page);
      await warmToasts(page);
      await freezeClock(page);
      const toast = toastWith(page, title);
      await raise(page, trigger(page, t.tones, label), toast);
      await page.clock.runFor(ms - 100);
      await expect(toast).toBeVisible();
      expect(await isRemoving(toast)).toBe(false);
      await page.clock.runFor(150);
      await expect(listItem(toast)).toHaveAttribute('data-removed', 'true');
      await untilGone(page, toast);
    });
  }

  test('a toast with an action never times out', async ({ page }) => {
    await openGallery(page);
    await warmToasts(page);
    await freezeClock(page);
    const toast = toastWith(page, t.successTitle);
    await raise(page, trigger(page, t.action, t.withAction), toast);
    await page.clock.runFor(600_000);
    await expect(toast).toBeVisible();
    expect(await isRemoving(toast)).toBe(false);
  });

  test('the worst-case error toast with an action also stays', async ({
    page,
  }) => {
    await openGallery(page);
    await warmToasts(page);
    await freezeClock(page);
    const toast = toastWith(page, t.longTitle);
    await raise(page, trigger(page, t.worst, t.long), toast);
    await page.clock.runFor(600_000);
    await expect(toast).toBeVisible();
  });

  test('hovering the toast pauses the timer and leaving resumes it with the time that was left', async ({
    page,
  }) => {
    await openGallery(page);
    await warmToasts(page);
    await freezeClock(page);
    const toast = toastWith(page, t.successTitle);
    await raise(page, trigger(page, t.titleOnly, t.success), toast);
    await page.clock.runFor(3_000);

    await toast.hover();
    await expect(listItem(toast)).toHaveAttribute('data-expanded', 'true');
    await flushReact(page);
    await page.clock.runFor(60_000);
    await expect(toast).toBeVisible();
    expect(await isRemoving(toast)).toBe(false);

    await page.mouse.move(0, 0);
    await expect(listItem(toast)).toHaveAttribute('data-expanded', 'false');
    await flushReact(page);
    await page.clock.runFor(900);
    expect(await isRemoving(toast)).toBe(false);
    await page.clock.runFor(200);
    await expect(listItem(toast)).toHaveAttribute('data-removed', 'true');
    await untilGone(page, toast);
  });
  test('a hidden tab pauses the timer and showing it again resumes with the time that was left', async ({
    page,
  }) => {
    await openGallery(page);
    await warmToasts(page);
    await freezeClock(page);
    const toast = toastWith(page, t.successTitle);
    await raise(page, trigger(page, t.titleOnly, t.success), toast);
    await page.clock.runFor(3_000);

    await setTabHidden(page, true);
    await flushReact(page);
    await page.clock.runFor(60_000);
    await expect(toast).toBeVisible();
    expect(await isRemoving(toast)).toBe(false);

    await setTabHidden(page, false);
    await flushReact(page);
    await page.clock.runFor(900);
    expect(await isRemoving(toast)).toBe(false);
    await page.clock.runFor(200);
    await expect(listItem(toast)).toHaveAttribute('data-removed', 'true');
    await untilGone(page, toast);
  });
});

test.describe('Toast above a dialog [UI-F7]', () => {
  test.beforeEach(async ({ page }) => {
    await openGallery(page);
    await openDialog(page);
  });

  test('the toast is visible over the dialog and every part of it is the topmost element', async ({
    page,
  }) => {
    const toast = await raiseFromDialog(page);
    await expect(dialog(page)).toBeVisible();
    await expect.poll(() => topmostAt(toast)).toBe(true);
    await expect.poll(() => topmostAt(closeButton(toast))).toBe(true);
    await expect
      .poll(() => topmostAt(toast.getByRole('button', { name: t.open })))
      .toBe(true);
  });

  test('the layers are dialog 40, popups 45 and toast 50', async ({ page }) => {
    await raiseFromDialog(page);
    const dialogLayers = await page.evaluate(() => {
      const content = document.querySelector('[data-slot="dialog-content"]');
      const overlay = content?.previousElementSibling;
      return {
        content: content ? getComputedStyle(content).zIndex : null,
        overlay: overlay ? getComputedStyle(overlay).zIndex : null,
      };
    });
    expect(dialogLayers).toEqual({ content: '40', overlay: '40' });
    expect(
      await toaster(page).evaluate((node) => getComputedStyle(node).zIndex),
    ).toBe('50');

    await dialog(page).getByLabel(t.selectLabel, { exact: true }).click();
    const popup = page.locator('[data-slot="select-content"]');
    await expect(popup).toBeVisible();
    expect(
      await popup.evaluate((node) => {
        const wrapper = node.closest('[data-radix-popper-content-wrapper]');
        return wrapper ? getComputedStyle(wrapper).zIndex : null;
      }),
    ).toBe('45');
  });

  test('clicking the toast body leaves the dialog open', async ({ page }) => {
    const toast = await raiseFromDialog(page);
    await toast.getByText(t.dialogToast, { exact: true }).click();
    await toast.getByText(t.dialogToastDescription, { exact: true }).click();
    await expect(dialog(page)).toBeVisible();
    await expect(toast).toBeVisible();
  });

  test('the close button closes only the toast', async ({ page }) => {
    const toast = await raiseFromDialog(page);
    await closeButton(toast).click();
    await expect(toastItems(page)).toHaveCount(0);
    await expect(dialog(page)).toBeVisible();
  });

  test('the action runs and closes only the toast', async ({ page }) => {
    const toast = await raiseFromDialog(page);
    await toast.getByRole('button', { name: t.open, exact: true }).click();
    await expect(toastItems(page)).toHaveCount(0);
    await expect(dialog(page)).toBeVisible();
  });

  test('with a dialog open the toast is still exposed to assistive technology', async ({
    page,
  }) => {
    const toast = await raiseFromDialog(page);
    await expect(
      page
        .getByRole('region', { name: c.notifications, exact: true })
        .getByText(t.dialogToast, { exact: true }),
    ).toBeVisible();
    await expect(
      toast.locator('xpath=ancestor-or-self::*[@aria-hidden="true"]'),
    ).toHaveCount(0);
    await expect(
      toast.getByRole('button', { name: t.open, exact: true }),
    ).toBeVisible();
  });

  test('Escape still closes the dialog while a toast is on screen', async ({
    page,
  }) => {
    const toast = await raiseFromDialog(page);
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await expect(toast).toBeVisible();
  });

  test('a click on the overlay still closes the dialog and leaves the toast', async ({
    page,
  }) => {
    const toast = await raiseFromDialog(page);
    await page.mouse.click(8, 8);
    await expect(dialog(page)).toHaveCount(0);
    await expect(toast).toBeVisible();
  });

  test('the toast covers the dialog where they overlap on a small window', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 700, height: 560 });
    const toast = await raiseFromDialog(page);
    const overlap = await page.evaluate(() => {
      const toastBox = document
        .querySelector('[data-slot="toast"]')
        ?.getBoundingClientRect();
      const dialogBox = document
        .querySelector('[data-slot="dialog-content"]')
        ?.getBoundingClientRect();
      if (!toastBox || !dialogBox) return null;
      const left = Math.max(toastBox.left, dialogBox.left);
      const right = Math.min(toastBox.right, dialogBox.right);
      const top = Math.max(toastBox.top, dialogBox.top);
      const bottom = Math.min(toastBox.bottom, dialogBox.bottom);
      if (right <= left || bottom <= top) return null;
      const hit = document.elementFromPoint(
        (left + right) / 2,
        (top + bottom) / 2,
      );
      return {
        width: right - left,
        height: bottom - top,
        onToast: hit?.closest('[data-slot="toast"]') !== null,
      };
    });
    expect(overlap).not.toBeNull();
    expect(overlap?.onToast).toBe(true);
    await expect(toast).toBeVisible();
  });

  test('a Select list opens above the dialog under a toast and its option can be picked', async ({
    page,
  }) => {
    const toast = await raiseFromDialog(page);
    const trigger = dialog(page).getByLabel(t.selectLabel, { exact: true });
    await trigger.click();
    const popup = page.locator('[data-slot="select-content"]');
    await expect(popup).toBeVisible();
    await expect.poll(() => topmostAt(popup)).toBe(true);
    await popup.getByRole('option', { name: t.optionCrypto }).click();
    await expect(popup).toHaveCount(0);
    await expect(trigger).toContainText(t.optionCrypto);
    await expect(dialog(page)).toBeVisible();
    await expect(toast).toBeVisible();
  });

  test('a Combobox list opens above the dialog under a toast and its option can be picked', async ({
    page,
  }) => {
    const toast = await raiseFromDialog(page);
    const input = dialog(page).getByLabel(t.comboboxLabel, { exact: true });
    await input.click();
    const popup = page.locator('[data-slot="combobox-content"]');
    await expect(popup).toBeVisible();
    await expect.poll(() => topmostAt(popup)).toBe(true);
    await popup.getByRole('option', { name: t.optionCrypto }).click();
    await expect(popup).toHaveCount(0);
    await expect(input).toHaveValue(t.optionCrypto);
    await expect(dialog(page)).toBeVisible();
    await expect(toast).toBeVisible();
  });

  test('a DropdownMenu opens above the dialog under a toast and its item can be picked', async ({
    page,
  }) => {
    const toast = await raiseFromDialog(page);
    await dialog(page).getByRole('button', { name: t.menuLabel }).click();
    const menu = page.locator('[data-slot="dropdown-menu-content"]');
    await expect(menu).toBeVisible();
    await expect.poll(() => topmostAt(menu)).toBe(true);
    await menu.getByRole('menuitem', { name: t.optionCrypto }).click();
    await expect(menu).toHaveCount(0);
    await expect(dialog(page)).toBeVisible();
    await expect(toast).toBeVisible();
  });
});

test.describe('Toast motion [UI-F7]', () => {
  test('with normal motion the toast slides and fades', async ({ page }) => {
    await openGallery(page);
    await trigger(page, t.tones, t.success).click();
    const item = listItem(toastWith(page, t.successTitle));
    await expect(item).toBeVisible();
    const property = await item.evaluate(
      (node) => getComputedStyle(node).transitionProperty,
    );
    expect(property).toContain('transform');
    expect(property).toContain('opacity');
  });

  test.describe('with prefers-reduced-motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('the toast and its inner box transition opacity only, with a real duration', async ({
      page,
    }) => {
      await openGallery(page);
      await trigger(page, t.tones, t.success).click();
      const item = listItem(toastWith(page, t.successTitle));
      await expect(item).toBeVisible();
      const motion = await item.evaluate((node) =>
        [node, ...Array.from(node.children)].map((element) => {
          const style = getComputedStyle(element);
          return {
            property: style.transitionProperty,
            duration: style.transitionDuration,
          };
        }),
      );
      for (const entry of motion) {
        expect(entry.property).toBe('opacity');
        expect(entry.duration).not.toBe('0s');
      }
    });
  });
});

test.describe('Toast themes [UI-F7]', () => {
  test('a dark toast sits on a dark surface and a light one on a light surface', async ({
    page,
  }) => {
    const surfaces: Record<string, string> = {};
    for (const theme of ['light', 'dark'] as const) {
      await openGallery(page, theme);
      await trigger(page, t.tones, t.warning).click();
      const toast = toastWith(page, t.warningTitle);
      await expect(toast).toBeVisible();
      surfaces[theme] = await toast.evaluate(
        (node) => getComputedStyle(node).backgroundColor,
      );
    }
    expect(surfaces.light).not.toBe(surfaces.dark);
    expect(luminance(surfaces.light ?? '')).toBeGreaterThan(0.9);
    expect(luminance(surfaces.dark ?? '')).toBeLessThan(0.2);
  });
});

test.describe('Toast text limits [UI-F7]', () => {
  test('a long title wraps in full and the description keeps two lines', async ({
    page,
  }) => {
    await openGallery(page);
    await trigger(page, t.worst, t.long).click();
    const toast = toastWith(page, t.longTitle);
    await expect(toast).toBeVisible();
    const title = toast.getByText(t.longTitle, { exact: true });
    expect(await lineCount(title)).toBeGreaterThan(2);
    const body = toast.getByText(t.longDescription, { exact: true });
    expect(await lineCount(body)).toBe(2);
    const clamped = await body.evaluate((node) => ({
      cut: node.scrollHeight > node.clientHeight,
      clamp: getComputedStyle(node).webkitLineClamp,
    }));
    expect(clamped).toEqual({ cut: true, clamp: '2' });
    const box = await toast.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(1440);
    expect(box!.y).toBeGreaterThanOrEqual(0);
  });

  test('the toast sits 24 px from the bottom-right corner on desktop', async ({
    page,
  }) => {
    await openGallery(page);
    await trigger(page, t.titleOnly, t.success).click();
    const toast = toastWith(page, t.successTitle);
    await expect(toast).toBeVisible();
    await expect
      .poll(async () => {
        const box = await listItem(toast).boundingBox();
        return box
          ? [1440 - (box.x + box.width), 900 - (box.y + box.height)]
          : [];
      })
      .toEqual([24, 24]);
  });
});

/** Hovering pauses Sonner's timer, so the toast outlives the scan without touching the clock that axe's own timers need. */
async function holdOpen(page: Page, toast: Locator) {
  await toast.hover();
  await expect(listItem(toast)).toHaveAttribute('data-expanded', 'true');
  await flushReact(page);
}

test.describe('Toast accessibility [UI-F7]', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const { label, title, tone } of TONES) {
      test(`axe is clean with a ${tone} toast (${theme})`, async ({
        page,
      }, testInfo) => {
        await openGallery(page, theme);
        await trigger(page, t.tones, label).click();
        const toast = toastWith(page, title);
        await expect(toast).toBeVisible();
        await holdOpen(page, toast);
        await checkAccessibility(page, testInfo);
      });
    }

    test(`axe is clean with an action toast and the worst-case text (${theme})`, async ({
      page,
    }, testInfo) => {
      await openGallery(page, theme);
      await trigger(page, t.worst, t.long).click();
      await expect(toastWith(page, t.longTitle)).toBeVisible();
      await checkAccessibility(page, testInfo);
    });

    test(`axe is clean with a toast over an open dialog (${theme})`, async ({
      page,
    }, testInfo) => {
      await openGallery(page, theme);
      await openDialog(page);
      await raiseFromDialog(page);
      await checkAccessibility(page, testInfo);
    });

    test(`axe is clean with a list open inside a dialog under a toast (${theme})`, async ({
      page,
    }, testInfo) => {
      await openGallery(page, theme);
      await openDialog(page);
      await raiseFromDialog(page);
      await dialog(page).getByLabel(t.selectLabel, { exact: true }).click();
      await expect(page.locator('[data-slot="select-content"]')).toBeVisible();
      await checkAccessibility(page, testInfo);
    });
  }
});
