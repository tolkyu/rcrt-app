import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { openGallery } from '../support/dev-ui';
import { listItem, t as toastText, toastWith, trigger } from '../support/toast';

const t = messages.devUi.pageFrame;
const common = messages.common;

const form = (page: Page) => page.locator('[data-slot="form-page-demo"]');
const leaveDialog = (page: Page) =>
  page.getByRole('alertdialog', { name: common.leaveTitle });

async function makeDirty(page: Page) {
  const field = form(page).getByRole('textbox', {
    name: t.formField,
    exact: true,
  });
  await field.scrollIntoViewIfNeeded();
  await field.fill('Медіабаєр — Facebook');
  await expect(form(page).getByRole('status')).toHaveText(t.formDirty);
}

async function addLink(page: Page, attributes: Record<string, string>) {
  await form(page).evaluate((root, values) => {
    const link = document.createElement('a');
    for (const [name, value] of Object.entries(values))
      link.setAttribute(name, value);
    link.id = 'injected-link';
    link.textContent = 'Тестове посилання';
    root.append(link);
  }, attributes);
  return form(page).locator('#injected-link');
}

test.describe('leave guard ignores navigation that keeps or reopens the page [UI-F9]', () => {
  test('a Ctrl-click on a link opens another tab and does not ask', async ({
    page,
    context,
  }) => {
    await openGallery(page);
    await makeDirty(page);
    const opened = context.waitForEvent('page');
    await form(page)
      .getByRole('link', { name: t.formCancel })
      .click({ modifiers: ['Control'] });
    const tab = await opened;
    await tab.close();
    await expect(leaveDialog(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/dev\/ui$/);
    await expect(
      form(page).getByRole('textbox', { name: t.formField, exact: true }),
    ).toHaveValue('Медіабаєр — Facebook');
  });

  test('a link with target _blank opens another tab and does not ask', async ({
    page,
    context,
  }) => {
    await openGallery(page);
    await makeDirty(page);
    const link = await addLink(page, {
      href: '/dev/ui?left=blank',
      target: '_blank',
    });
    const opened = context.waitForEvent('page');
    await link.click();
    const tab = await opened;
    await tab.close();
    await expect(leaveDialog(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/dev\/ui$/);
  });

  test('a hash link on the same page scrolls without asking', async ({
    page,
  }) => {
    await openGallery(page);
    await makeDirty(page);
    const link = await addLink(page, { href: '#page-frame' });
    await link.click();
    await expect(leaveDialog(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/dev\/ui#page-frame$/);
  });

  test('a link to another page is held until the question is answered, and the field keeps its text on «Залишитися»', async ({
    page,
  }) => {
    await openGallery(page);
    await makeDirty(page);
    const link = await addLink(page, { href: '/dev/ui?left=injected' });
    await link.click();
    await expect(leaveDialog(page)).toBeVisible();
    await expect(page).toHaveURL(/\/dev\/ui$/);
    await leaveDialog(page)
      .getByRole('button', { name: common.leaveStay })
      .click();
    await expect(
      form(page).getByRole('textbox', { name: t.formField, exact: true }),
    ).toHaveValue('Медіабаєр — Facebook');
  });
});

test('the leave question focuses the safe answer and returns focus to the page on «Залишитися» [UI-F9]', async ({
  page,
}) => {
  await openGallery(page);
  await makeDirty(page);
  const cancel = form(page).getByRole('link', { name: t.formCancel });
  await cancel.focus();
  await page.keyboard.press('Enter');
  await expect(leaveDialog(page)).toBeVisible();
  await expect(
    leaveDialog(page).getByRole('button', { name: common.leaveStay }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(leaveDialog(page)).toHaveCount(0);
  await expect(cancel).toBeFocused();
});

test('a toast stays above the sticky bar on a phone and 24 px from the corner on desktop [UI-F9, F7]', async ({
  page,
  isMobile,
}) => {
  await openGallery(page);
  await page.getByRole('button', { name: t.showFrame, exact: true }).click();
  const bar = page.locator('[data-sticky-action-bar]');
  const raise = trigger(page, toastText.titleOnly, toastText.success);
  await raise.scrollIntoViewIfNeeded();
  if (isMobile) await raise.tap();
  else await raise.click();
  const toast = toastWith(page, toastText.successTitle);
  await expect(toast).toBeVisible();
  const viewport = page.viewportSize()!;
  const gap = async () => {
    const rect = await listItem(toast).boundingBox();
    return rect ? viewport.height - (rect.y + rect.height) : -1;
  };
  if (isMobile) {
    const barBox = (await bar.boundingBox())!;
    await expect.poll(gap).toBeCloseTo(viewport.height - barBox.y + 12, 0);
  } else {
    await expect(bar).toBeHidden();
    await expect.poll(gap).toBeCloseTo(24, 0);
  }
});

test('the app main reserves the sticky bar below md and nothing from md up [UI-F9, G6]', async ({
  page,
  isMobile,
}) => {
  const shell = readFileSync('components/shell/app-shell.tsx', 'utf8');
  const [withNav, withoutNav] = [
    ...shell.matchAll(/'(pb-\[calc\([^']+\)\][^']*)'/g),
  ].map((match) => match[1]!);
  expect(withNav).toContain('7rem');
  expect(withoutNav).toContain('1.5rem');
  await openGallery(page);
  const measure = (classes: string) =>
    page.evaluate((value) => {
      const probe = document.createElement('div');
      probe.className = value;
      document.body.append(probe);
      const padding = getComputedStyle(probe).paddingBottom;
      probe.remove();
      return padding;
    }, classes);
  const expected = (bar: number) =>
    isMobile
      ? { withNav: `${112 + bar}px`, withoutNav: `${24 + bar}px` }
      : { withNav: '32px', withoutNav: '32px' };
  await expect.poll(() => measure(withNav!)).toBe(expected(0).withNav);
  await expect.poll(() => measure(withoutNav!)).toBe(expected(0).withoutNav);
  await page.getByRole('button', { name: t.showFrame, exact: true }).click();
  await expect.poll(() => measure(withNav!)).toBe(expected(56).withNav);
  await expect.poll(() => measure(withoutNav!)).toBe(expected(56).withoutNav);
});

test.describe('history stays clean when the guard is left [UI-F9]', () => {
  test('a programmatic push while dirty is not undone by the guard', async ({
    page,
  }) => {
    await openGallery(page);
    await makeDirty(page);
    await page.evaluate(() =>
      (
        window as unknown as {
          next: { router: { push: (to: string) => void } };
        }
      ).next.router.push('/login'),
    );
    await expect(page).toHaveURL(/\/login$/);
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/login$/);
    await expect(leaveDialog(page)).toHaveCount(0);
  });

  test('confirming a link leaves no ghost entry: two Backs reach the page before the form', async ({
    page,
  }) => {
    await page.goto('/dev/ui?from=list');
    await openGallery(page);
    await makeDirty(page);
    await form(page).getByRole('link', { name: t.formCancel }).click();
    await leaveDialog(page)
      .getByRole('button', { name: common.leaveConfirm })
      .click();
    await expect(page).toHaveURL(/\/dev\/ui\?left=form$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/dev\/ui$/);
    await expect(leaveDialog(page)).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/dev\/ui\?from=list$/);
  });

  test('save, release and replace leave the same history as a plain push', async ({
    page,
  }) => {
    await page.goto('/dev/ui?from=list');
    await openGallery(page);
    await makeDirty(page);
    await form(page).getByRole('button', { name: t.formCreate }).click();
    await expect(page).toHaveURL(/\/dev\/ui\?created=1$/);
    await expect(leaveDialog(page)).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/dev\/ui$/);
    await expect(leaveDialog(page)).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/dev\/ui\?from=list$/);
  });
});
