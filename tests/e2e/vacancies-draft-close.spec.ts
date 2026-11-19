import { expect, test, type APIRequestContext } from '@playwright/test';
import type { VacancyDetail } from '../../lib/schemas/vacancy';
import messages from '../../messages/uk.json' with { type: 'json' };
import { checkAccessibility } from '../support/accessibility';
import { E2E_ORIGIN, sessionFile } from '../support/e2e-session';
import { openHydrated } from '../support/hydration';
import { notFound, sweepDrafts } from './support/vacancy-create';
import {
  cancelDialog,
  cancelledListPath,
  cancelByApi,
  confirmCancel,
  confirmDelete,
  deleteDialog,
  reasonBox,
  stubClose,
  tc,
} from './support/vacancy-close';
import {
  createOwnDraft,
  cardMenuButton,
  draftListPath,
  menuButton,
  menuItem,
  removeStubs,
  rowLink,
  ta,
  visibleTitles,
} from './support/vacancy-draft-actions';
import { readDraft, toastWith } from './support/vacancy-edit';

const AUTHOR = 'recruiter2.gambling@demo';
const v = messages.vacancies;
const counter = (count: number) =>
  messages.form.counter
    .replace('{count}', String(count))
    .replace('{max}', '500');

test.describe('cancel and delete dialogs of own drafts [STORY-VAC-01-1, VAC-01, D82, D92, D98, D111, D112, D113]', () => {
  test.use({ storageState: sessionFile(AUTHOR) });
  test.describe.configure({ mode: 'serial' });
  // Real writes per project: five drafts, then one cancel and one delete in the list, a delete of the cancelled one, a cancel and a delete on the card. Everything else is stubbed.
  // The «Чернетки N» chip is not asserted here: desktop and mobile write the same author's drafts in lockstep, so only unit (`applyClosed`) and Newman (count after cancel and delete) can pin the numbers.
  let api: APIRequestContext;
  let toCancel: VacancyDetail;
  let toDelete: VacancyDetail;
  let onCard: VacancyDetail;
  let spare: VacancyDetail;

  test.beforeAll(async ({ playwright }) => {
    api = await playwright.request.newContext({
      baseURL: E2E_ORIGIN,
      storageState: sessionFile(AUTHOR),
    });
    toCancel = await createOwnDraft(api, 'A', true);
    toDelete = await createOwnDraft(api, 'B', true);
    onCard = await createOwnDraft(api, 'C', true);
    spare = await createOwnDraft(api, 'S', true);
    // A neighbour that is never touched: the last test of a run still has a row to move to.
    await createOwnDraft(api, 'T', true);
  });
  test.afterEach(({ page }) => removeStubs(page));
  test.afterAll(async () => {
    await sweepDrafts(api);
    await api.dispose();
  });

  /** The row after `title` in the list's order, else the one before it: where selection and focus go. */
  const neighbour = (titles: string[], title: string) => {
    const at = titles.indexOf(title);
    return titles[at + 1] ?? titles[at - 1]!;
  };

  test('the cancel dialog: Enter is a new line, the counter counts like the server, the button waits for a reason, Esc and «Залишити» return focus to `⋯`, axe passes [ux §6.3, D113]', async ({
    page,
    isMobile,
  }, testInfo) => {
    const sent: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/cancel')) sent.push(request.url());
    });
    await openHydrated(page, draftListPath());
    const trigger = menuButton(page, spare.title);
    await trigger.click();
    await menuItem(page, ta.cancel).click();
    const dialog = cancelDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(`${spare.number} · ${spare.title}`);
    await expect(dialog.getByRole('listitem')).toHaveText([
      tc.cancel.consequences.closed,
      tc.cancel.consequences.visibility,
      tc.cancel.consequences.deleteHint,
    ]);
    await expect(
      dialog.getByRole('button', { name: tc.cancel.keep, exact: true }),
    ).toBeFocused();
    if (isMobile) {
      const box = (await dialog.boundingBox())!;
      const viewport = page.viewportSize()!;
      expect(box.y + box.height).toBeGreaterThanOrEqual(viewport.height - 1);
      expect(box.width).toBeGreaterThanOrEqual(viewport.width - 1);
    }
    await checkAccessibility(page, testInfo);

    const confirm = confirmCancel(page);
    await expect(confirm).toHaveAttribute('aria-disabled', 'true');
    const reason = reasonBox(page);
    await reason.click();
    await page.keyboard.type('Дубль');
    await page.keyboard.press('Enter');
    // Enter is a new line, never a submit.
    await expect(dialog).toBeVisible();
    await page.keyboard.type('вакансії');
    await expect(reason).toHaveValue('Дубль\nвакансії');
    await expect(dialog.locator('[data-slot="counter"]')).toContainText(
      counter(14),
    );
    await expect(confirm).not.toHaveAttribute('aria-disabled', 'true');

    // Spaces and breaks are no reason; the limit is counted after the server's normal form.
    const cases: [string, boolean][] = [
      [' \n  \n ', false],
      ['я'.repeat(500), true],
      ['я'.repeat(501), false],
      [`${'а'.repeat(250)}\n${'б'.repeat(250)}`, false],
      [`${'а'.repeat(250)}\n${'б'.repeat(249)}`, true],
      [`${'а'.repeat(250)}\n\n\n\n${'б'.repeat(246)}`, true],
      [`${'а'.repeat(250)}\n\n\n\n${'б'.repeat(247)}`, false],
    ];
    for (const [value, allowed] of cases) {
      await reason.fill(value);
      if (allowed)
        await expect(confirm).not.toHaveAttribute('aria-disabled', 'true');
      else await expect(confirm).toHaveAttribute('aria-disabled', 'true');
    }
    await reason.fill('я'.repeat(501));
    await expect(confirm).toHaveAccessibleDescription(
      messages.common.confirmReasonTooLong.replace('{max}', '500'),
    );

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await menuItem(page, ta.cancel).click();
    await expect(reasonBox(page)).toHaveValue('');
    await dialog
      .getByRole('button', { name: tc.cancel.keep, exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(sent).toEqual([]);
  });

  test('the delete dialog: the draft wording, no reason field, axe passes, the focus returns to `⋯` [ux §6.3]', async ({
    page,
  }, testInfo) => {
    await openHydrated(page, draftListPath());
    const trigger = menuButton(page, spare.title);
    await trigger.click();
    await menuItem(page, ta.delete).click();
    const dialog = deleteDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(`${spare.number} · ${spare.title}`);
    await expect(dialog.getByRole('listitem')).toHaveText([
      tc.delete.consequences.gone,
      tc.delete.consequences.number.replace('{number}', spare.number),
      tc.delete.consequences.cancelHint,
    ]);
    await expect(dialog.getByRole('textbox')).toHaveCount(0);
    await expect(
      dialog.getByRole('button', { name: tc.delete.keep, exact: true }),
    ).toBeFocused();
    await checkAccessibility(page, testInfo);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('cancel from a row: the reason goes as typed, the row and the count leave once the server answered, focus goes to the next row, one toast [ux §6.4, D113]', async ({
    page,
  }) => {
    await openHydrated(page, draftListPath());
    const titles = await visibleTitles(page);
    const next = neighbour(titles, toCancel.title);
    await menuButton(page, toCancel.title).click();
    await menuItem(page, ta.cancel).click();
    await reasonBox(page).click();
    await page.keyboard.type('Дубль');
    await page.keyboard.press('Enter');
    await page.keyboard.type('вакансії');
    const cancels: unknown[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith(`/${toCancel.id}/cancel`))
        cancels.push(request.postDataJSON());
    });
    await confirmCancel(page).dblclick();

    const done = toastWith(page, tc.toast.cancelled);
    await expect(done).toContainText(
      tc.toast.cancelledDescription.replace('{number}', toCancel.number),
    );
    await expect(cancelDialog(page)).toHaveCount(0);
    await expect(rowLink(page, toCancel.title)).toHaveCount(0);
    await expect(rowLink(page, next)).toBeFocused();
    expect(cancels).toEqual([{ reason: 'Дубль\nвакансії' }]);
    const stored = await readDraft(api, toCancel.id);
    expect(stored).toMatchObject({ status: 'CANCELLED', openedAt: null });
  });

  test('own cancelled draft under «Скасовані»: its menu is «Відкрити картку» and «Видалити…», the card offers delete only [D112(1), ux §6.1]', async ({
    page,
  }) => {
    await openHydrated(page, cancelledListPath());
    await expect(rowLink(page, toCancel.title)).toBeVisible();
    await menuButton(page, toCancel.title).click();
    await expect(page.getByRole('menuitem')).toHaveText([
      v.openCard,
      ta.delete,
    ]);
    await expect(page.getByRole('separator')).toHaveCount(1);
    await menuItem(page, v.openCard).click();
    await expect(page).toHaveURL(new RegExp(`/vacancies/${toCancel.id}$`));
    await expect(
      page.getByText(v.status.CANCELLED, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(v.draft.privateNoteCancelled, { exact: true }),
    ).toBeVisible();
    // D123: the author reads the reason they gave on the card.
    await expect(
      page.getByRole('heading', { name: v.draft.cancelReasonTitle }),
    ).toBeVisible();
    await expect(page.getByText('Дубль вакансії')).toBeVisible();
    await expect(
      page.getByRole('button', { name: ta.delete, exact: true }),
    ).toBeVisible();
    for (const hidden of [ta.publish, v.share]) {
      await expect(
        page.getByRole('button', { name: hidden, exact: true }),
      ).toHaveCount(0);
    }
    await expect(
      page.getByRole('link', { name: ta.edit, exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Дії: / })).toHaveCount(0);
  });

  test('delete a cancelled draft from the list: its wording, the row leaves, the draft count stays, the draft is gone for everyone [D112(1)]', async ({
    page,
  }) => {
    await openHydrated(page, cancelledListPath());
    await menuButton(page, toCancel.title).click();
    await menuItem(page, ta.delete).click();
    const dialog = deleteDialog(page, true);
    await expect(dialog.getByRole('listitem')).toHaveText([
      tc.delete.consequences.gone,
      tc.delete.consequences.number.replace('{number}', toCancel.number),
    ]);
    await confirmDelete(page).click();
    await expect(toastWith(page, tc.toast.deletedCancelled)).toBeVisible();
    await expect(rowLink(page, toCancel.title)).toHaveCount(0);
    expect((await api.get(`/api/v1/vacancies/${toCancel.id}`)).status()).toBe(
      404,
    );
  });

  test('delete a draft from the list: the row and the count leave, focus goes to the next row, the draft is gone [ux §6.4]', async ({
    page,
  }) => {
    await openHydrated(page, draftListPath());
    const titles = await visibleTitles(page);
    const next = neighbour(titles, toDelete.title);
    await menuButton(page, toDelete.title).click();
    await menuItem(page, ta.delete).click();
    await confirmDelete(page).dblclick();
    await expect(toastWith(page, tc.toast.deletedDraft)).toContainText(
      `${toDelete.number} · ${toDelete.title}`,
    );
    await expect(rowLink(page, toDelete.title)).toHaveCount(0);
    await expect(rowLink(page, next)).toBeFocused();
    expect((await api.get(`/api/v1/vacancies/${toDelete.id}`)).status()).toBe(
      404,
    );
  });

  test('on the card: `⋯` offers cancel and delete; the cancel turns the card «Скасована», focus lands on «Видалити…»; the delete returns to «Скасовані» [ux §6.2, §6.4]', async ({
    page,
  }) => {
    await openHydrated(page, `/vacancies/${onCard.id}`);
    const trigger = cardMenuButton(page, onCard.title);
    await trigger.click();
    await expect(page.getByRole('menuitem')).toHaveText([ta.cancel, ta.delete]);
    await menuItem(page, ta.cancel).click();
    await reasonBox(page).fill('Не потрібна');
    await confirmCancel(page).click();

    await expect(toastWith(page, tc.toast.cancelled)).toBeVisible();
    await expect(
      page.getByText(v.status.CANCELLED, { exact: true }),
    ).toBeVisible();
    const remove = page.getByRole('button', { name: ta.delete, exact: true });
    await expect(remove).toBeFocused();
    await expect(
      page.getByRole('button', { name: ta.publish, exact: true }),
    ).toHaveCount(0);
    await expect(trigger).toHaveCount(0);

    await remove.click();
    await confirmDelete(page).click();
    await expect(page).toHaveURL(
      new RegExp(`/vacancies\\?status=CANCELLED&vertical=`),
    );
    await expect(toastWith(page, tc.toast.deletedCancelled)).toBeVisible();
    expect((await api.get(`/api/v1/vacancies/${onCard.id}`)).status()).toBe(
      404,
    );
  });

  test('wide screens: the preview `⋯` holds «Відкрити картку», cancel and delete; a delete moves selection and focus to the next row [ux §6.2, §6.4]', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'the preview panel starts at 1280 px');
    const stub = await stubClose(page, api, spare.id, 'delete');
    await openHydrated(page, draftListPath(spare.id));
    const titles = await visibleTitles(page);
    const next = neighbour(titles, spare.title);
    const preview = page.getByRole('complementary', { name: v.previewLabel });
    await expect(
      preview.getByRole('heading', { level: 2, name: spare.title }),
    ).toBeVisible();
    // The card link moved into the menu for a draft.
    await expect(
      preview.getByRole('link', { name: v.openCard, exact: true }),
    ).toHaveCount(0);
    await preview
      .getByRole('button', {
        name: ta.menuLabel.replace('{title}', spare.title),
      })
      .click();
    await expect(page.getByRole('menuitem')).toHaveText([
      v.openCard,
      ta.cancel,
      ta.delete,
    ]);
    await menuItem(page, ta.delete).click();
    await confirmDelete(page).click();
    await expect.poll(() => stub.requests.length).toBe(1);
    stub.release();
    await expect(toastWith(page, tc.toast.deletedDraft)).toBeVisible();
    await expect(rowLink(page, spare.title)).toHaveCount(0);
    await expect(rowLink(page, next)).toBeFocused();
    await expect(page).not.toHaveURL(new RegExp(`vacancy=${spare.id}`));
    await expect(
      preview.getByRole('heading', { level: 2, name: next }),
    ).toBeVisible();
  });

  test('wide screens: «Відкрити картку» in the preview menu opens the card', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'the preview panel starts at 1280 px');
    await openHydrated(page, draftListPath(spare.id));
    const preview = page.getByRole('complementary', { name: v.previewLabel });
    await preview
      .getByRole('button', {
        name: ta.menuLabel.replace('{title}', spare.title),
      })
      .click();
    await menuItem(page, v.openCard).click();
    await expect(page).toHaveURL(new RegExp(`/vacancies/${spare.id}$`));
  });

  test('a preview of a vacancy that is not an own draft keeps its «Відкрити картку» button', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'the preview panel starts at 1280 px');
    await openHydrated(page, '/vacancies');
    const preview = page.getByRole('complementary', { name: v.previewLabel });
    await expect(
      preview.getByRole('link', { name: v.openCard, exact: true }),
    ).toBeVisible();
    await expect(preview.getByRole('button', { name: /^Дії: / })).toHaveCount(
      0,
    );
  });

  test('a double press sends one request; while the answer is out the dialog cannot be left [one request]', async ({
    page,
  }) => {
    const stub = await stubClose(page, api, spare.id, 'cancel');
    await openHydrated(page, draftListPath());
    await menuButton(page, spare.title).click();
    await menuItem(page, ta.cancel).click();
    await reasonBox(page).fill('Дубль');
    await confirmCancel(page).dblclick();
    await expect.poll(() => stub.requests.length).toBe(1);
    await expect(confirmCancel(page)).toHaveAttribute('aria-busy', 'true');
    await page.keyboard.press('Escape');
    await expect(cancelDialog(page)).toBeVisible();
    expect(stub.requests).toEqual([{ body: { reason: 'Дубль' } }]);
    stub.release();
    await expect(toastWith(page, tc.toast.cancelled)).toBeVisible();
    expect(stub.requests).toHaveLength(1);
  });

  for (const [name, answer, text] of [
    [
      '409 VACANCY_NOT_DRAFT',
      { status: 409, code: 'VACANCY_NOT_DRAFT' },
      v.draftErrors.notDraft,
    ],
    [
      '409 STALE_STATE',
      { status: 409, code: 'STALE_STATE' },
      v.draftErrors.stale,
    ],
    ['429', { status: 429, code: 'RATE_LIMITED' }, ta.toast.rateLimited],
    ['403', { status: 403, code: 'FORBIDDEN' }, ta.toast.forbidden],
    ['500', { status: 500, code: 'INTERNAL' }, tc.error.failed],
  ] as const) {
    test(`${name} stays inside the dialog with the typed reason; the button is the retry [inline errors]`, async ({
      page,
    }) => {
      const stub = await stubClose(page, api, spare.id, 'cancel', answer, {
        gated: false,
      });
      await openHydrated(page, draftListPath());
      await menuButton(page, spare.title).click();
      await menuItem(page, ta.cancel).click();
      await reasonBox(page).fill('Дубль\nдруга');
      await confirmCancel(page).click();
      await expect(cancelDialog(page).getByRole('alert')).toContainText(text);
      await expect(reasonBox(page)).toHaveValue('Дубль\nдруга');
      await expect(confirmCancel(page)).not.toHaveAttribute(
        'aria-busy',
        'true',
      );
      await confirmCancel(page).click();
      await expect.poll(() => stub.requests.length).toBe(2);
      expect(stub.requests[1]).toEqual(stub.requests[0]);
      if (answer.status === 409) {
        // The data is read again when the user has seen the message, not while it is on screen.
        const refetched = page.waitForResponse((response) =>
          /\/api\/v1\/vacancies\?/.test(response.url()),
        );
        await cancelDialog(page)
          .getByRole('button', { name: tc.cancel.keep, exact: true })
          .click();
        await refetched;
      }
    });
  }

  test('404: the dialog closes, the toast says the draft is gone [ux §6.3]', async ({
    page,
  }) => {
    await stubClose(
      page,
      api,
      spare.id,
      'cancel',
      { status: 404, code: 'NOT_FOUND' },
      { gated: false },
    );
    await openHydrated(page, draftListPath());
    await menuButton(page, spare.title).click();
    await menuItem(page, ta.cancel).click();
    await reasonBox(page).fill('Дубль');
    await confirmCancel(page).click();
    await expect(toastWith(page, ta.toast.gone)).toBeVisible();
    await expect(cancelDialog(page)).toHaveCount(0);
  });

  test('a lost answer: the message says so, and the button sends the same request again [network failure]', async ({
    page,
  }) => {
    const stub = await stubClose(page, api, spare.id, 'cancel', 'abort', {
      gated: false,
    });
    await openHydrated(page, draftListPath());
    await menuButton(page, spare.title).click();
    await menuItem(page, ta.cancel).click();
    await reasonBox(page).fill('Дубль');
    await confirmCancel(page).click();
    await expect(cancelDialog(page).getByRole('alert')).toContainText(
      tc.error.network,
    );
    await confirmCancel(page).click();
    await expect(toastWith(page, tc.toast.cancelled)).toBeVisible();
    expect(stub.requests).toHaveLength(2);
    expect(stub.requests[1]).toEqual(stub.requests[0]);
    await expect(rowLink(page, spare.title)).toHaveCount(0);
  });

  test('a chunk that cannot load leaves the list working without row menus, and the card with a plain «Редагувати» [lazy chunk]', async ({
    page,
  }) => {
    await page.route('**/_next/static/chunks/**', async (route) => {
      const response = await route.fetch();
      if ((await response.text()).includes('draft.close.cancel.title'))
        return route.abort('failed');
      return route.fulfill({ response });
    });
    await openHydrated(page, draftListPath());
    await expect(rowLink(page, spare.title)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Дії: / })).toHaveCount(0);
    await page.goto(`/vacancies/${spare.id}`);
    await expect(
      page.getByRole('link', { name: ta.edit, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: ta.publish, exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Дії: / })).toHaveCount(0);
  });
});

