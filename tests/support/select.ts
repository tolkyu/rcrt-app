import { expect, type Locator, type Page } from '@playwright/test';

export const optionsOf = (page: Page) => page.getByRole('option');
export const listboxOf = (page: Page) => page.getByRole('listbox');

/** Opens the field with a mouse press and picks the option by its visible name. */
export async function chooseOption(
  page: Page,
  field: Locator,
  optionName: string,
) {
  await field.click();
  await page.getByRole('option', { name: optionName, exact: true }).click();
  await expect(listboxOf(page)).toHaveCount(0);
}

/** Opens the field, asserts the offered options in order and closes the list again. */
export async function expectOptions(
  page: Page,
  field: Locator,
  names: readonly string[],
) {
  await field.click();
  await expect(optionsOf(page)).toHaveText([...names]);
  await page.keyboard.press('Escape');
  await expect(listboxOf(page)).toHaveCount(0);
}

/** Opens the field and asserts how many options carry the given text, then closes the list. */
export async function expectOptionCount(
  page: Page,
  field: Locator,
  optionName: string,
  count: number,
) {
  await field.click();
  await expect(
    page.getByRole('option', { name: optionName, exact: true }),
  ).toHaveCount(count);
  await page.keyboard.press('Escape');
  await expect(listboxOf(page)).toHaveCount(0);
}
