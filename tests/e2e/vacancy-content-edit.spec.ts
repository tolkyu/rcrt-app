import { expect } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import {
  updateVacancyContentSchema,
  vacancyContentReadSchema,
} from '../../lib/schemas/vacancy-content';
import { sessionFile } from '../support/e2e-session';
import { openHydrated } from '../support/hydration';
import { problemFulfill } from '../support/problem';
import { checkAccessibility } from '../support/accessibility';
import { demoId } from '../../server/db/seed';
import { vacancyDetailSchema } from '../../lib/schemas/vacancy';
import { write } from './support/vacancy-edit';
import {
  changeContent,
  contentPath,
  contentUrl,
  contentWrites,
  editor,
  fieldSection,
  openContent,
  readContent,
  RECRUITER,
  replaceText,
  revalidateContent,
  saveContent,
  saved,
  setContentStatus,
  tc,
  test,
  textDoc,
  tr,
} from './support/vacancy-content';
import { apiAs, button, withVisitor } from './support/vacancy-team';

test.use({ storageState: sessionFile(RECRUITER) });

test.describe('published vacancy content [VAC-01, VAC-08, D133, ADR-020]', () => {
  for (const otherAssigned of [false, true])
    test(`real recruiter removal during editing ${otherAssigned ? 'loses read access' : 'retains pool read only'} [ADR-020]`, async ({
      page,
      vacancy,
      playwright,
    }) => {
      const head = await apiAs(playwright, 'head.recruiter.gambling@demo');
      try {
        if (otherAssigned) {
          const before = await readContent(head, vacancy.id);
          const assigned = await head.post(
            `/api/v1/vacancies/${vacancy.id}/recruiters`,
            {
              headers: write(),
              data: {
                expectedVersion: before.version,
                recruiterIds: [demoId('user:recruiter2.gambling@demo')],
              },
            },
          );
          expect(assigned.status(), await assigned.text()).toBe(200);
        }
        await openContent(page, vacancy);
        await replaceText(
          editor(page, 'requirements'),
          'Правки знятого рекрутера',
        );
        const sent = contentWrites(page, vacancy.id);
        const before = await readContent(head, vacancy.id);
        const removed = await head.delete(
          `/api/v1/vacancies/${vacancy.id}/recruiters/${demoId(`user:${RECRUITER}`)}`,
          {
            headers: { ...write(), 'Content-Type': 'application/json' },
            params: { expectedVersion: before.version },
          },
        );
        expect(removed.status(), await removed.text()).toBe(200);
        const current = vacancyDetailSchema.parse(await removed.json());
        expect(current.version).toBe(before.version + 1);
        const response = page.waitForResponse(
          (answer) =>
            answer.request().method() === 'PATCH' &&
            contentUrl(vacancy.id).test(answer.url()),
        );
        const revalidation = page.waitForResponse(
          (answer) =>
            answer.request().method() === 'GET' &&
            contentUrl(vacancy.id).test(answer.url()),
        );
        await saveContent(page).click();
        expect((await response).status()).toBe(otherAssigned ? 404 : 403);
        const access = await revalidation;
        expect(access.status()).toBe(otherAssigned ? 404 : 200);
        if (!otherAssigned)
          expect(
            vacancyContentReadSchema.parse(await access.json()).canEditContent,
          ).toBe(false);
        if (otherAssigned) {
          await expect(
            page.getByText(tc.unavailableTitle, { exact: true }),
          ).toBeVisible();
          await expect(page.getByRole('textbox')).toHaveCount(0);
          await expect(page.getByText('Правки знятого рекрутера')).toHaveCount(
            0,
          );
          await page
            .getByRole('link', { name: tc.toList, exact: true })
            .click();
          await expect(page).toHaveURL(/\/vacancies$/);
          await expect(page.getByRole('alertdialog')).toHaveCount(0);
        } else {
          await expect(
            page.getByRole('alert').filter({ hasText: tc.permissionLost }),
          ).toBeVisible();
          await expect(editor(page, 'requirements')).toHaveText(
            'Правки знятого рекрутера',
          );
          await expect(editor(page, 'requirements')).toHaveAttribute(
            'contenteditable',
            'false',
          );
          await expect(saveContent(page)).toHaveAttribute(
            'aria-disabled',
            'true',
          );
          expect(
            (await readContent(page.request, vacancy.id)).canEditContent,
          ).toBe(false);
          await saveContent(page).click({ force: true });
          await editor(page, 'requirements').press('ControlOrMeta+Enter');
        }
        expect(sent).toHaveLength(1);
        expect(await readContent(head, vacancy.id)).toMatchObject({
          version: current.version,
          descriptionDoc: before.descriptionDoc,
          requirementsDoc: before.requirementsDoc,
        });
      } finally {
        await head.dispose();
      }
    });

  test('real paste strips unsupported HTML and unsafe links while retaining allowed formatting', async ({
    page,
    vacancy,
  }, testInfo) => {
    await openContent(page, vacancy);
    const description = editor(page, 'description');
    await replaceText(description, '');
    await description.evaluate((element) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData(
        'text/html',
        '<p onclick="alert(1)"><strong>Досвід роботи</strong> <a href="javascript:alert(1)">небезпечне посилання</a> <a href="https://example.com/careers">кар’єра</a><img src="invalid" onerror="alert(1)"></p>',
      );
      element.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await expect(description.locator('strong')).toHaveText('Досвід роботи');
    await expect(description.locator('a')).toHaveCount(1);
    await expect(description.locator('a')).toHaveAttribute(
      'href',
      'https://example.com/careers',
    );
    await expect(
      description.locator('img,script,iframe,[onclick],[onerror]'),
    ).toHaveCount(0);
    await checkAccessibility(page, testInfo);
    await saveContent(page).click();
    await expect(saved(page)).toBeVisible();
    const stored = await readContent(page.request, vacancy.id);
    expect(JSON.stringify(stored.descriptionDoc)).not.toMatch(
      /javascript:|onclick|onerror|"type":"image"/,
    );
    expect(JSON.stringify(stored.descriptionDoc)).toContain(
      'https://example.com/careers',
    );
  });

  test('the assigned recruiter saves only the changed document, reloads it and sees it on the card', async ({
    page,
    vacancy,
  }) => {
    const before = await readContent(page.request, vacancy.id);
    await openHydrated(page, `/vacancies/${vacancy.id}`);
    await page
      .getByRole('link', { name: messages.vacancies.contentCard.editAction })
      .click();
    await expect(editor(page, 'description')).toHaveAttribute(
      'contenteditable',
      'true',
    );
    const sent = contentWrites(page, vacancy.id);
    await replaceText(editor(page, 'description'), 'Оновлений опис вакансії');
    await expect(saveContent(page)).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await saveContent(page).dblclick();
    await expect(saved(page)).toBeVisible();
    expect(sent).toHaveLength(1);
    expect(updateVacancyContentSchema.parse(sent[0]?.postDataJSON())).toEqual({
      expectedVersion: before.version,
      descriptionDoc: textDoc('Оновлений опис вакансії'),
    });
    expect(await readContent(page.request, vacancy.id)).toMatchObject({
      version: before.version + 1,
      descriptionDoc: textDoc('Оновлений опис вакансії'),
      requirementsDoc: null,
    });
    await page.reload();
    await expect(editor(page, 'description')).toHaveText(
      'Оновлений опис вакансії',
    );
    await expect(saveContent(page)).toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('link', { name: tc.cancel, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/vacancies/${vacancy.id}$`));
    await expect(
      page.getByRole('region', { name: messages.vacancies.contentCard.title }),
    ).toContainText('Оновлений опис вакансії');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });

  test('NULL stays unchanged; Clear/undo restores the buffer; deleting text saves an empty document separately from NULL', async ({
    page,
    vacancy,
  }) => {
    await openContent(page, vacancy);
    const sent = contentWrites(page, vacancy.id);
    await expect(saveContent(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(
      fieldSection(page, 'requirements').getByRole('button', {
        name: tc.clear,
        exact: true,
      }),
    ).toBeDisabled();
    await replaceText(editor(page, 'description'), 'Незбережений буфер');
    const description = fieldSection(page, 'description');
    await description
      .getByRole('button', { name: tc.clear, exact: true })
      .click();
    await expect(editor(page, 'description')).toHaveCount(0);
    await page.getByRole('button', { name: tc.undoClear, exact: true }).click();
    await expect(editor(page, 'description')).toHaveText('Незбережений буфер');
    await replaceText(editor(page, 'description'), '');
    await saveContent(page).click();
    await expect(saved(page)).toBeVisible();
    expect(
      updateVacancyContentSchema.parse(sent[0]?.postDataJSON()),
    ).toMatchObject({
      descriptionDoc: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    expect(await readContent(page.request, vacancy.id)).toMatchObject({
      descriptionDoc: { type: 'doc', content: [{ type: 'paragraph' }] },
      requirementsDoc: null,
    });
    await description
      .getByRole('button', { name: tc.clear, exact: true })
      .click();
    await expect(saveContent(page)).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await saveContent(page).click();
    await expect(
      page.getByRole('button', { name: tc.undoClear, exact: true }),
    ).toHaveCount(0);
    expect(
      updateVacancyContentSchema.parse(sent[1]?.postDataJSON()).descriptionDoc,
    ).toBeNull();
    expect(
      (await readContent(page.request, vacancy.id)).descriptionDoc,
    ).toBeNull();
  });

  test('real Tiptap keyboard formatting, safe link dialog, Enter, IME and Ctrl+Enter retain the document and save once', async ({
    page,
    vacancy,
  }) => {
    await openContent(page, vacancy);
    const sent = contentWrites(page, vacancy.id);
    const description = editor(page, 'description');
    await replaceText(description, 'Ключова вимога');
    await description.press('ControlOrMeta+a');
    await description.press('ControlOrMeta+b');
    await expect(description.locator('strong')).toHaveText('Ключова вимога');
    await fieldSection(page, 'description')
      .getByRole('button', { name: tr.link, exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: tr.linkTitle });
    const address = dialog.getByRole('textbox', { name: tr.linkAddress });
    await address.fill('javascript:alert(1)');
    await button(dialog, tr.applyLink).click();
    await expect(dialog.getByRole('alert')).toHaveText(tr.invalidLink);
    await address.fill('https://example.com/recruiting');
    await address.press('ControlOrMeta+Enter');
    expect(sent).toHaveLength(0);
    await expect(dialog).toBeVisible();
    await address.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(description).toBeFocused();
    await expect(description.locator('a')).toHaveAttribute(
      'href',
      'https://example.com/recruiting',
    );
    await description.press('ControlOrMeta+End');
    await expect
      .poll(() =>
        description.evaluate(() => window.getSelection()?.isCollapsed),
      )
      .toBe(true);
    await description.press('Enter');
    await description.pressSequentially('Другий абзац');
    expect(sent).toHaveLength(0);
    await description.dispatchEvent('keydown', {
      key: 'Enter',
      ctrlKey: true,
      isComposing: true,
      bubbles: true,
    });
    expect(sent).toHaveLength(0);
    await description.press('ControlOrMeta+Enter');
    await expect(saved(page)).toBeVisible();
    expect(sent).toHaveLength(1);
    const stored = await readContent(page.request, vacancy.id);
    expect(stored.descriptionDoc?.content).toHaveLength(2);
    expect(stored.descriptionDoc).toMatchObject({
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Ключова вимога',
              marks: expect.arrayContaining([
                { type: 'bold' },
                {
                  type: 'link',
                  attrs: { href: 'https://example.com/recruiting' },
                },
              ]),
            },
          ],
        },
        { type: 'paragraph', content: [{ text: 'Другий абзац' }] },
      ],
    });
  });

  test('Cancel protects local edits until discard is confirmed and never sends a write', async ({
    page,
    vacancy,
  }) => {
    await openContent(page, vacancy);
    const sent = contentWrites(page, vacancy.id);
    await replaceText(editor(page, 'description'), 'Текст перед виходом');
    await page.getByRole('link', { name: tc.cancel, exact: true }).click();
    const dialog = page.getByRole('alertdialog', {
      name: messages.common.leaveTitle,
    });
    await button(dialog, messages.common.leaveStay).click();
    await expect(editor(page, 'description')).toHaveText('Текст перед виходом');
    await page.getByRole('link', { name: tc.cancel, exact: true }).click();
    await button(dialog, messages.common.leaveConfirm).click();
    await expect(page).toHaveURL(new RegExp(`/vacancies/${vacancy.id}$`));
    expect(sent).toHaveLength(0);
    expect(
      (await readContent(page.request, vacancy.id)).descriptionDoc,
    ).toEqual(textDoc(vacancy.description));
  });

  test('a real competing save preserves local text, blocks replay and reload requires confirmation with a fresh undo baseline', async ({
    page,
    vacancy,
  }) => {
    await openContent(page, vacancy);
    const sent = contentWrites(page, vacancy.id);
    await replaceText(editor(page, 'description'), 'Локальні правки');
    await changeContent(page.request, vacancy.id, {
      descriptionDoc: textDoc('Збережено в іншій вкладці'),
    });
    await saveContent(page).click();
    await expect(
      page.getByRole('alert').filter({ hasText: tc.stale }),
    ).toBeVisible();
    await expect(editor(page, 'description')).toHaveText('Локальні правки');
    await expect(saveContent(page)).toHaveAttribute('aria-disabled', 'true');
    expect(sent).toHaveLength(1);
    await button(page, tc.reload).click();
    const dialog = page.getByRole('alertdialog', { name: tc.reloadTitle });
    await button(dialog, tc.reloadStay).click();
    await expect(editor(page, 'description')).toHaveText('Локальні правки');
    await button(page, tc.reload).click();
    await button(dialog, tc.reloadConfirm).click();
    await expect(editor(page, 'description')).toHaveText(
      'Збережено в іншій вкладці',
    );
    await editor(page, 'description').press('ControlOrMeta+z');
    await expect(editor(page, 'description')).toHaveText(
      'Збережено в іншій вкладці',
    );
    await replaceText(editor(page, 'description'), 'Правки після завантаження');
    await saveContent(page).click();
    await expect(saved(page)).toBeVisible();
    expect(sent).toHaveLength(2);
    expect(
      (await readContent(page.request, vacancy.id)).descriptionDoc,
    ).toEqual(textDoc('Правки після завантаження'));
  });

  test('PATCH 403 refreshes readable access, retains edits and requires a deliberate retry', async ({
    page,
    vacancy,
  }) => {
    await openContent(page, vacancy);
    const sent = contentWrites(page, vacancy.id);
    let rejected = false;
    await page.route(contentUrl(vacancy.id), async (route) => {
      if (route.request().method() !== 'PATCH' || rejected)
        return route.fallback();
      rejected = true;
      await route.fulfill(await problemFulfill(403, 'FORBIDDEN'));
    });
    await replaceText(editor(page, 'description'), 'Правки після зміни прав');
    await saveContent(page).click();
    await expect(
      page.getByRole('alert').filter({ hasText: tc.permissionLost }),
    ).toBeVisible();
    await expect(editor(page, 'description')).toHaveText(
      'Правки після зміни прав',
    );
    expect(sent).toHaveLength(1);
    await expect(saveContent(page)).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await saveContent(page).click();
    await expect(saved(page)).toBeVisible();
    expect(sent).toHaveLength(2);
  });

  for (const status of [403, 404])
    test(`GET ${status} removes cached documents, local Clear/undo and card metadata without a discard question`, async ({
      page,
      vacancy,
    }) => {
      await openContent(page, vacancy);
      await replaceText(
        editor(page, 'requirements'),
        'Приватний незбережений текст',
      );
      await fieldSection(page, 'description')
        .getByRole('button', { name: tc.clear, exact: true })
        .click();
      let reads = 0;
      await page.route(contentUrl(vacancy.id), async (route) => {
        reads += 1;
        await route.fulfill(
          await problemFulfill(
            status,
            status === 403 ? 'FORBIDDEN' : 'NOT_FOUND',
          ),
        );
      });
      expect((await revalidateContent(page, vacancy.id)).status()).toBe(status);
      await expect(
        page.getByText(tc.unavailableTitle, { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('textbox')).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: tc.undoClear }),
      ).toHaveCount(0);
      await expect(page.getByText('Приватний незбережений текст')).toHaveCount(
        0,
      );
      await page.evaluate(() =>
        window.dispatchEvent(new Event('visibilitychange')),
      );
      await page.getByRole('link', { name: tc.toList, exact: true }).click();
      await expect(page).toHaveURL(/\/vacancies$/);
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      expect(reads).toBe(1);
      await page.goBack();
      await expect(page.getByRole('textbox')).toHaveCount(0);
      await expect(page.getByText('Приватний незбережений текст')).toHaveCount(
        0,
      );
    });

  test('PATCH 401 clears local documents and the session cache before the login redirect', async ({
    page,
    vacancy,
    context,
  }) => {
    await openContent(page, vacancy);
    await replaceText(editor(page, 'requirements'), 'Текст втраченої сесії');
    await page.route(contentUrl(vacancy.id), async (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback();
      await context.clearCookies();
      await route.fulfill(await problemFulfill(401, 'UNAUTHORIZED'));
    });
    const refresh = page.waitForResponse(
      (response) =>
        response.url().includes(contentPath(vacancy.id)) &&
        response.headers()['content-type']?.includes('text/x-component') ===
          true,
    );
    await saveContent(page).click();
    const refreshed = await refresh;
    const flight = await refreshed.text();
    expect(
      flight.includes('NEXT_REDIRECT'),
      'the session guard redirects the refreshed route',
    ).toBe(true);
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await expect(page.getByText('Текст втраченої сесії')).toHaveCount(0);
    await expect(page.locator('[contenteditable="true"]')).toHaveCount(0);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });

  test('HR reads published documents but has no editor or edit link', async ({
    browser,
    vacancy,
  }) => {
    await withVisitor(browser, 'hr@demo', async (page) => {
      await page.goto(contentPath(vacancy.id));
      await expect(
        page.getByRole('alert').filter({ hasText: tc.noPermission }),
      ).toBeVisible();
      await expect(
        page.getByText(vacancy.description, { exact: true }),
      ).toBeVisible();
      await expect(page.locator('[contenteditable]')).toHaveCount(0);
      await expect(saveContent(page)).toHaveCount(0);
      await page
        .getByRole('link', { name: tc.back, exact: true })
        .first()
        .click();
      await expect(
        page.getByRole('link', {
          name: messages.vacancies.contentCard.editAction,
        }),
      ).toHaveCount(0);
    });
  });

  for (const status of ['FILLED', 'CANCELLED'] as const)
    test(`${status} documents stay readable but cannot be edited [D133]`, async ({
      page,
      vacancy,
    }) => {
      await setContentStatus(vacancy, status);
      await page.goto(contentPath(vacancy.id));
      await expect(
        page
          .getByRole('alert')
          .filter({ hasText: status === 'FILLED' ? tc.filled : tc.cancelled }),
      ).toBeVisible();
      await expect(
        page.getByText(vacancy.description, { exact: true }),
      ).toBeVisible();
      await expect(page.locator('[contenteditable]')).toHaveCount(0);
      await expect(saveContent(page)).toHaveCount(0);
    });

  test('foreign-vertical and other-team visitors receive a real 404 without documents', async ({
    browser,
    vacancy,
  }) => {
    for (const user of ['recruiter.crypto@demo', 'taras.tl@demo'] as const)
      await withVisitor(browser, user, async (page) => {
        const response = await page.goto(contentPath(vacancy.id));
        expect(response?.status()).toBe(404);
        await expect(
          page.getByRole('heading', { name: messages.errors.notFoundTitle }),
        ).toBeVisible();
        await expect(page.getByText(vacancy.description)).toHaveCount(0);
        await expect(page.locator('[contenteditable]')).toHaveCount(0);
      });
  });

  test('switching to an HR session during SPA navigation cannot carry the old actor buffer or edit grant', async ({
    page,
    vacancy,
    playwright,
    context,
  }) => {
    await openContent(page, vacancy);
    await replaceText(
      editor(page, 'requirements'),
      'Буфер попереднього користувача',
    );
    const hr = await apiAs(playwright, 'hr@demo');
    try {
      await context.clearCookies();
      await context.addCookies((await hr.storageState()).cookies);
      await page.getByRole('link', { name: tc.cancel, exact: true }).click();
      await button(
        page.getByRole('alertdialog'),
        messages.common.leaveConfirm,
      ).click();
      await expect(page).toHaveURL(new RegExp(`/vacancies/${vacancy.id}$`));
      await expect(
        page.getByText(vacancy.description, { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText('Буфер попереднього користувача'),
      ).toHaveCount(0);
      await expect(
        page.getByRole('link', {
          name: messages.vacancies.contentCard.editAction,
        }),
      ).toHaveCount(0);
      expect((await readContent(page.request, vacancy.id)).canEditContent).toBe(
        false,
      );
      await page.goBack();
      await expect(
        page.getByRole('alert').filter({ hasText: tc.noPermission }),
      ).toBeVisible();
      await expect(page.locator('[contenteditable]')).toHaveCount(0);
      await expect(
        page.getByText('Буфер попереднього користувача'),
      ).toHaveCount(0);
    } finally {
      await hr.dispose();
    }
  });

  test('the owning Team Lead can edit ON_HOLD content without changing vacancy status', async ({
    browser,
    vacancy,
  }) => {
    await setContentStatus(vacancy, 'ON_HOLD');
    await withVisitor(browser, 'vasyl.tl@demo', async (page) => {
      await openContent(page, vacancy);
      await replaceText(editor(page, 'requirements'), 'Вимоги тімліда');
      await saveContent(page).click();
      await expect(saved(page)).toBeVisible();
      expect(await readContent(page.request, vacancy.id)).toMatchObject({
        status: 'ON_HOLD',
        requirementsDoc: textDoc('Вимоги тімліда'),
      });
    });
  });
});