test.describe('who sees the cancel and delete actions [D92, D98, D112]', () => {
  test('another author sees neither the draft nor its cancelled twin, and no dialog action', async ({
    browser,
  }) => {
    const owner = await browser.newContext({
      storageState: sessionFile(AUTHOR),
      baseURL: E2E_ORIGIN,
    });
    const other = await browser.newContext({
      storageState: sessionFile('recruiter1.gambling@demo'),
      baseURL: E2E_ORIGIN,
    });
    const api = owner.request;
    let draft: VacancyDetail | undefined;
    try {
      draft = await createOwnDraft(api, 'X', true);
      await cancelByApi(api, draft.id);
      const page = await other.newPage();
      await openHydrated(page, cancelledListPath());
      await expect(rowLink(page, draft.title)).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Дії: / })).toHaveCount(0);
      await page.goto(`/vacancies/${draft.id}`);
      await expect(notFound(page)).toBeVisible();
      for (const name of [ta.delete, ta.cancel, ta.publish])
        await expect(
          page.getByRole('button', { name, exact: true }),
        ).toHaveCount(0);
    } finally {
      await sweepDrafts(api);
      await owner.close();
      await other.close();
    }
  });

  test('a viewer who cannot author sees no menu on any row', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: sessionFile('head.hr@demo'),
      baseURL: E2E_ORIGIN,
    });
    try {
      const page = await context.newPage();
      await openHydrated(page, '/vacancies?status=CANCELLED');
      await expect(page.getByRole('button', { name: /^Дії: / })).toHaveCount(0);
      await expect(page.getByRole('menuitem', { name: ta.delete })).toHaveCount(
        0,
      );
    } finally {
      await context.close();
    }
  });
});
