import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { serverTextLength } from '../../lib/text-length';
import { gallerySection, openGallery, settleFrames } from '../support/dev-ui';

const t = messages.devUi.form;
const f = messages.form;

const section = (page: Page) => gallerySection(page, t.title);
const form = (page: Page) => section(page).locator('form');
const title = (page: Page) => form(page).locator('#form-rhf-title');
const reason = (page: Page) => form(page).locator('#form-rhf-reason');
const consent = (page: Page) => form(page).locator('#form-rhf-consent');
const priority = (page: Page) => form(page).locator('#form-rhf-priority');
const submit = (page: Page) =>
  form(page).getByRole('button', { name: t.submit, exact: true });
const summary = (page: Page) => form(page).getByRole('alert');
const counterLabel = (page: Page, id: string) =>
  page.locator(`#${id}-counter [aria-hidden="true"]`);
const reasonSample = t.reasonSample;

const plural = (count: 1 | 2 | 3) =>
  count === 1 ? `Виправте ${count} поле` : `Виправте ${count} поля`;

const describedByIds = (control: Locator) =>
  control.evaluate((node) =>
    (node.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean),
  );

const idsExist = (page: Page, ids: string[]) =>
  page.evaluate(
    (list) => list.map((id) => document.getElementById(id) !== null),
    ids,
  );

/** The focus ring's outline-color fade is not part of the value or state change under test. */
const collectTransitions = (page: Page) =>
  page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __seen: string[] }).__seen = seen;
    document.addEventListener('transitionrun', (event) => {
      if (event.propertyName === 'outline-color') return;
      const target = event.target as HTMLElement;
      seen.push(
        `${target.getAttribute('data-slot') ?? target.tagName}:${event.propertyName}`,
      );
    });
  });

const transitionsSeen = (page: Page) =>
  page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);

