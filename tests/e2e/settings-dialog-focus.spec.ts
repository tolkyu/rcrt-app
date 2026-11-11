import { expect, test, type Page } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { sessionFile } from '../support/e2e-session';

const t = messages.settings;
const close = messages.common.close;

/** Admin-only screens; modals here return focus to whatever opened them (UI-F8 `useOpenerFocus`), none of them saves anything. */
test.use({ storageState: sessionFile('admin@demo') });
test.describe.configure({ mode: 'default' });

const createButton = (page: Page) =>
  page.getByRole('button', { name: t.verticals.create }).first();
const renameButton = (page: Page) =>
  page
    .getByRole('button', {
      name: new RegExp(`^${t.verticals.rename}: `),
    })
    .first();
const createDialog = (page: Page) =>
  page.getByRole('dialog', { name: t.verticals.dialog.createTitle });
const renameDialog = (page: Page) =>
  page.getByRole('dialog', { name: t.verticals.dialog.renameTitle });
const priorityField = (page: Page) =>
  page.getByLabel(t.priorities.fieldLabel.replace('{name}', 'Тарас Лисенко'), {
    exact: true,
  });
const leaveDialog = (page: Page) =>
  page.getByRole('alertdialog', { name: t.priorities.leaveDialog.title });

/** Both vertical dialogs and the leave dialog are code-split: the first open waits for the chunk. */
async function warmUpVerticals(page: Page) {
  await page.goto('/settings/verticals');
  await createButton(page).click();
  await createDialog(page).getByRole('button', { name: close }).click();
  await expect(createDialog(page)).toHaveCount(0);
  await renameButton(page).click();
  await renameDialog(page).getByRole('button', { name: close }).click();
  await expect(renameDialog(page)).toHaveCount(0);
}

async function openLeaveDialog(page: Page) {
  await page.goto('/settings/priorities');
  await priorityField(page).fill('9');
  await priorityField(page).press('Enter');
  const tab = page.getByRole('tab', { name: 'Крипто' });
  await tab.click();
  await expect(leaveDialog(page)).toBeVisible();
  return tab;
}

const stay = (page: Page) =>
  leaveDialog(page).getByRole('button', {
    name: t.priorities.leaveDialog.stay,
  });

for (const [label, viewport] of [
  ['desktop', { width: 1440, height: 900 }],
  ['phone', { width: 390, height: 844 }],
] as const) {
  test.describe(`${label}: focus returns to the opener of a modal [UI-F8]`, () => {
    test.use({ viewport });

    test('create-vertical dialog: Escape, the close icon and an overlay press all return focus to the create button', async ({
      page,
    }) => {
      await warmUpVerticals(page);
      const create = createButton(page);
      const dialog = createDialog(page);
      await create.click();
      await expect(dialog).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(create).toBeFocused();

      await create.click();
      await dialog.getByRole('button', { name: close }).click();
      await expect(dialog).toHaveCount(0);
      await expect(create).toBeFocused();

      await create.click();
      await expect(dialog).toBeVisible();
      // Radix listens for outside presses only once its layer has mounted and taken focus.
      await expect(dialog.locator(':focus')).toHaveCount(1);
      await page.mouse.click(2, 2);
      await expect(dialog).toHaveCount(0);
      await expect(create).toBeFocused();
    });

    test('rename-vertical dialog returns focus to the row button that opened it', async ({
      page,
    }) => {
      await warmUpVerticals(page);
      const rename = renameButton(page);
      await rename.click();
      await expect(renameDialog(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(renameDialog(page)).toHaveCount(0);
      await expect(rename).toBeFocused();
    });

    test('unsaved-priorities AlertDialog: «Залишитися» returns focus to the tab that was clicked', async ({
      page,
    }) => {
      const tab = await openLeaveDialog(page);
      await stay(page).click();
      await expect(leaveDialog(page)).toHaveCount(0);
      await tab.click();
      await expect(leaveDialog(page)).toBeVisible();
      await stay(page).click();
      await expect(leaveDialog(page)).toHaveCount(0);
      await expect(tab).toBeFocused();
    });

    test('audit record sheet returns focus to the row it was opened from, by Escape and by the close icon', async ({
      page,
    }) => {
      await page.goto('/settings/audit');
      const opener = page.locator('[data-row-open]:visible').first();
      await expect(opener).toBeVisible();
      const sheet = page.getByRole('dialog');
      await opener.click();
      await expect(sheet).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
      await expect(opener).toBeFocused();

      await opener.click();
      await expect(sheet).toBeVisible();
      await sheet.getByRole('button', { name: t.audit.detail.close }).click();
      await expect(sheet).toHaveCount(0);
      await expect(opener).toBeFocused();
    });

    test('the very first open of a code-split dialog still returns focus to its opener', async ({
      page,
    }) => {
      await page.goto('/settings/verticals');
      const create = createButton(page);
      await create.click();
      await expect(createDialog(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(createDialog(page)).toHaveCount(0);
      await expect(create).toBeFocused();
    });
  });
}
