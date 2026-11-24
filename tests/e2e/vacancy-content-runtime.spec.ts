import { expect, type Page } from '@playwright/test';
import {
  updateVacancyContentSchema,
  vacancyContentReadSchema,
  vacancyContentSchema,
} from '../../lib/schemas/vacancy-content';
import { sessionFile } from '../support/e2e-session';
import { openHydrated } from '../support/hydration';
import { apiAs } from './support/vacancy-team';
import {
  changeContent,
  contentPath,
  contentUrl,
  contentWrites,
  editor,
  editorRuntimePath,
  openContent,
  readContent,
  RECRUITER,
  replaceText,
  saveContent,
  saved,
  tc,
  test,
  textDoc,
  tr,
} from './support/vacancy-content';

function gate() {
  let release: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, open: () => release() };
}

async function refreshRoute(page: Page, path: string) {
  const response = page.waitForResponse(
    (answer) =>
      answer.request().headers().rsc === '1' &&
      new URL(answer.url()).pathname === path,
  );
  await page.evaluate(() => {
    const next: unknown = Reflect.get(window, 'next');
    if (!next || typeof next !== 'object')
      throw new Error('Expected the pinned Next runtime');
    const router: unknown = Reflect.get(next, 'router');
    if (!router || typeof router !== 'object')
      throw new Error('Expected the pinned Next router');
    const refresh: unknown = Reflect.get(router, 'refresh');
    if (typeof refresh !== 'function')
      throw new Error('Expected the pinned Next router refresh');
    refresh.call(router);
  });
  expect((await response).status()).toBe(200);
}

const browserRead = (page: Page, id: string) =>
  page.waitForResponse(
    (answer) =>
      answer.request().method() === 'GET' && contentUrl(id).test(answer.url()),
  );

const documentIdentity = (page: Page) =>
  page.evaluate(() => {
    document.documentElement.dataset.e2eRuntimeDocument ??= crypto.randomUUID();
    return {
      marker: document.documentElement.dataset.e2eRuntimeDocument,
      timeOrigin: performance.timeOrigin,
    };
  });

test.use({ storageState: sessionFile(RECRUITER) });

test('failed real editor chunk retries each field and blocks Save until both runtimes are ready [ADR-020]', async ({
  page,
  vacancy,
}) => {
  const before = await readContent(page.request, vacancy.id);
  const sent = contentWrites(page, vacancy.id);
  const runtimePath = await editorRuntimePath();
  let attempts = 0;
  const retryStarted = gate();
  const releaseRetry = gate();
  await page.route(
    (url) => url.pathname === runtimePath,
    async (route) => {
      attempts += 1;
      if (attempts === 1) return route.abort('failed');
      retryStarted.open();
      await releaseRetry.promise;
      await route.continue();
    },
  );
  try {
    await openHydrated(page, contentPath(vacancy.id));
    const description = page
      .locator('[data-slot="form-field"]')
      .filter({ has: page.locator('#vacancy-content-description-label') });
    const requirements = page
      .locator('[data-slot="form-field"]')
      .filter({ has: page.locator('#vacancy-content-requirements-label') });
    await expect(description.getByRole('alert')).toContainText(tr.loadFailed);
    await expect(requirements.getByRole('alert')).toContainText(tr.loadFailed);
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(saveContent(page)).toHaveAttribute('aria-disabled', 'true');
    await description
      .getByRole('button', { name: tr.retry, exact: true })
      .click();
    await retryStarted.promise;
    await expect(description.getByRole('status')).toHaveText(tr.loading);
    await saveContent(page).click({ force: true });
    expect(sent).toHaveLength(0);
    releaseRetry.open();
    await expect(editor(page, 'description')).toHaveText(vacancy.description);
    await expect(requirements.getByRole('alert')).toContainText(tr.loadFailed);
    await replaceText(
      editor(page, 'description'),
      'Опис після повторного завантаження',
    );
    await expect(saveContent(page)).toHaveAttribute('aria-disabled', 'true');
    await saveContent(page).click({ force: true });
    await editor(page, 'description').press('ControlOrMeta+Enter');
    expect(sent).toHaveLength(0);
    expect(await readContent(page.request, vacancy.id)).toEqual(before);
    await requirements
      .getByRole('button', { name: tr.retry, exact: true })
      .click();
    await expect(editor(page, 'requirements')).toHaveAttribute(
      'contenteditable',
      'true',
    );
    await expect(editor(page, 'requirements')).toHaveText('');
    await expect(editor(page, 'description')).toHaveText(
      'Опис після повторного завантаження',
    );
    await expect(saveContent(page)).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await saveContent(page).click();
    await expect(saved(page)).toBeVisible();
    expect(attempts).toBe(2);
    expect(sent).toHaveLength(1);
    expect(updateVacancyContentSchema.parse(sent[0]?.postDataJSON())).toEqual({
      expectedVersion: before.version,
      descriptionDoc: textDoc('Опис після повторного завантаження'),
    });
    expect(await readContent(page.request, vacancy.id)).toMatchObject({
      version: before.version + 1,
      descriptionDoc: textDoc('Опис після повторного завантаження'),
      requirementsDoc: null,
    });
  } finally {
    releaseRetry.open();
  }
});