test.describe('Form kit: submit summary and focus [UI-F5]', () => {
  test.beforeEach(async ({ page }) => {
    await openGallery(page);
  });

  test('an empty submit shows one alert with the invalid count and focuses the first invalid field', async ({
    page,
  }) => {
    await expect(summary(page)).toHaveCount(0);
    await submit(page).click();
    await expect(summary(page)).toHaveCount(1);
    await expect(summary(page)).toHaveText(plural(3));
    await expect(title(page)).toBeFocused();
    await expect(title(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(reason(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(consent(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(priority(page)).not.toHaveAttribute('aria-invalid', /.*/);
  });

  test('fixing fields and resubmitting moves focus to the next invalid field and finally sends the form', async ({
    page,
  }) => {
    await submit(page).click();
    await expect(summary(page)).toHaveText(plural(3));

    await title(page).fill('Медіабаєр');
    await expect(summary(page)).toHaveText(plural(3));
    await submit(page).click();
    await expect(summary(page)).toHaveText(plural(2));
    await expect(reason(page)).toBeFocused();

    await reason(page).fill(reasonSample);
    await submit(page).click();
    await expect(summary(page)).toHaveText(plural(1));
    await expect(consent(page)).toBeFocused();

    await consent(page).press('Space');
    await expect(consent(page)).toHaveAttribute('aria-checked', 'true');
    await submit(page).click();
    await expect(summary(page)).toHaveCount(0);
    await expect(form(page).getByRole('status')).toHaveText(t.sent);
  });

  test('a second failed submit with the same count re-announces: the alert node is replaced', async ({
    page,
  }) => {
    await submit(page).click();
    await expect(summary(page)).toHaveText(plural(3));
    await summary(page).evaluate((node) => {
      node.setAttribute('data-first', '');
    });
    await submit(page).click();
    await expect(summary(page)).toHaveCount(1);
    await expect(summary(page)).toHaveText(plural(3));
    await expect(summary(page)).not.toHaveAttribute('data-first', /.*/);
  });

  test('a failed submit after a successful one hides the success message', async ({
    page,
  }) => {
    await title(page).fill('Медіабаєр');
    await reason(page).fill(reasonSample);
    await consent(page).press('Space');
    await submit(page).click();
    await expect(form(page).getByRole('status')).toHaveText(t.sent);
    await title(page).fill('');
    await submit(page).click();
    await expect(summary(page)).toHaveText(plural(1));
    await expect(form(page).getByRole('status')).toHaveText('');
  });
});

test.describe('Form kit: field wiring [UI-F5]', () => {
  test.beforeEach(async ({ page }) => {
    await openGallery(page);
  });

  test('before blur a field is valid and has only its hint as description; after blur the polite region holds the error', async ({
    page,
  }) => {
    const live = page
      .locator('#form-rhf-title')
      .locator('xpath=ancestor::*[@data-slot="form-field"]//*[@aria-live]');
    await expect(live).toHaveAttribute('aria-live', 'polite');
    await expect(live).toBeEmpty();
    await expect(title(page)).not.toHaveAttribute('aria-invalid', /.*/);
    expect(await describedByIds(title(page))).toEqual(['form-rhf-title-hint']);

    await title(page).focus();
    await page.keyboard.press('Tab');
    await expect(live).toContainText(t.titleShort);
    await expect(title(page)).toHaveAttribute('aria-invalid', 'true');
    const ids = await describedByIds(title(page));
    expect(ids).toEqual(['form-rhf-title-error', 'form-rhf-title-hint']);
    expect(await idsExist(page, ids)).toEqual([true, true]);
    await expect(title(page)).toHaveAccessibleDescription(
      `${t.titleShort} ${t.titleHint}`,
    );
    await expect(live.locator('#form-rhf-title-error')).toHaveText(
      t.titleShort,
    );
  });

  test('fixing the value removes the error and aria-invalid and leaves the hint', async ({
    page,
  }) => {
    await title(page).focus();
    await page.keyboard.press('Tab');
    await expect(title(page)).toHaveAttribute('aria-invalid', 'true');
    await title(page).fill('Ab');
    await expect(title(page)).not.toHaveAttribute('aria-invalid', /.*/);
    await expect(page.locator('#form-rhf-title-error')).toHaveCount(0);
    expect(await describedByIds(title(page))).toEqual(['form-rhf-title-hint']);
  });

  test('error comes before counter in aria-describedby and every id resolves', async ({
    page,
  }) => {
    expect(await describedByIds(reason(page))).toEqual([
      'form-rhf-reason-counter',
    ]);
    await reason(page).focus();
    await page.keyboard.press('Tab');
    await expect(reason(page)).toHaveAttribute('aria-invalid', 'true');
    const ids = await describedByIds(reason(page));
    expect(ids).toEqual(['form-rhf-reason-error', 'form-rhf-reason-counter']);
    expect(await idsExist(page, ids)).toEqual([true, true]);
  });

  test('static samples: hint then counter, error then counter, error alone', async ({
    page,
  }) => {
    expect(await describedByIds(page.locator('#form-demo-title'))).toEqual([
      'form-demo-title-hint',
    ]);
    expect(
      await describedByIds(page.locator('#form-demo-title-invalid')),
    ).toEqual(['form-demo-title-invalid-error']);
    expect(await describedByIds(page.locator('#form-demo-reason'))).toEqual([
      'form-demo-reason-hint',
      'form-demo-reason-counter',
    ]);
    expect(
      await describedByIds(page.locator('#form-demo-reason-over')),
    ).toEqual(['form-demo-reason-over-error', 'form-demo-reason-over-counter']);
    for (const id of [
      'form-demo-title-invalid',
      'form-demo-reason-over',
      'form-demo-consent',
    ])
      await expect(page.locator(`#${id}`)).toHaveAttribute(
        'aria-invalid',
        'true',
      );
  });

  test('the counter is read as one description sentence, not the visual 120/500', async ({
    page,
  }) => {
    const count = serverTextLength(reasonSample);
    await expect(page.locator('#form-demo-reason')).toHaveAccessibleDescription(
      `${t.reasonHint} Символів: ${count} із 500`,
    );
    const counter = page.locator('#form-demo-reason-counter');
    await expect(counter.locator('[aria-hidden="true"]')).toHaveText(
      `${count}/500`,
    );
    await expect(counter.locator('.sr-only')).toHaveText(
      `Символів: ${count} із 500`,
    );
  });

  test('group layouts are named by their label through aria-labelledby', async ({
    page,
  }) => {
    await expect(
      form(page).getByRole('radiogroup', { name: t.priorityLabel }),
    ).toBeVisible();
    await expect(
      page.getByRole('radiogroup', { name: t.channelLabel }),
    ).toBeVisible();
  });
});

test.describe('Form kit: required mark [UI-F5]', () => {
  test.beforeEach(async ({ page }) => {
    await openGallery(page);
  });

  test('the visible asterisk is hidden from assistive tech and the spoken word is in the accessible name', async ({
    page,
  }) => {
    const label = form(page).locator('label[for="form-rhf-title"]');
    await expect(label.locator('[aria-hidden="true"]')).toHaveText(
      f.requiredMark,
    );
    await expect(label.locator('[aria-hidden="true"]')).toBeVisible();
    await expect(label.locator('.sr-only')).toHaveText(f.required);
    await expect(title(page)).toHaveAccessibleName(
      `${t.titleLabel} ${f.required}`,
    );
    await expect(title(page)).toHaveAttribute('aria-required', 'true');
    await expect(
      form(page).getByRole('textbox', { name: /обовʼязкове/ }),
    ).toHaveCount(2);
  });

  test('a required checkbox carries the same spoken word; an optional field does not', async ({
    page,
  }) => {
    await expect(consent(page)).toHaveAccessibleName(
      `${t.consentLabel} ${f.required}`,
    );
    await expect(consent(page)).toHaveAttribute('aria-required', 'true');
    await expect(page.locator('#form-demo-reason')).toHaveAccessibleName(
      t.reasonLabel,
    );
    await expect(page.locator('#form-demo-reason')).not.toHaveAttribute(
      'aria-required',
      /.*/,
    );
  });
});

test.describe('Form kit: counter and textarea [UI-F5]', () => {
  test.beforeEach(async ({ page }) => {
    await openGallery(page);
  });

  const cases: { name: string; value: string; expected: number }[] = [
    { name: 'plain letters', value: 'abc', expected: 3 },
    { name: 'a surrogate-pair emoji is one', value: '😀😀', expected: 2 },
    {
      name: 'a family emoji is five code points, not one grapheme',
      value: '👨‍👩‍👧',
      expected: 5,
    },
    {
      name: 'a decomposed letter is one after NFC',
      value: 'йé',
      expected: 2,
    },
    {
      name: 'runs of whitespace collapse and the ends are trimmed',
      value: '  a   b \n\n c  ',
      expected: 5,
    },
    { name: 'empty', value: '', expected: 0 },
  ];

  for (const { name, value, expected } of cases) {
    test(`counter: ${name}`, async ({ page }) => {
      await reason(page).fill(value);
      await expect(counterLabel(page, 'form-rhf-reason')).toHaveText(
        `${expected}/500`,
      );
      expect(serverTextLength(value)).toBe(expected);
    });
  }

  test('over the limit the counter turns to the error colour, the field keeps accepting text and has no maxlength', async ({
    page,
  }) => {
    const counter = page.locator('#form-rhf-reason-counter');
    const colour = (node: Locator) =>
      node.evaluate((element) => getComputedStyle(element).color);
    await reason(page).fill('a'.repeat(500));
    await expect(counterLabel(page, 'form-rhf-reason')).toHaveText('500/500');
    await expect(counter).not.toHaveAttribute('data-over', /.*/);
    const normal = await colour(counter);
    await expect(reason(page)).not.toHaveAttribute('maxlength', /.*/);

    await reason(page).pressSequentially('bcd');
    await expect(counterLabel(page, 'form-rhf-reason')).toHaveText('503/500');
    await expect(counter).toHaveAttribute('data-over', '');
    await expect(counter.locator('.sr-only')).toHaveText(
      'Символів: 503 із 500, ліміт перевищено',
    );
    expect(await reason(page).inputValue()).toHaveLength(503);
    const over = await colour(counter);
    expect(over).not.toBe(normal);
    expect(over).toBe(
      await colour(page.locator('#form-demo-reason-over-error')),
    );

    await reason(page).fill('a'.repeat(500));
    await expect(counter).not.toHaveAttribute('data-over', /.*/);
  });

  test('the over-limit sample is already in the error state and its counter matches the server length', async ({
    page,
  }) => {
    const count = serverTextLength(reasonSample);
    await expect(counterLabel(page, 'form-demo-reason-over')).toHaveText(
      `${count}/40`,
    );
    await expect(
      page.locator('#form-demo-reason-over-counter'),
    ).toHaveAttribute('data-over', '');
  });

  test('the textarea is 3 rows at least, grows with content and shrinks back', async ({
    page,
  }) => {
    const metrics = () =>
      reason(page).evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          height: node.getBoundingClientRect().height,
          line: parseFloat(style.lineHeight),
          supported: CSS.supports('field-sizing', 'content'),
          maxHeight: parseFloat(style.maxHeight),
        };
      });
    const empty = await metrics();
    expect(empty.supported).toBe(true);
    expect(empty.height).toBeCloseTo(3 * empty.line + 26, 0);

    await reason(page).fill(
      Array.from({ length: 8 }, () => 'рядок').join('\n'),
    );
    const grown = await metrics();
    expect(grown.height).toBeGreaterThan(empty.height + 3 * empty.line);

    await reason(page).fill(
      Array.from({ length: 60 }, () => 'рядок').join('\n'),
    );
    const capped = await metrics();
    expect(capped.height).toBeCloseTo(capped.maxHeight, 0);
    expect(
      await reason(page).evaluate(
        (node) => node.scrollHeight > node.clientHeight,
      ),
    ).toBe(true);

    await reason(page).fill('один');
    expect((await metrics()).height).toBeCloseTo(empty.height, 0);
  });
});

test.describe('Form kit: segmented control, checkbox, radio group [UI-F5]', () => {
  test.beforeEach(async ({ page }) => {
    await openGallery(page);
  });

  const segment = (page: Page, name: string) =>
    form(page).getByRole('radio', { name, exact: true });

  test('Tab enters on the checked item, arrows move and select with wrap, Tab leaves the group', async ({
    page,
  }) => {
    await reason(page).focus();
    await page.keyboard.press('Tab');
    await expect(segment(page, t.priorityNormal)).toBeFocused();
    await expect(segment(page, t.priorityNormal)).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await page.keyboard.press('ArrowRight', { delay: 50 });
    await expect(segment(page, t.priorityUrgent)).toBeFocused();
    await expect(segment(page, t.priorityUrgent)).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(segment(page, t.priorityNormal)).toHaveAttribute(
      'aria-checked',
      'false',
    );

    await page.keyboard.press('ArrowRight', { delay: 50 });
    await expect(segment(page, t.priorityNormal)).toBeFocused();
    await expect(segment(page, t.priorityNormal)).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await page.keyboard.press('ArrowLeft', { delay: 50 });
    await expect(segment(page, t.priorityUrgent)).toBeFocused();
    await expect(segment(page, t.priorityUrgent)).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await page.keyboard.press('Tab');
    await expect(consent(page)).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(segment(page, t.priorityUrgent)).toBeFocused();
  });

  test('Space selects a focused unchecked item and the group always keeps exactly one value', async ({
    page,
  }) => {
    await segment(page, t.priorityUrgent).focus();
    await expect(segment(page, t.priorityUrgent)).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await page.keyboard.press('Space');
    await expect(segment(page, t.priorityUrgent)).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.keyboard.press('Space');
    await segment(page, t.priorityUrgent).click();
    await expect(
      form(page).locator(
        '#form-rhf-priority [role="radio"][aria-checked="true"]',
      ),
    ).toHaveCount(1);
    await segment(page, t.priorityNormal).click();
    await segment(page, t.priorityNormal).click();
    await expect(segment(page, t.priorityNormal)).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(
      form(page).locator(
        '#form-rhf-priority [role="radio"][aria-checked="true"]',
      ),
    ).toHaveCount(1);
  });

  test('the selected segment survives a failed submit (value is held by the form)', async ({
    page,
  }) => {
    await segment(page, t.priorityUrgent).click();
    await submit(page).click();
    await expect(summary(page)).toBeVisible();
    await expect(segment(page, t.priorityUrgent)).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('Space toggles the checkbox on and off', async ({ page }) => {
    await consent(page).focus();
    await expect(consent(page)).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('Space');
    await expect(consent(page)).toHaveAttribute('aria-checked', 'true');
    await expect(consent(page)).toHaveAttribute('data-state', 'checked');
    await page.keyboard.press('Space');
    await expect(consent(page)).toHaveAttribute('aria-checked', 'false');
  });

  test('clicking the checkbox label toggles it; the error disappears once valid', async ({
    page,
  }) => {
    await submit(page).click();
    await expect(consent(page)).toHaveAttribute('aria-invalid', 'true');
    await form(page).locator('label[for="form-rhf-consent"]').click();
    await expect(consent(page)).toHaveAttribute('aria-checked', 'true');
    await expect(consent(page)).not.toHaveAttribute('aria-invalid', /.*/);
    await expect(page.locator('#form-rhf-consent-error')).toHaveCount(0);
  });

  test('the radio group: Tab enters on the checked item, arrows select with wrap', async ({
    page,
  }) => {
    const radio = (name: string) =>
      page
        .getByRole('radiogroup', { name: t.channelLabel })
        .getByRole('radio', { name, exact: true });
    await page
      .locator('#form-demo-priority [role="radio"][aria-checked="true"]')
      .focus();
    await page.keyboard.press('Tab');
    await expect(radio(t.channelEmail)).toBeFocused();
    await page.keyboard.press('ArrowDown', { delay: 50 });
    await expect(radio(t.channelPhone)).toBeFocused();
    await expect(radio(t.channelPhone)).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowDown', { delay: 50 });
    await expect(radio(t.channelMessenger)).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.keyboard.press('ArrowDown', { delay: 50 });
    await expect(radio(t.channelEmail)).toBeFocused();
    await expect(radio(t.channelEmail)).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowUp', { delay: 50 });
    await expect(radio(t.channelMessenger)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(radio(t.channelMessenger)).not.toBeFocused();
    await expect(
      page
        .getByRole('radiogroup', { name: t.channelLabel })
        .locator('[role="radio"][aria-checked="true"]'),
    ).toHaveCount(1);
  });

  test('clicking a radio label selects it', async ({ page }) => {
    await page.getByText(t.channelPhone, { exact: true }).click();
    await expect(
      page.getByRole('radio', { name: t.channelPhone, exact: true }),
    ).toHaveAttribute('aria-checked', 'true');
  });
});

test.describe('Form kit: motion [UI-F5]', () => {
  test.beforeEach(async ({ page }) => {
    await openGallery(page);
  });

  test('typing in a textarea starts no transition at all', async ({ page }) => {
    await collectTransitions(page);
    await reason(page).click();
    await reason(page).pressSequentially(
      'Кандидатів достатньо\nрядок\nрядок\nрядок',
    );
    await reason(page).fill('a'.repeat(510));
    await settleFrames(page);
    expect(await transitionsSeen(page)).toEqual([]);
  });

  test('keyboard selection in the segmented control, radio group and checkbox starts no transition', async ({
    page,
  }) => {
    await collectTransitions(page);
    await page
      .locator('#form-demo-priority [role="radio"][aria-checked="true"]')
      .focus();
    await page.keyboard.press('ArrowRight', { delay: 50 });
    await page.keyboard.press('ArrowLeft', { delay: 50 });
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowDown', { delay: 50 });
    await consent(page).focus();
    await page.keyboard.press('Space');
    await settleFrames(page);
    expect(await transitionsSeen(page)).toEqual([]);
  });

  test('a validation error appearing after blur starts no transition', async ({
    page,
  }) => {
    await collectTransitions(page);
    await title(page).focus();
    await page.keyboard.press('Tab');
    await expect(title(page)).toHaveAttribute('aria-invalid', 'true');
    await settleFrames(page);
    expect(await transitionsSeen(page)).toEqual([]);
  });

  test('no control transitions a layout or transform property, with and without reduced motion', async ({
    page,
  }) => {
    for (const reducedMotion of ['no-preference', 'reduce'] as const) {
      await page.emulateMedia({ reducedMotion });
      const properties = await section(page).evaluate((node) => {
        const selector =
          '[data-slot="textarea"], [data-slot="checkbox"], [data-slot="radio-group-item"], [data-slot="segmented-control"], [data-slot="segmented-control"] [role="radio"], [data-slot="counter"], input';
        return [...node.querySelectorAll(selector)].flatMap((element) => {
          const style = getComputedStyle(element);
          const durations = style.transitionDuration.split(', ');
          return style.transitionProperty
            .split(', ')
            .filter(
              (property, index) =>
                durations[index % durations.length] !== '0s' &&
                /all|height|width|transform|margin|padding|top|left|translate|scale/.test(
                  property,
                ),
            );
        });
      });
      expect(properties).toEqual([]);
    }
  });
});

test.describe('Form kit: accessibility [UI-F5]', () => {
  const checkForm = async (page: Page) => {
    await page.evaluate(() => document.fonts.ready);
    await settleFrames(page);
    const result = await new AxeBuilder({ page })
      .include('main section[aria-labelledby="form"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      result.violations.map(({ id, nodes }) => ({
        id,
        nodes: nodes.map((node) => node.target),
      })),
    ).toEqual([]);
  };

  for (const theme of ['light', 'dark'] as const) {
    test(`axe is clean for the form section at rest (${theme})`, async ({
      page,
    }) => {
      await openGallery(page, theme);
      await checkForm(page);
    });

    test(`axe is clean after a failed submit with errors shown (${theme})`, async ({
      page,
    }) => {
      await openGallery(page, theme);
      await submit(page).click();
      await expect(summary(page)).toHaveText(plural(3));
      await expect(title(page)).toBeFocused();
      await checkForm(page);
    });

    test(`axe is clean with the segmented control on the second value and fields filled (${theme})`, async ({
      page,
    }) => {
      await openGallery(page, theme);
      await form(page).getByRole('radio', { name: t.priorityUrgent }).click();
      await consent(page).press('Space');
      await reason(page).fill('a'.repeat(520));
      await checkForm(page);
    });
  }
});
