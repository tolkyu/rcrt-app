import { expect, type Page, type Request } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { vacancyDetailSchema } from '../../lib/schemas/vacancy';
import {
  updateVacancyContentSchema,
  vacancyContentReadSchema,
} from '../../lib/schemas/vacancy-content';
import { sessionFile } from '../support/e2e-session';
import {
  contentUrl,
  contentWrites,
  editor,
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
} from './support/vacancy-content';
import { apiAs, button, statusOf, ts } from './support/vacancy-team';

const LOCAL = 'Незбережені вимоги команди';
const UPDATED = 'Вимоги після підтвердженого завантаження';
const contentResponse = (page: Page, id: string, method: 'GET' | 'PATCH') =>
  page.waitForResponse(
    (answer) =>
      answer.request().method() === method && contentUrl(id).test(answer.url()),
  );
const statusWrites = (page: Page, id: string) => {
  const seen: Request[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'PUT' &&
      request.url().endsWith(`/vacancies/${id}/status`)
    )
      seen.push(request);
  });
  return seen;
};
async function expectLockedBuffer(page: Page) {
  const requirements = editor(page, 'requirements');
  await expect(requirements).toHaveText(LOCAL);
  await expect(requirements).toHaveAttribute('contenteditable', 'false');
  expect(
    await requirements.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return selection?.toString();
    }),
  ).toBe(LOCAL);
  await expect(saveContent(page)).toHaveAttribute('aria-disabled', 'true');
}

test.use({ storageState: sessionFile(RECRUITER) });

