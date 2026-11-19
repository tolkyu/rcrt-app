import { expect, test, type Locator, type Page } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { checkAccessibility } from '../support/accessibility';
import { gallerySection, openGallery, tabAfter } from '../support/dev-ui';

const t = messages.devUi.combobox;
const c = messages.common;
const people = t.people;

const section = (page: Page) => gallerySection(page, t.title);
const field = (page: Page, label: string) =>
  section(page).getByLabel(label, { exact: true });
const popup = (page: Page) => page.locator('[data-slot="combobox-content"]');
const options = (page: Page) => popup(page).getByRole('option');
const option = (page: Page, name: string | RegExp) =>
  popup(page).getByRole('option', { name });
const dialog = (page: Page) => page.getByRole('dialog');

const animationName = (element: Locator) =>
  element.evaluate((node) => getComputedStyle(node).animationName);

const activeOptionId = (input: Locator) =>
  input.getAttribute('aria-activedescendant');

/** Fires one `input` event per character in a single task, so only the debounce can keep the requests down. */
const typeInOneTask = (input: Locator, text: string) =>
  input.evaluate((node, characters) => {
    const control = node as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    let value = control.value;
    for (const character of characters) {
      value += character;
      setValue?.call(control, value);
      control.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, text);

const countAbortListeners = (page: Page) =>
  page.addInitScript(() => {
    const holder = window as unknown as { __requests: number };
    holder.__requests = 0;
    const original = AbortSignal.prototype.addEventListener;
    AbortSignal.prototype.addEventListener = function (
      this: AbortSignal,
      ...args: Parameters<AbortSignal['addEventListener']>
    ) {
      if (args[0] === 'abort') holder.__requests += 1;
      return original.apply(this, args);
    };
  });

const requestsSoFar = (page: Page) =>
  page.evaluate(() => (window as unknown as { __requests: number }).__requests);

const openDialog = async (page: Page) => {
  await section(page).getByRole('button', { name: t.dialogOpen }).click();
  await expect(dialog(page)).toBeVisible();
};

test.describe('Combobox: ARIA pattern and keyboard [UI-F4]', () => {
  test.beforeEach(async ({ page }) => {
    await openGallery(page);
  });

  test('the field is a combobox that points at its listbox only while it is open', async ({
    page,
  }) => {
    const input = field(page, t.placeholderLabel);
    await expect(input).toHaveRole('combobox');
    await expect(input).toHaveAttribute('aria-expanded', 'false');
    await expect(input).not.toHaveAttribute('aria-controls', /.*/);
    await expect(input).toHaveAttribute('aria-autocomplete', 'list');
    await input.click();
    await expect(popup(page)).toBeVisible();
    await expect(input).toHaveAttribute('aria-expanded', 'true');
    const listbox = page.getByRole('listbox', { name: t.placeholderLabel });
    await expect(listbox).toBeVisible();
    await expect(input).toHaveAttribute(
      'aria-controls',
      (await listbox.getAttribute('id')) ?? '',
    );
    await expect(input).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(popup(page)).toHaveCount(0);
    await expect(input).toHaveAttribute('aria-expanded', 'false');
    await expect(input).not.toHaveAttribute('aria-controls', /.*/);
  });

  test('ArrowDown opens the list, arrows move aria-activedescendant, disabled options are skipped, Home and End leave the choice alone, focus never leaves the input', async ({
    page,
  }) => {
    const input = field(page, t.placeholderLabel);
    await tabAfter(page, section(page).getByRole('heading', { level: 2 }));
    await expect(input).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(popup(page)).toBeVisible();
    await expect(options(page)).toHaveCount(5);
    const ids = await options(page).evaluateAll((nodes) =>
      nodes.map((node) => node.id),
    );
    expect(new Set(ids).size).toBe(5);

    await expect(input).toHaveAttribute('aria-activedescendant', ids[0] ?? '');
    await expect(options(page).nth(0)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(input).toHaveAttribute('aria-activedescendant', ids[1] ?? '');
    await expect(options(page).nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(options(page).nth(0)).toHaveAttribute(
      'aria-selected',
      'false',
    );
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(input).toHaveAttribute('aria-activedescendant', ids[0] ?? '');

    for (let step = 0; step < 4; step += 1)
      await page.keyboard.press('ArrowDown');
    await expect(input).toHaveAttribute('aria-activedescendant', ids[3] ?? '');
    // Home and End belong to the caret of the editable input.
    await page.keyboard.press('Home');
    await page.keyboard.press('End');
    await expect(input).toHaveAttribute('aria-activedescendant', ids[3] ?? '');
    await expect(input).toBeFocused();
  });

  test('Enter picks the active option, closes the list, keeps focus and never triggers the default form submit', async ({
    page,
  }) => {
    const input = field(page, t.placeholderLabel);
    await input.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(popup(page)).toBeVisible();
    await page.evaluate(() => {
      const holder = window as unknown as { __enter: boolean[] };
      holder.__enter = [];
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') holder.__enter.push(event.defaultPrevented);
      });
    });
    await page.keyboard.press('Enter');
    await expect(popup(page)).toHaveCount(0);
    await expect(input).toHaveValue(people.taras.name);
    await expect(input).toBeFocused();
    expect(
      await page.evaluate(
        () => (window as unknown as { __enter: boolean[] }).__enter,
      ),
    ).toEqual([true]);
  });

  test('Enter on a closed list is not swallowed', async ({ page }) => {
    const input = field(page, t.placeholderLabel);
    await input.focus();
    await page.evaluate(() => {
      const holder = window as unknown as { __enter: boolean[] };
      holder.__enter = [];
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') holder.__enter.push(event.defaultPrevented);
      });
    });
    await page.keyboard.press('Enter');
    expect(
      await page.evaluate(
        () => (window as unknown as { __enter: boolean[] }).__enter,
      ),
    ).toEqual([false]);
    await expect(popup(page)).toHaveCount(0);
  });

  test('Tab closes the list without selecting and moves on', async ({
    page,
  }) => {
    const input = field(page, t.placeholderLabel);
    await input.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(popup(page)).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(popup(page)).toHaveCount(0);
    await expect(input).toHaveValue('');
    await expect(input).not.toBeFocused();
  });

  test('Escape closes the list and restores the selected label; the field keeps focus', async ({
    page,
  }) => {
    const input = field(page, t.selectedLabel);
    await input.click();
    await expect(popup(page)).toBeVisible();
    await input.fill(people.olena.name.slice(0, 3));
    await expect(options(page)).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(popup(page)).toHaveCount(0);
    await expect(input).toHaveValue(people.taras.name);
    await expect(input).toBeFocused();
  });

  test('clicking an option selects it and keeps focus in the input', async ({
    page,
  }) => {
    const input = field(page, t.placeholderLabel);
    await input.click();
    await option(page, people.olena.name).click();
    await expect(popup(page)).toHaveCount(0);
    await expect(input).toHaveValue(people.olena.name);
    await expect(input).toBeFocused();
    await input.click();
    await expect(option(page, people.olena.name)).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(
      option(page, people.olena.name).getByText(c.comboboxSelected),
    ).toHaveCount(1);
  });

  test('the second Escape inside a dialog closes the dialog, the first only the list', async ({
    page,
  }) => {
    await openDialog(page);
    const lead = dialog(page).getByLabel(t.dialogTeamLead, { exact: true });
    await lead.click();
    await expect(popup(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popup(page)).toHaveCount(0);
    await expect(dialog(page)).toBeVisible();
    await expect(lead).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
  });
});

test.describe('Combobox: filtering and values [UI-F4]', () => {
  test.beforeEach(async ({ page }) => {
    await openGallery(page);
  });

  for (const apostrophe of ['ʼ', "'", '’']) {
    test(`the query «Дем${apostrophe}янчук» finds the name written with the Ukrainian apostrophe`, async ({
      page,
    }) => {
      const input = field(page, t.placeholderLabel);
      await input.click();
      await input.fill(`дем${apostrophe}янчук`);
      await expect(options(page)).toHaveCount(1);
      await expect(options(page)).toContainText(people.olena.name);
    });
  }

  test('every word of the query must match the name or the second line', async ({
    page,
  }) => {
    const input = field(page, t.duplicatesLabel);
    await input.click();
    await input.fill('василь');
    await expect(options(page)).toHaveCount(2);
    await expect(options(page).nth(0)).toContainText(people.vasylGambling.line);
    await expect(options(page).nth(1)).toContainText(people.vasylCrypto.line);
    await input.fill('василь крипто');
    await expect(options(page)).toHaveCount(1);
    await expect(options(page)).toContainText(people.vasylCrypto.line);
    await expect(input).toHaveAttribute(
      'aria-activedescendant',
      (await options(page).first().getAttribute('id')) ?? '',
    );
  });

  test('duplicate names are told apart by the second line', async ({
    page,
  }) => {
    await field(page, t.duplicatesLabel).click();
    const same = options(page).filter({ hasText: people.vasylGambling.name });
    await expect(same).toHaveCount(2);
    await expect(same.nth(0)).toContainText(people.vasylGambling.line);
    await expect(same.nth(1)).toContainText(people.vasylCrypto.line);
  });

  test('nothing matching shows «Нічого не знайдено»; an empty list shows its own copy', async ({
    page,
  }) => {
    const input = field(page, t.duplicatesLabel);
    await input.click();
    await input.fill('яяяя');
    await expect(options(page)).toHaveCount(0);
    await expect(popup(page).getByRole('status')).toHaveText(c.comboboxEmpty);
    await page.keyboard.press('Escape');
    await field(page, t.emptyLabel).click();
    await expect(popup(page).getByRole('status')).toHaveText(t.emptyText);
  });

  test('a selected value that is not among the options shows «Недоступно» and never a blank', async ({
    page,
  }) => {
    const input = field(page, t.staleLabel);
    await expect(input).toHaveValue('');
    await expect(input).toHaveAttribute('placeholder', c.unavailable);
  });

  test('an inactive person is selected, shown with the «неактивний» badge and cannot be picked', async ({
    page,
  }) => {
    const input = field(page, t.inactiveLabel);
    await expect(input).toHaveValue(people.yaroslav.name);
    await input.click();
    const inactive = option(page, people.yaroslav.name);
    await expect(inactive).toHaveAttribute('aria-disabled', 'true');
    await expect(inactive.getByText(c.inactive, { exact: true })).toBeVisible();
    await expect(inactive).toContainText(people.yaroslav.line);
    await option(page, people.olena.name).click();
    await expect(input).toHaveValue(people.olena.name);
    await input.click();
    await inactive.click({ force: true });
    await expect(input).toHaveValue(people.olena.name);
    await expect(popup(page)).toBeVisible();
  });

  test('arrow keys skip the inactive option', async ({ page }) => {
    const input = field(page, t.duplicatesLabel);
    await input.focus();
    for (let step = 0; step < 5; step += 1)
      await page.keyboard.press('ArrowDown');
    const last = await activeOptionId(input);
    await expect(page.locator(`[id="${last}"]`)).not.toContainText(
      people.yaroslav.name,
    );
  });

  test('the clear button is labelled, empties the value and returns focus to the input', async ({
    page,
  }) => {
    const input = field(page, t.selectedLabel);
    const clear = section(page).getByRole('button', {
      name: c.comboboxClear,
    });
    await expect(clear).toHaveCount(2);
    await input.focus();
    const own = input.locator('xpath=following-sibling::button');
    await expect(own).toHaveAccessibleName(c.comboboxClear);
    await own.click();
    await expect(input).toHaveValue('');
    await expect(own).toHaveCount(0);
    await expect(input).toBeFocused();
    await expect(popup(page)).toHaveCount(0);
  });

  test('the clear button works from the keyboard and closes an open list on focus', async ({
    page,
  }) => {
    const input = field(page, t.selectedLabel);
    await input.focus();
    await page.keyboard.press('ArrowDown');
    await expect(popup(page)).toBeVisible();
    await page.keyboard.press('Tab');
    const own = input.locator('xpath=following-sibling::button');
    await expect(own).toBeFocused();
    await expect(popup(page)).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(input).toHaveValue('');
    await expect(input).toBeFocused();
  });

  test('selecting an option closes the list and clearing keeps the typed query out of the value', async ({
    page,
  }) => {
    const input = field(page, t.placeholderLabel);
    await input.click();
    await input.fill('тар');
    await expect(options(page)).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(input).toHaveValue(people.taras.name);
    await section(page)
      .getByRole('button', { name: c.comboboxClear })
      .first()
      .click();
    await expect(input).toHaveValue('');
  });
});

test.describe('Combobox: async mode [UI-F4]', () => {
  test('a request that never finishes shows the loading row and no options', async ({
    page,
  }) => {
    await openGallery(page);
    await field(page, t.loadingLabel).click();
    await expect(popup(page).getByRole('status')).toHaveText(c.comboboxLoading);
    await expect(options(page)).toHaveCount(0);
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(popup(page)).toHaveCount(0);
  });

  test('typed text triggers one request after the debounce, not one per keystroke', async ({
    page,
  }) => {
    await countAbortListeners(page);
    await openGallery(page);
    const input = field(page, t.searchLabel);
    await input.click();
    await expect(options(page)).toHaveCount(5);
    const before = await requestsSoFar(page);
    await typeInOneTask(input, 'тарас');
    await expect(popup(page).getByRole('status')).toHaveText(c.comboboxLoading);
    await expect(options(page)).toHaveCount(1);
    await expect(options(page)).toContainText(people.taras.name);
    expect((await requestsSoFar(page)) - before).toBe(1);
  });

  test('typing replaces the options with the loading row and then the results', async ({
    page,
  }) => {
    await openGallery(page);
    const input = field(page, t.searchLabel);
    await input.click();
    await expect(options(page)).toHaveCount(5);
    await input.pressSequentially('олена');
    await expect(options(page)).toHaveCount(1);
    await expect(options(page)).toContainText(people.olena.name);
    await expect(popup(page).getByRole('status')).toHaveCount(0);
    await option(page, people.olena.name).click();
    await expect(input).toHaveValue(people.olena.name);
  });

  test('an empty server answer shows the empty copy', async ({ page }) => {
    await openGallery(page);
    const input = field(page, t.searchLabel);
    await input.click();
    await expect(options(page)).toHaveCount(5);
    await input.fill('яяяя');
    await expect(popup(page).getByRole('status')).toHaveText(c.comboboxEmpty);
  });

  test('a failed request shows an alert; «Спробувати ще раз» reloads without moving focus', async ({
    page,
  }) => {
    await openGallery(page);
    const input = field(page, t.errorLabel);
    await input.click();
    const alert = popup(page).getByRole('alert');
    await expect(alert).toContainText(c.comboboxFailed);
    const retry = alert.getByRole('button', { name: c.retry });
    await retry.click();
    await expect(options(page)).toHaveCount(5);
    await expect(alert).toHaveCount(0);
    await expect(input).toBeFocused();
  });

  test('the picked option stays in the field while the results are replaced by a new query and after Escape', async ({
    page,
  }) => {
    await openGallery(page);
    const input = field(page, t.searchLabel);
    await input.click();
    await expect(options(page)).toHaveCount(5);
    await option(page, people.taras.name).click();
    await expect(input).toHaveValue(people.taras.name);
    await input.click();
    await input.fill('олена');
    await expect(options(page)).toHaveCount(1);
    await expect(options(page)).toContainText(people.olena.name);
    await page.keyboard.press('Escape');
    await expect(popup(page)).toHaveCount(0);
    await expect(input).toHaveValue(people.taras.name);
  });
});

test.describe('Combobox: layers and layout [UI-F4]', () => {
  test.beforeEach(async ({ page }) => {
    await openGallery(page);
  });

  test('inside a dialog the list is above it, not clipped and its options can be clicked', async ({
    page,
  }) => {
    await openDialog(page);
    const lead = dialog(page).getByLabel(t.dialogTeamLead, { exact: true });
    await lead.click();
    await expect(popup(page)).toBeVisible();
    const topmost = await popup(page).evaluate((node) => {
      const box = node.getBoundingClientRect();
      const hit = document.elementFromPoint(
        box.x + box.width / 2,
        box.y + box.height / 2,
      );
      return hit !== null && node.contains(hit);
    });
    expect(topmost).toBe(true);
    await option(page, people.olena.name).click();
    await expect(lead).toHaveValue(people.olena.name);
    await expect(dialog(page)).toBeVisible();
    await expect(lead).toBeFocused();
  });

  test('inside a dialog on a short viewport the list keeps 8 px from every window edge', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 420 });
    await openDialog(page);
    await dialog(page).getByLabel(t.dialogTeamLead, { exact: true }).click();
    await expect(popup(page)).toBeVisible();
    const box = await popup(page).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(8 - 0.5);
    expect(box!.y + box!.height).toBeLessThanOrEqual(420 - 8 + 0.5);
  });

  test('a long label is cut with an ellipsis in the field, kept in title and wrapped to two lines in the list', async ({
    page,
  }) => {
    const input = field(page, t.longLabel);
    await expect(input).toHaveValue(t.longOption);
    await expect(input).toHaveAttribute('title', t.longOption);
    const style = await input.evaluate((node) => {
      const control = node as HTMLInputElement;
      const computed = getComputedStyle(control);
      return {
        clipped: control.scrollWidth > control.clientWidth,
        overflow: computed.textOverflow,
        wrap: computed.whiteSpace,
      };
    });
    expect(style).toEqual({
      clipped: true,
      overflow: 'ellipsis',
      wrap: 'nowrap',
    });
    await input.click();
    const long = option(page, t.longOption.slice(0, 20));
    await expect(long).toBeVisible();
    const text = await long.evaluate((node) => {
      const label = node.querySelector('span.line-clamp-2') as HTMLElement;
      const lineHeight = parseFloat(getComputedStyle(label).lineHeight);
      return {
        lines: Math.round(label.getBoundingClientRect().height / lineHeight),
        clamped: label.scrollHeight > label.clientHeight,
        clamp: getComputedStyle(label).webkitLineClamp,
      };
    });
    expect(text).toEqual({ lines: 2, clamped: true, clamp: '2' });
  });

  test('typing never animates or transitions the list height', async ({
    page,
  }) => {
    const input = field(page, t.duplicatesLabel);
    await input.focus();
    await page.keyboard.press('ArrowDown');
    await expect(options(page)).toHaveCount(5);
    const motion = await popup(page).evaluate((node) => {
      const list = node.querySelector('[role="listbox"]') as HTMLElement;
      return [node, list].map((element) => {
        const style = getComputedStyle(element);
        return {
          transition: style.transitionProperty,
          duration: style.transitionDuration,
          animation: style.animationName,
        };
      });
    });
    for (const element of motion) {
      expect(element.animation).toBe('none');
      expect(
        element.duration.split(', ').every((value) => value === '0s'),
      ).toBe(true);
    }
    await page.evaluate(() => {
      const seen: string[] = [];
      (window as unknown as { __seen: string[] }).__seen = seen;
      for (const type of ['transitionrun', 'animationstart'])
        document.addEventListener(type, (event) => {
          const target = event.target as HTMLElement;
          if (target.closest('[data-slot="combobox-content"]'))
            seen.push(
              `${type}:${target.getAttribute('role') ?? target.tagName}`,
            );
        });
    });
    const heights: number[] = [];
    for (const query of ['в', 'ва', 'вас', 'васи', 'ва', 'в', '']) {
      await input.fill(query);
      heights.push((await popup(page).boundingBox())?.height ?? 0);
    }
    await expect(options(page)).toHaveCount(5);
    expect(heights.some((height) => height > 0)).toBe(true);
    expect(
      await page.evaluate(
        () => (window as unknown as { __seen: string[] }).__seen,
      ),
    ).toEqual([]);
  });

  test('the list is at least as wide as 224 px and never wider than the window minus 16 px', async ({
    page,
  }) => {
    await field(page, t.duplicatesLabel).click();
    const box = await popup(page).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(224 - 0.5);
    expect(box!.width).toBeLessThanOrEqual(1440 - 16);
  });
});

