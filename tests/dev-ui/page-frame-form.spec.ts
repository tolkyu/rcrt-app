import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { openGallery } from '../support/dev-ui';

const t = messages.devUi.pageFrame;
const common = messages.common;

const form = (page: Page) => page.locator('[data-slot="form-page-demo"]');
const field = (page: Page) =>
  form(page).getByRole('textbox', { name: t.formField, exact: true });
const leaveDialog = (page: Page) =>
  page.getByRole('alertdialog', { name: common.leaveTitle });

async function makeDirty(page: Page) {
  await field(page).scrollIntoViewIfNeeded();
  await field(page).fill('Медіабаєр — Facebook');
  await expect(form(page).getByRole('status')).toHaveText(t.formDirty);
}

test('footer keeps the primary last; on a phone it wraps to full width under the other two [UI-F9]', async ({
  page,
  isMobile,
}) => {
  await openGallery(page);
  const footer = form(page).locator('[data-slot="form-page-footer"]');
  await footer.scrollIntoViewIfNeeded();
  await expect(footer).toHaveCSS('position', 'sticky');
  const names = [t.formCancel, t.formSave, t.formCreate];
  await expect(footer.locator('a, button')).toHaveText(names);
  const [cancel, save, create] = await Promise.all(
    names.map(
      async (name) =>
        (await footer.getByText(name, { exact: true }).boundingBox())!,
    ),
  );
  if (isMobile) {
    expect(Math.round(cancel!.y)).toBe(Math.round(save!.y));
    expect(create!.y).toBeGreaterThan(save!.y + save!.height - 1);
    expect(create!.width).toBeGreaterThan(300);
  } else {
    expect(Math.round(cancel!.y)).toBe(Math.round(create!.y));
    expect(create!.x).toBeGreaterThan(save!.x);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('a clean form leaves by its back link without asking [UI-F9]', async ({
  page,
}) => {
  await openGallery(page);
  await form(page).getByRole('link', { name: t.formBack }).click();
  await expect(page).toHaveURL(/\/dev\/ui\?left=form$/);
  await expect(leaveDialog(page)).toHaveCount(0);
});

test('a dirty form asks before a link: «Залишитися» keeps the input, «Вийти без збереження» follows the link [UI-F9]', async ({
  page,
}) => {
  await openGallery(page);
  await makeDirty(page);
  await form(page).getByRole('link', { name: t.formCancel }).click();
  await expect(leaveDialog(page)).toBeVisible();
  await leaveDialog(page)
    .getByRole('button', { name: common.leaveStay })
    .click();
  await expect(leaveDialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/dev\/ui$/);
  await expect(field(page)).toHaveValue('Медіабаєр — Facebook');

  await form(page).getByRole('link', { name: t.formBack }).click();
  await leaveDialog(page)
    .getByRole('button', { name: common.leaveConfirm })
    .click();
  await expect(page).toHaveURL(/\/dev\/ui\?left=form$/);
});

test('a dirty form asks before browser Back and stays on «Залишитися» [UI-F9]', async ({
  page,
}) => {
  await page.goto('/dev/ui?from=list');
  await openGallery(page);
  await makeDirty(page);
  await page.goBack();
  await expect(leaveDialog(page)).toBeVisible();
  await expect(page).toHaveURL(/\/dev\/ui$/);
  await leaveDialog(page)
    .getByRole('button', { name: common.leaveStay })
    .click();
  await expect(field(page)).toHaveValue('Медіабаєр — Facebook');

  await page.goBack();
  await leaveDialog(page)
    .getByRole('button', { name: common.leaveConfirm })
    .click();
  await expect(page).toHaveURL(/\/dev\/ui\?from=list$/);
});

test('saving makes the form clean again, so links and Back leave at once [UI-F9]', async ({
  page,
}) => {
  await page.goto('/dev/ui?from=list');
  await openGallery(page);
  await makeDirty(page);
  await form(page).getByRole('button', { name: t.formSave }).click();
  await expect(form(page).getByRole('status')).toHaveText(t.formSaved);
  await page.goBack();
  await expect(page).toHaveURL(/\/dev\/ui\?from=list$/);
  await expect(leaveDialog(page)).toHaveCount(0);
});

test('a dirty form asks before the tab closes [UI-F9]', async ({ page }) => {
  await openGallery(page);
  await makeDirty(page);
  const dialog = page.waitForEvent('dialog');
  await page.close({ runBeforeUnload: true });
  const prompt = await dialog;
  expect(prompt.type()).toBe('beforeunload');
  await prompt.dismiss();
});

for (const theme of ['light', 'dark'] as const) {
  test(`form page and its leave question pass axe in ${theme} [UI-F9]`, async ({
    page,
  }) => {
    await openGallery(page, theme);
    await makeDirty(page);
    const formAudit = await new AxeBuilder({ page })
      .include('[data-slot="form-page-demo"]')
      .analyze();
    await form(page).getByRole('link', { name: t.formCancel }).click();
    await expect(leaveDialog(page)).toBeVisible();
    const dialogAudit = await new AxeBuilder({ page })
      .include('[role="alertdialog"]')
      .analyze();
    expect(
      [...formAudit.violations, ...dialogAudit.violations].filter((v) =>
        ['serious', 'critical'].includes(v.impact ?? ''),
      ),
    ).toEqual([]);
  });
}