test('a delayed real GET cannot restore old documents after an actor change [ADR-020]', async ({
  page,
  context,
  playwright,
  vacancy,
}) => {
  await openContent(page, vacancy);
  const documentBefore = await documentIdentity(page);
  const before = await readContent(page.request, vacancy.id);
  const sent = contentWrites(page, vacancy.id);
  await replaceText(editor(page, 'requirements'), 'Буфер старого читання');
  const captured = gate();
  const release = gate();
  const settled = gate();
  let held = false;
  await page.route(contentUrl(vacancy.id), async (route) => {
    if (route.request().method() !== 'GET' || held) return route.fallback();
    held = true;
    const response = await route.fetch();
    expect(vacancyContentReadSchema.parse(await response.json())).toEqual(
      before,
    );
    captured.open();
    await release.promise;
    try {
      await route.fulfill({ response });
    } finally {
      settled.open();
    }
  });
  const hr = await apiAs(playwright, 'hr@demo');
  try {
    await page.evaluate(() =>
      window.dispatchEvent(new Event('visibilitychange')),
    );
    await captured.promise;
    const canonical = await changeContent(page.request, vacancy.id, {
      descriptionDoc: textDoc('Канонічний опис нового читача'),
      requirementsDoc: textDoc('Канонічні вимоги нового читача'),
    });
    expect(canonical.version).toBe(before.version + 1);
    await context.clearCookies();
    await context.addCookies((await hr.storageState()).cookies);
    const aborted = page.waitForEvent('requestfailed', {
      predicate: (request) =>
        request.method() === 'GET' &&
        contentUrl(vacancy.id).test(request.url()),
    });
    const fresh = browserRead(page, vacancy.id);
    await refreshRoute(page, contentPath(vacancy.id));
    expect(
      vacancyContentReadSchema.parse(await (await fresh).json()),
    ).toMatchObject({
      ...canonical,
      canEditContent: false,
    });
    await expect(
      page.getByRole('alert').filter({ hasText: tc.noPermission }),
    ).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(0);
    expect((await aborted).failure()?.errorText).toBe('net::ERR_ABORTED');
    expect(await documentIdentity(page)).toEqual(documentBefore);
    release.open();
    await settled.promise;
    await expect(
      page.getByText('Канонічний опис нового читача', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(vacancy.description, { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText('Буфер старого читання')).toHaveCount(0);
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(saveContent(page)).toHaveCount(0);
    await expect(saved(page)).toHaveCount(0);
    const checked = browserRead(page, vacancy.id);
    await page.evaluate(() =>
      window.dispatchEvent(new Event('visibilitychange')),
    );
    expect(
      vacancyContentReadSchema.parse(await (await checked).json()),
    ).toMatchObject({
      ...canonical,
      canEditContent: false,
    });
    await expect(
      page.getByText('Канонічний опис нового читача', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(vacancy.description, { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText('Буфер старого читання')).toHaveCount(0);
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(saveContent(page)).toHaveCount(0);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(sent).toHaveLength(0);
    expect(await readContent(hr, vacancy.id)).toMatchObject(canonical);
  } finally {
    release.open();
    await hr.dispose();
  }
});

test('a delayed committed PATCH cannot adopt or replay its old result after the actor editor unmounts [ADR-020]', async ({
  page,
  context,
  playwright,
  vacancy,
}) => {
  await openContent(page, vacancy);
  const documentBefore = await documentIdentity(page);
  const before = await readContent(page.request, vacancy.id);
  const sent = contentWrites(page, vacancy.id);
  const captured = gate();
  const release = gate();
  const settled = gate();
  await page.route(contentUrl(vacancy.id), async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    expect(vacancyContentSchema.parse(await response.json())).toMatchObject({
      version: before.version + 1,
      descriptionDoc: textDoc('Збережено перед зміною користувача'),
      requirementsDoc: null,
    });
    captured.open();
    await release.promise;
    try {
      await route.fulfill({ response });
    } finally {
      settled.open();
    }
  });
  const hr = await apiAs(playwright, 'hr@demo');
  try {
    await replaceText(
      editor(page, 'description'),
      'Збережено перед зміною користувача',
    );
    await saveContent(page).click();
    await captured.promise;
    await expect(
      page.getByRole('button', { name: tc.saving, exact: true }),
    ).toHaveAttribute('aria-busy', 'true');
    expect(sent).toHaveLength(1);
    expect(updateVacancyContentSchema.parse(sent[0]?.postDataJSON())).toEqual({
      expectedVersion: before.version,
      descriptionDoc: textDoc('Збережено перед зміною користувача'),
    });
    const committed = await readContent(page.request, vacancy.id);
    expect(committed.version).toBe(before.version + 1);
    const canonical = await changeContent(page.request, vacancy.id, {
      descriptionDoc: textDoc('Новіший канонічний опис'),
      requirementsDoc: textDoc('Новіші канонічні вимоги'),
    });
    expect(canonical.version).toBe(before.version + 2);
    await context.clearCookies();
    await context.addCookies((await hr.storageState()).cookies);
    const fresh = browserRead(page, vacancy.id);
    await refreshRoute(page, contentPath(vacancy.id));
    expect(
      vacancyContentReadSchema.parse(await (await fresh).json()),
    ).toMatchObject({
      ...canonical,
      canEditContent: false,
    });
    await expect(
      page.getByRole('alert').filter({ hasText: tc.noPermission }),
    ).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(0);
    expect(await documentIdentity(page)).toEqual(documentBefore);
    const completion = page.waitForResponse(
      (answer) =>
        answer.request().method() === 'PATCH' &&
        contentUrl(vacancy.id).test(answer.url()),
    );
    release.open();
    const completed = await completion;
    expect(completed.status()).toBe(200);
    expect(await completed.finished()).toBeNull();
    await settled.promise;
    await expect(
      page.getByText('Новіший канонічний опис', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Новіші канонічні вимоги', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Збережено перед зміною користувача', { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(saved(page)).toHaveCount(0);
    await expect(saveContent(page)).toHaveCount(0);
    const checked = browserRead(page, vacancy.id);
    await page.evaluate(() =>
      window.dispatchEvent(new Event('visibilitychange')),
    );
    expect(
      vacancyContentReadSchema.parse(await (await checked).json()),
    ).toMatchObject({
      ...canonical,
      canEditContent: false,
    });
    await expect(
      page.getByText('Новіший канонічний опис', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Новіші канонічні вимоги', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Збережено перед зміною користувача', { exact: true }),
    ).toHaveCount(0);
    await expect(saved(page)).toHaveCount(0);
    await expect(saveContent(page)).toHaveCount(0);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+Enter');
    expect(sent).toHaveLength(1);
    expect(await readContent(hr, vacancy.id)).toMatchObject(canonical);
  } finally {
    release.open();
    await hr.dispose();
  }
});