test.describe('Combobox: motion [UI-F4]', () => {
  test('a pointer open animates from the field; a keyboard open has no animation and carries data-instant', async ({
    page,
  }) => {
    await openGallery(page);
    await page.addStyleTag({ content: ':root { --duration-popover: 10s; }' });
    const input = field(page, t.duplicatesLabel);
    await input.click();
    await expect(popup(page)).toBeVisible();
    expect(await animationName(popup(page))).toBe('motion-pop-in');
    await expect(popup(page)).not.toHaveAttribute('data-instant', /.*/);
    await page.keyboard.press('Escape');
    await expect(popup(page)).toHaveCount(0);
    await expect(input).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(popup(page)).toBeVisible();
    expect(await animationName(popup(page))).toBe('none');
    await expect(popup(page)).toHaveAttribute('data-instant', '');
  });

  test('typing into a closed field opens the list without animation', async ({
    page,
  }) => {
    await openGallery(page);
    await page.addStyleTag({ content: ':root { --duration-popover: 10s; }' });
    const input = field(page, t.duplicatesLabel);
    await input.focus();
    await input.pressSequentially('т');
    await expect(popup(page)).toBeVisible();
    expect(await animationName(popup(page))).toBe('none');
  });

  test('the open-from-keyboard helper shows the list without animation', async ({
    page,
  }) => {
    await openGallery(page);
    await page.addStyleTag({ content: ':root { --duration-popover: 10s; }' });
    await section(page).getByRole('button', { name: t.openButton }).click();
    await expect(popup(page)).toBeVisible();
    expect(await animationName(popup(page))).toBe('none');
  });

  test('a pointer open scales the list from below 1 with normal motion', async ({
    page,
  }) => {
    await openGallery(page);
    await page.addStyleTag({ content: ':root { --duration-popover: 10s; }' });
    await field(page, t.duplicatesLabel).click();
    await expect(popup(page)).toBeVisible();
    const scale = await popup(page).evaluate((node) =>
      parseFloat(getComputedStyle(node).scale),
    );
    expect(scale).toBeLessThan(1);
    expect(scale).toBeGreaterThan(0.9);
  });

  test.describe('with prefers-reduced-motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('the pointer open fades only: opacity runs, scale stays at 1', async ({
      page,
    }) => {
      await openGallery(page);
      await page.addStyleTag({ content: ':root { --duration-popover: 10s; }' });
      await field(page, t.duplicatesLabel).click();
      await expect(popup(page)).toBeVisible();
      const style = await popup(page).evaluate((node) => {
        const computed = getComputedStyle(node);
        return {
          name: computed.animationName,
          scale: computed.scale,
          opacity: parseFloat(computed.opacity),
        };
      });
      expect(style.name).toBe('motion-pop-in');
      expect(['1', 'none']).toContain(style.scale);
      expect(style.opacity).toBeLessThan(1);
    });
  });
});

