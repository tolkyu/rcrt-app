import { expect, test } from '@playwright/test';
import { DEMO_VERTICALS } from '../../server/db/seed';
import type { VacancyDetail } from '../../lib/schemas/vacancy';
import { sessionFile } from '../support/e2e-session';
import { problemFulfill } from '../support/problem';
import { chooseOption, expectOptions } from '../support/select';
import messages from '../../messages/uk.json' with { type: 'json' };
import {
  t,
  OWN_DRAFT_PREFIX,
  POSITION,
  CREATE_URL,
  field,
  position,
  teamLead,
  saveDraft,
  creates,
  sweepOwnDrafts,
  level,
  workFormat,
  employment,
  currency,
  salaryFrom,
  salaryTo,
  probation,
  NBSP,
  probationRange,
  probationReadOnly,
  startDraft,
  refuseCreate,
  pickByKeys,
} from './support/vacancy-create';

test.describe('group «Умови», Admin [STORY-VAC-01-1, D115, D116]', () => {
  test.use({ storageState: sessionFile('admin@demo') });
  test.afterEach(({ page }) => sweepOwnDrafts(page));

  test('offers the closed lists, shows amounts in their normal form, sends the contract body and stores every value', async ({
    page,
  }) => {
    const sent = creates(page);
    const title = `${OWN_DRAFT_PREFIX} ${Date.now()}`;
    await startDraft(page, title);
    await expectOptions(page, level(page), [
      messages.vacancies.notSpecified,
      'Джуніор',
      'Мідл',
      'Сеніор',
      'Лід',
    ]);
    await expectOptions(page, currency(page), [
      messages.vacancies.notSpecified,
      t.salary.currencies.USD,
      t.salary.currencies.EUR,
      t.salary.currencies.UAH,
    ]);
    await chooseOption(page, level(page), 'Мідл');
    await chooseOption(
      page,
      workFormat(page),
      messages.vacancies.workFormat.HYBRID,
    );
    await chooseOption(page, employment(page), 'Повна зайнятість');
    await field(page, t.location.label).fill('Київ');
    await salaryFrom(page).fill('2500');
    await salaryTo(page).fill('4000,50');
    await chooseOption(page, currency(page), t.salary.currencies.USD);
    await expect(salaryFrom(page)).toHaveValue(`2${NBSP}500`);
    await expect(salaryTo(page)).toHaveValue(`4${NBSP}000,5`);
    await expect(probation(page)).toHaveValue('90');
    await probation(page).fill('60');
    await saveDraft(page).click();
    await expect(page).toHaveURL(/\/vacancies\?.*status=DRAFT/);

    expect(sent).toHaveLength(1);
    expect(sent[0]!.postDataJSON()).toEqual({
      mode: 'DRAFT',
      verticalId: DEMO_VERTICALS.gambling,
      title,
      headcount: 1,
      priority: 'NORMAL',
      seniority: 'Мідл',
      workFormat: 'HYBRID',
      employmentType: 'Повна зайнятість',
      location: 'Київ',
      salaryMinMinor: '250000',
      salaryMaxMinor: '400050',
      salaryCurrency: 'USD',
      probationDays: 60,
    });
    const id = new URL(page.url()).searchParams.get('vacancy');
    const stored = (await (
      await page.request.get(`/api/v1/vacancies/${id}`)
    ).json()) as VacancyDetail;
    expect(stored).toMatchObject({
      seniority: 'Мідл',
      workFormat: 'HYBRID',
      employmentType: 'Повна зайнятість',
      location: 'Київ',
      salaryMinMinor: '250000',
      salaryMaxMinor: '400050',
      salaryCurrency: 'USD',
      probationDays: 60,
    });
  });

  test('an untouched group sends the default probation and nothing else of «Умови»; «Не вказано» clears a choice again', async ({
    page,
  }) => {
    const sent = creates(page);
    await page.route(CREATE_URL, async (route) =>
      route.request().method() === 'POST'
        ? route.fulfill(await problemFulfill(500, 'INTERNAL'))
        : route.fallback(),
    );
    const title = `${OWN_DRAFT_PREFIX} ${Date.now()}`;
    await startDraft(page, title);
    await chooseOption(page, level(page), 'Лід');
    await chooseOption(page, level(page), messages.vacancies.notSpecified);
    await saveDraft(page).click();
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0]!.postDataJSON()).toEqual({
      mode: 'DRAFT',
      verticalId: DEMO_VERTICALS.gambling,
      title,
      headcount: 1,
      priority: 'NORMAL',
      probationDays: 90,
    });
  });

  test('a probation outside 30–90 is refused on its field, which gets the focus, and nothing is sent', async ({
    page,
  }) => {
    const sent = creates(page);
    await startDraft(page, `${OWN_DRAFT_PREFIX} ${Date.now()}`);
    for (const value of ['29', '91', '9x']) {
      await probation(page).fill(value);
      await saveDraft(page).click();
      await expect(
        page.getByText(probationRange, { exact: true }),
      ).toBeVisible();
      await expect(probation(page)).toBeFocused();
      await expect(probation(page)).toHaveAttribute('aria-invalid', 'true');
    }
    await probation(page).fill('30');
    await probation(page).blur();
    await expect(page.getByText(probationRange, { exact: true })).toHaveCount(
      0,
    );
    expect(sent).toHaveLength(0);
  });

  test('the salary rules are checked before anything is sent: amount and currency go together, the maximum never undercuts the minimum, text is refused [ux §4.1]', async ({
    page,
  }) => {
    const sent = creates(page);
    await startDraft(page, `${OWN_DRAFT_PREFIX} ${Date.now()}`);

    await salaryFrom(page).fill('100');
    await saveDraft(page).click();
    await expect(
      page.getByText(t.errors.salaryCurrencyRequired, { exact: true }),
    ).toBeVisible();
    await expect(currency(page)).toBeFocused();

    await salaryFrom(page).fill('');
    await chooseOption(page, currency(page), t.salary.currencies.EUR);
    await saveDraft(page).click();
    await expect(
      page.getByText(t.errors.salaryCurrencyNoAmount, { exact: true }),
    ).toBeVisible();
    await expect(currency(page)).toBeFocused();

    await salaryFrom(page).fill('500');
    await salaryTo(page).fill('499,99');
    await saveDraft(page).click();
    await expect(
      page.getByText(t.errors.salaryMaxBelowMin, { exact: true }),
    ).toBeVisible();
    await expect(salaryTo(page)).toBeFocused();
    await expect(salaryTo(page)).toHaveAttribute('aria-invalid', 'true');

    await salaryTo(page).fill('abc');
    await salaryTo(page).blur();
    await expect(
      page.getByText(t.errors.salaryNumber, { exact: true }),
    ).toBeVisible();
    await expect(salaryTo(page)).toHaveValue('abc');

    await salaryTo(page).fill('99999999999999999');
    await salaryTo(page).blur();
    await expect(
      page.getByText(t.errors.salaryTooLarge, { exact: true }),
    ).toBeVisible();
    expect(sent).toHaveLength(0);
  });

  test('answers of the server land on the right fields, the first in page order gets the focus and every value stays [ux §4.1]', async ({
    page,
  }) => {
    await page.route(CREATE_URL, async (route) =>
      route.request().method() === 'POST'
        ? route.fulfill(
            await problemFulfill(400, 'VALIDATION_FAILED', [
              { path: 'body.probationDays', code: 'too_big' },
              { path: 'body.salaryMaxMinor', code: 'custom' },
              { path: 'body.location', code: 'too_big' },
            ]),
          )
        : route.fallback(),
    );
    await startDraft(page, 'Назва для перевірки');
    await field(page, t.location.label).fill('Київ');
    await salaryFrom(page).fill('100');
    await chooseOption(page, currency(page), t.salary.currencies.USD);
    await saveDraft(page).click();
    await expect(
      page.getByText(t.errors.locationLong.replace('{max}', '200'), {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(t.errors.salaryMaxBelowMin, { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(probationRange, { exact: true })).toBeVisible();
    await expect(field(page, t.location.label)).toBeFocused();
    await expect(field(page, t.location.label)).toHaveValue('Київ');
    await expect(salaryFrom(page)).toHaveValue('100');
    await expect(page).toHaveURL(/\/vacancies\/new$/);
  });

  test('a salary currency the server refuses reads as «choose a currency» when an amount was sent', async ({
    page,
  }) => {
    await page.route(CREATE_URL, async (route) =>
      route.request().method() === 'POST'
        ? route.fulfill(
            await problemFulfill(400, 'VALIDATION_FAILED', [
              { path: 'body.salaryCurrency', code: 'custom' },
            ]),
          )
        : route.fallback(),
    );
    await startDraft(page, 'Назва для перевірки');
    await salaryFrom(page).fill('100');
    await chooseOption(page, currency(page), t.salary.currencies.USD);
    await saveDraft(page).click();
    await expect(
      page.getByText(t.errors.salaryCurrencyRequired, { exact: true }),
    ).toBeVisible();
    await expect(currency(page)).toBeFocused();
  });
  test('every field of «Умови» can be filled and saved with the keyboard alone, in the order of the page [ux §8]', async ({
    page,
  }) => {
    const sent = creates(page);
    await refuseCreate(page);
    const title = `${OWN_DRAFT_PREFIX} ${Date.now()}`;
    await startDraft(page, title);
    const focused = async (locator: ReturnType<typeof field>) => {
      await page.keyboard.press('Tab');
      await expect(locator).toBeFocused();
    };
    await focused(field(page, t.headcount.label));
    await focused(page.getByRole('radio', { name: t.priority.NORMAL }));
    await focused(teamLead(page));
    await focused(level(page));
    await pickByKeys(page, level(page), 2, 'Мідл');
    await focused(workFormat(page));
    await pickByKeys(
      page,
      workFormat(page),
      3,
      messages.vacancies.workFormat.HYBRID,
    );
    await focused(employment(page));
    await pickByKeys(page, employment(page), 1, 'Повна зайнятість');
    await focused(field(page, t.location.label));
    await page.keyboard.type('Київ');
    await focused(salaryFrom(page));
    await page.keyboard.type('2 500,50');
    await focused(salaryTo(page));
    await page.keyboard.type('4000');
    await focused(currency(page));
    await pickByKeys(page, currency(page), 2, t.salary.currencies.EUR);
    await focused(probation(page));
    await page.keyboard.press('Control+A');
    await page.keyboard.type('45');
    await expect(salaryFrom(page)).toHaveValue(`2${NBSP}500,5`);
    await expect(salaryTo(page)).toHaveValue(`4${NBSP}000`);
    await focused(
      page
        .locator('[data-slot="form-page-footer"]')
        .getByRole('link', { name: messages.common.cancel, exact: true }),
    );
    await focused(saveDraft(page));
    await page.keyboard.press('Enter');
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0]!.postDataJSON()).toEqual({
      mode: 'DRAFT',
      verticalId: DEMO_VERTICALS.gambling,
      title,
      headcount: 1,
      priority: 'NORMAL',
      seniority: 'Мідл',
      workFormat: 'HYBRID',
      employmentType: 'Повна зайнятість',
      location: 'Київ',
      salaryMinMinor: '250050',
      salaryMaxMinor: '400000',
      salaryCurrency: 'EUR',
      probationDays: 45,
    });
  });

  for (const [name, from, shown, minor] of [
    ['the Ukrainian form of an amount', '2 500,50', `2${NBSP}500,5`, '250050'],
    ['zero', '0', '0', '0'],
    ['a plain amount with a dot', '1234.5', `1${NBSP}234,5`, '123450'],
    [
      'the largest amount the contract stores',
      '9999999999999,99',
      `9${NBSP}999${NBSP}999${NBSP}999${NBSP}999,99`,
      '999999999999999',
    ],
  ] as const)
    test(`salary edge: ${name} is accepted, shown in its normal form and sent as minor units [ux §4.1]`, async ({
      page,
    }) => {
      const sent = creates(page);
      await refuseCreate(page);
      await startDraft(page, 'Назва для перевірки');
      await salaryFrom(page).fill(from);
      await chooseOption(page, currency(page), t.salary.currencies.USD);
      await salaryFrom(page).blur();
      await expect(salaryFrom(page)).toHaveValue(shown);
      await expect(salaryFrom(page)).not.toHaveAttribute(
        'aria-invalid',
        'true',
      );
      await saveDraft(page).click();
      await expect.poll(() => sent.length).toBe(1);
      expect(sent[0]!.postDataJSON()).toMatchObject({
        salaryMinMinor: minor,
        salaryCurrency: 'USD',
      });
    });

  for (const [name, text, message] of [
    ['a 16-digit amount', '1234567890123456', t.errors.salaryTooLarge],
    ['a 14-digit amount', '10000000000000', t.errors.salaryTooLarge],
    ['a negative amount', '-5', t.errors.salaryNumber],
    ['a negative zero', '-0', t.errors.salaryNumber],
    ['an exponent', '1e3', t.errors.salaryNumber],
    ['three decimals', '2 500,555', t.errors.salaryNumber],
  ] as const)
    for (const [bound, input] of [
      ['minimum', salaryFrom],
      ['maximum', salaryTo],
    ] as const)
      test(`salary edge: ${name} in the ${bound} is refused on its field, keeps the text and sends nothing [ux §4.1]`, async ({
        page,
      }) => {
        const sent = creates(page);
        await startDraft(page, 'Назва для перевірки');
        await chooseOption(page, currency(page), t.salary.currencies.USD);
        await input(page).fill(text);
        await input(page).blur();
        await expect(page.getByText(message, { exact: true })).toBeVisible();
        await expect(input(page)).toHaveAttribute('aria-invalid', 'true');
        await expect(input(page)).toHaveValue(text);
        await saveDraft(page).click();
        await expect(input(page)).toBeFocused();
        expect(sent).toHaveLength(0);
      });

  for (const days of [30, 90])
    test(`probation boundary ${days} is accepted and travels as a number [PROB-02]`, async ({
      page,
    }) => {
      const sent = creates(page);
      await refuseCreate(page);
      await startDraft(page, 'Назва для перевірки');
      await probation(page).fill(String(days));
      await saveDraft(page).click();
      await expect.poll(() => sent.length).toBe(1);
      expect(sent[0]!.postDataJSON()).toMatchObject({ probationDays: days });
      await expect(page.getByText(probationRange, { exact: true })).toHaveCount(
        0,
      );
    });

  test('the widest amounts and the stacked salary errors keep every salary control inside the screen [ux §9]', async ({
    page,
  }) => {
    await startDraft(page, 'Назва для перевірки');
    await salaryFrom(page).fill('9999999999999,99');
    await salaryTo(page).fill('1');
    await salaryFrom(page).blur();
    await salaryTo(page).blur();
    await saveDraft(page).click();
    await expect(
      page.getByText(t.errors.salaryCurrencyRequired, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(t.errors.salaryMaxBelowMin, { exact: true }),
    ).toBeVisible();
    const { width } = page.viewportSize()!;
    for (const input of [salaryFrom(page), salaryTo(page), currency(page)]) {
      const box = (await input.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
});

for (const user of [
  'head.recruiter.gambling@demo',
  'recruiter1.gambling@demo',
] as const) {
  test.describe(`group «Умови», ${user} [D115]`, () => {
    test.use({ storageState: sessionFile(user) });

    test('the read-only probation line and the note after creation sit above the footer and inside the screen, at the end of the form [ux §3]', async ({
      page,
    }) => {
      await startDraft(page, 'Назва для перевірки');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const line = page.getByText(probationReadOnly, { exact: true });
      await expect(line).toBeInViewport();
      const footer = (await page
        .locator('[data-slot="form-page-footer"]')
        .boundingBox())!;
      const box = (await line.boundingBox())!;
      const { width } = page.viewportSize()!;
      expect(box.y + box.height).toBeLessThanOrEqual(footer.y + 1);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    });

    test('has no probation field, says why, and sends no probation key; the other terms still travel', async ({
      page,
    }) => {
      const sent = creates(page);
      // The save is refused by a stub, so no draft is stored and no daily create limit is spent.
      await page.route(CREATE_URL, async (route) =>
        route.request().method() === 'POST'
          ? route.fulfill(await problemFulfill(500, 'INTERNAL'))
          : route.fallback(),
      );
      await startDraft(page, 'Назва для перевірки');
      await expect(probation(page)).toHaveCount(0);
      await expect(
        page.getByText(probationReadOnly, { exact: true }),
      ).toBeVisible();
      await chooseOption(page, level(page), 'Сеніор');
      await field(page, t.location.label).fill('Львів');
      await saveDraft(page).click();
      await expect.poll(() => sent.length).toBe(1);
      const body = sent[0]!.postDataJSON() as Record<string, unknown>;
      expect(body).toMatchObject({ seniority: 'Сеніор', location: 'Львів' });
      expect(body).not.toHaveProperty('probationDays');
    });
  });
}

test.describe('layout of «Умови» and the readiness rail, Admin [ux §3]', () => {
  test.use({ storageState: sessionFile('admin@demo') });

  test('on a phone the terms stack and the salary pair shares a row; from the rail width the rail sits beside the form and follows what is filled in', async ({
    page,
    isMobile,
  }) => {
    await startDraft(page, '');
    const box = async (locator: ReturnType<typeof field>) =>
      (await locator.boundingBox())!;
    const [title, seniority, work, employmentBox, from, to, currencyBox] =
      await Promise.all([
        box(field(page, t.titleField.label)),
        box(level(page)),
        box(workFormat(page)),
        box(employment(page)),
        box(salaryFrom(page)),
        box(salaryTo(page)),
        box(currency(page)),
      ]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const rail = page.locator('[data-slot="readiness-rail"]');
    if (isMobile) {
      const { width } = page.viewportSize()!;
      for (const control of [seniority, work, employmentBox, currencyBox]) {
        expect(Math.abs(control.width - title.width)).toBeLessThanOrEqual(1);
        expect(control.height).toBeGreaterThanOrEqual(44);
        expect(control.x + control.width).toBeLessThanOrEqual(width);
      }
      expect(work.y).toBeGreaterThan(seniority.y + seniority.height - 1);
      expect(employmentBox.y).toBeGreaterThan(work.y + work.height - 1);
      expect(Math.abs(from.y - to.y)).toBeLessThanOrEqual(1);
      expect(to.x).toBeGreaterThan(from.x + from.width - 1);
      expect(currencyBox.y).toBeGreaterThan(from.y + from.height - 1);
      for (const input of [
        field(page, t.location.label),
        salaryFrom(page),
        salaryTo(page),
        probation(page),
      ])
        await expect(input).toHaveCSS('font-size', '16px');
      await expect(rail).toBeHidden();
      await expect(
        page.getByText(t.rail.afterCreateAssigner, { exact: true }).first(),
      ).toBeVisible();
      return;
    }
    expect(Math.abs(seniority.y - work.y)).toBeLessThanOrEqual(1);
    expect(work.x).toBeGreaterThan(seniority.x + seniority.width - 1);
    expect(Math.abs(from.y - to.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(to.y - currencyBox.y)).toBeLessThanOrEqual(1);
    await expect(rail).toBeVisible();
    const railBox = (await rail.boundingBox())!;
    expect(railBox.x).toBeGreaterThan(title.x + title.width);
    expect(Math.round(railBox.width)).toBe(320);
    await expect(
      page.getByText(t.rail.afterCreateAssigner, { exact: true }),
    ).toHaveCount(2);
    await expect(
      page.getByText(t.rail.afterCreateAssigner, { exact: true }).first(),
    ).toBeHidden();
    const items = rail.getByRole('listitem');
    await expect(items).toHaveText([
      `${t.rail.vertical}${t.rail.done}`,
      `${t.rail.title}${t.rail.todo}`,
      `${t.rail.position}${t.rail.todo}`,
    ]);
    await field(page, t.titleField.label).fill('Назва для перевірки');
    await expect(items.nth(1)).toHaveText(`${t.rail.title}${t.rail.done}`);
    await position(page).click();
    await page.getByRole('option', { name: POSITION, exact: true }).click();
    await expect(items.nth(2)).toHaveText(`${t.rail.position}${t.rail.done}`);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(rail).toBeInViewport();
  });
});

const railNotes = [
  [
    'recruiter1.gambling@demo',
    t.rail.afterCreateSelf,
    t.rail.afterCreateAssigner,
  ],
  [
    'head.recruiter.gambling@demo',
    t.rail.afterCreateAssigner,
    t.rail.afterCreateSelf,
  ],
  ['admin@demo', t.rail.afterCreateAssigner, t.rail.afterCreateSelf],
] as const;

for (const [user, shown, other] of railNotes) {
  test.describe(`note after creation and readiness rail, ${user} [D102, ux §2.1]`, () => {
    test.use({ storageState: sessionFile(user) });

    test('tells the author who assigns recruiters, in the rail when it fits and above the footer when it does not', async ({
      page,
      isMobile,
    }) => {
      await startDraft(page, '');
      const visible = (text: string) =>
        page.locator('p:visible', { hasText: text });
      await expect(visible(shown)).toHaveCount(1);
      await expect(visible(other)).toHaveCount(0);
      const rail = page.locator('[data-slot="readiness-rail"]');
      if (isMobile) {
        await expect(rail).toBeHidden();
        return;
      }
      await expect(rail.getByText(shown, { exact: true })).toBeVisible();
      await expect(
        rail.getByText(t.rail.draftNote, { exact: true }),
      ).toBeVisible();
      await expect(
        rail.getByRole('heading', { name: t.rail.label, level: 2 }),
      ).toBeVisible();
      await expect(
        rail.locator('[aria-live], [role="alert"], [role="status"]'),
      ).toHaveCount(0);
      await expect(
        rail.locator('a, button, input, select, textarea, [tabindex]'),
      ).toHaveCount(0);
    });
  });
}