test.describe('status changes during content editing [VAC-08, D133, ADR-020]', () => {
  test('real HOLD makes an old-version save stale; confirmed reload permits a deliberate save on ON_HOLD', async ({
    page,
    vacancy,
    playwright,
  }) => {
    const head = await apiAs(playwright, 'head.recruiter.gambling@demo');
    try {
      await openContent(page, vacancy);
      await replaceText(editor(page, 'requirements'), LOCAL);
      const before = await readContent(head, vacancy.id);
      const sent = contentWrites(page, vacancy.id);
      const statusSent = statusWrites(page, vacancy.id);
      const hold = await statusOf(head, vacancy.id, {
        action: 'HOLD',
        expectedVersion: before.version,
      });
      expect(hold.status(), await hold.text()).toBe(200);
      const held = vacancyDetailSchema.parse(await hold.json());
      expect(held).toMatchObject({
        status: 'ON_HOLD',
        version: before.version + 1,
      });
      const rejected = contentResponse(page, vacancy.id, 'PATCH');
      const revalidation = contentResponse(page, vacancy.id, 'GET');
      await saveContent(page).click();
      const failure = await rejected;
      expect(failure.status()).toBe(409);
      expect(await failure.json()).toMatchObject({ code: 'STALE_STATE' });
      const access = await revalidation;
      expect(access.status()).toBe(200);
      expect(vacancyContentReadSchema.parse(await access.json())).toMatchObject(
        {
          status: 'ON_HOLD',
          canEditContent: true,
          version: held.version,
          descriptionDoc: before.descriptionDoc,
          requirementsDoc: before.requirementsDoc,
        },
      );
      await expect(
        page.getByRole('alert').filter({ hasText: tc.stale }),
      ).toBeVisible();
      await expect(editor(page, 'requirements')).toHaveText(LOCAL);
      await expect(saveContent(page)).toHaveAttribute('aria-disabled', 'true');
      await saveContent(page).click({ force: true });
      await editor(page, 'requirements').press('ControlOrMeta+Enter');
      expect(sent).toHaveLength(1);
      expect(await readContent(head, vacancy.id)).toMatchObject({
        status: 'ON_HOLD',
        version: held.version,
        descriptionDoc: before.descriptionDoc,
        requirementsDoc: before.requirementsDoc,
      });
      await button(page, tc.reload).click();
      const dialog = page.getByRole('alertdialog', { name: tc.reloadTitle });
      await button(dialog, tc.reloadStay).click();
      await expect(editor(page, 'requirements')).toHaveText(LOCAL);
      await button(page, tc.reload).click();
      const reload = contentResponse(page, vacancy.id, 'GET');
      await button(dialog, tc.reloadConfirm).click();
      expect((await reload).status()).toBe(200);
      await expect(editor(page, 'requirements')).toHaveText('');
      await expect(
        page.getByRole('alert').filter({ hasText: tc.stale }),
      ).toHaveCount(0);
      await replaceText(editor(page, 'requirements'), UPDATED);
      await expect(saveContent(page)).not.toHaveAttribute(
        'aria-disabled',
        'true',
      );
      await saveContent(page).click();
      await expect(saved(page)).toBeVisible();
      expect(sent).toHaveLength(2);
      expect(updateVacancyContentSchema.parse(sent[1]?.postDataJSON())).toEqual(
        {
          expectedVersion: held.version,
          requirementsDoc: textDoc(UPDATED),
        },
      );
      expect(await readContent(head, vacancy.id)).toMatchObject({
        status: 'ON_HOLD',
        version: held.version + 1,
        descriptionDoc: before.descriptionDoc,
        requirementsDoc: textDoc(UPDATED),
      });
      expect(statusSent).toHaveLength(0);
    } finally {
      await head.dispose();
    }
  });

  test('real CANCEL rejects a pending edit as locked, keeps selectable local text and never reopens or replays', async ({
    page,
    vacancy,
    playwright,
  }) => {
    const head = await apiAs(playwright, 'head.recruiter.gambling@demo');
    try {
      await openContent(page, vacancy);
      await replaceText(editor(page, 'requirements'), LOCAL);
      const before = await readContent(head, vacancy.id);
      const sent = contentWrites(page, vacancy.id);
      const statusSent = statusWrites(page, vacancy.id);
      const cancel = await statusOf(head, vacancy.id, {
        action: 'CANCEL',
        expectedVersion: before.version,
        reason: 'Потребу команди скасовано.',
      });
      expect(cancel.status(), await cancel.text()).toBe(200);
      const cancelled = vacancyDetailSchema.parse(await cancel.json());
      expect(cancelled).toMatchObject({
        status: 'CANCELLED',
        version: before.version + 1,
      });
      const rejected = contentResponse(page, vacancy.id, 'PATCH');
      const revalidation = contentResponse(page, vacancy.id, 'GET');
      await saveContent(page).click();
      const failure = await rejected;
      expect(failure.status()).toBe(409);
      expect(await failure.json()).toMatchObject({
        code: 'VACANCY_CONTENT_LOCKED',
      });
      const access = await revalidation;
      expect(access.status()).toBe(200);
      expect(vacancyContentReadSchema.parse(await access.json())).toMatchObject(
        {
          status: 'CANCELLED',
          canEditContent: false,
          version: cancelled.version,
          descriptionDoc: before.descriptionDoc,
          requirementsDoc: before.requirementsDoc,
        },
      );
      await expect(
        page.getByRole('alert').filter({ hasText: tc.cancelled }),
      ).toBeVisible();
      await expectLockedBuffer(page);
      await expect(button(page, ts.reopen)).toHaveCount(0);
      await saveContent(page).click({ force: true });
      await editor(page, 'requirements').press('ControlOrMeta+Enter');
      expect(sent).toHaveLength(1);
      expect(statusSent).toHaveLength(0);
      expect(await readContent(head, vacancy.id)).toMatchObject({
        status: 'CANCELLED',
        version: cancelled.version,
        descriptionDoc: before.descriptionDoc,
        requirementsDoc: before.requirementsDoc,
      });
    } finally {
      await head.dispose();
    }
  });

  test('a background FILLED read from the guarded fixture transition blocks PATCH and retains the buffer and discard guard', async ({
    page,
    vacancy,
  }) => {
    await openContent(page, vacancy);
    await replaceText(editor(page, 'requirements'), LOCAL);
    const before = await readContent(page.request, vacancy.id);
    const sent = contentWrites(page, vacancy.id);
    const statusSent = statusWrites(page, vacancy.id);
    await setContentStatus(vacancy, 'FILLED');
    const access = await revalidateContent(page, vacancy.id);
    expect(access.status()).toBe(200);
    expect(vacancyContentReadSchema.parse(await access.json())).toMatchObject({
      status: 'FILLED',
      canEditContent: false,
      version: before.version,
      descriptionDoc: before.descriptionDoc,
      requirementsDoc: before.requirementsDoc,
    });
    await expect(
      page.getByRole('alert').filter({ hasText: tc.filled }),
    ).toBeVisible();
    await expectLockedBuffer(page);
    await saveContent(page).click({ force: true });
    await editor(page, 'requirements').press('ControlOrMeta+Enter');
    await page.getByRole('link', { name: tc.cancel, exact: true }).click();
    const dialog = page.getByRole('alertdialog', {
      name: messages.common.leaveTitle,
    });
    await expect(dialog).toBeVisible();
    await button(dialog, messages.common.leaveStay).click();
    await expect(editor(page, 'requirements')).toHaveText(LOCAL);
    expect(sent).toHaveLength(0);
    expect(statusSent).toHaveLength(0);
    expect(await readContent(page.request, vacancy.id)).toMatchObject({
      status: 'FILLED',
      version: before.version,
      descriptionDoc: before.descriptionDoc,
      requirementsDoc: before.requirementsDoc,
    });
  });
});