test.describe('Combobox: failed popup chunk [UI-F4]', () => {
  test('without the popup chunk the field becomes a native select, keeps focus and still picks a value', async ({
    page,
  }) => {
    await page.route(/combobox-popup/, (route) => route.abort());
    await openGallery(page);
    const input = field(page, t.duplicatesLabel);
    await input.focus();
    const native = section(page).locator('select#combobox-demo-duplicates');
    await expect(native).toBeVisible();
    await expect(native).toBeFocused();
    await native.selectOption({ label: people.taras.name });
    await expect(native).toHaveValue('taras');
    await expect(native).toBeFocused();
    await expect(page.getByRole('listbox')).toHaveCount(0);
  });
});

test.describe('Combobox: accessibility [UI-F4]', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`axe is clean with the fields closed (${theme})`, async ({
      page,
    }, testInfo) => {
      await openGallery(page, theme);
      await checkAccessibility(page, testInfo);
    });

    test(`axe is clean with the list open on people with avatars and the inactive badge (${theme})`, async ({
      page,
    }, testInfo) => {
      await openGallery(page, theme);
      await field(page, t.inactiveLabel).click();
      await expect(popup(page)).toBeVisible();
      await checkAccessibility(page, testInfo);
    });

    test(`axe is clean with the loading and the error rows open (${theme})`, async ({
      page,
    }, testInfo) => {
      await openGallery(page, theme);
      await field(page, t.errorLabel).click();
      await expect(popup(page).getByRole('alert')).toBeVisible();
      await checkAccessibility(page, testInfo);
    });

    test(`axe is clean with the list open inside a dialog (${theme})`, async ({
      page,
    }, testInfo) => {
      await openGallery(page, theme);
      await openDialog(page);
      await dialog(page).getByLabel(t.dialogTeamLead, { exact: true }).click();
      await expect(popup(page)).toBeVisible();
      await checkAccessibility(page, testInfo);
    });
  }
});
