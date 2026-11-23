import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { sessionListSchema } from '../../lib/schemas/auth';
import { vacancyContentReadSchema } from '../../lib/schemas/vacancy-content';
import { E2E_ORIGIN, sessionFile, signIn } from '../support/e2e-session';
import { withOwner } from '../support/vacancy-request-db';
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
  saveContent,
  tc,
  test,
  textDoc,
} from './support/vacancy-content';

const DRAFT_DESCRIPTION = 'Незбережений опис попередньої сесії';
const DRAFT_REQUIREMENTS = 'Незбережені вимоги попередньої сесії';
const SAVED_DESCRIPTION = 'Актуальний опис для нової сесії';
const SAVED_REQUIREMENTS = 'Актуальні вимоги для нової сесії';

async function sessions(api: APIRequestContext) {
  const answer = await api.get('/api/v1/auth/sessions');
  expect(answer.status()).toBe(200);
  const list = sessionListSchema.parse(await answer.json());
  const current = list.items.find((item) => item.current);
  if (!current) throw new Error('Expected one current authenticated session');
  return { current, items: list.items };
}

async function refreshCurrentRoute(page: Page, path: string) {
  const refreshed = page.waitForResponse((answer) => {
    const request = answer.request();
    return (
      request.method() === 'GET' &&
      !request.isNavigationRequest() &&
      request.headers().rsc === '1' &&
      new URL(answer.url()).pathname === path
    );
  });
  await page.evaluate(() => {
    const runtime: unknown = Reflect.get(window, 'next');
    if (!runtime || typeof runtime !== 'object')
      throw new Error('Expected the pinned Next App Router runtime');
    const router: unknown = Reflect.get(runtime, 'router');
    if (!router || typeof router !== 'object')
      throw new Error('Expected the pinned Next App Router global');
    const refresh: unknown = Reflect.get(router, 'refresh');
    if (typeof refresh !== 'function')
      throw new Error('Expected the pinned Next App Router refresh function');
    refresh.call(router);
  });
  const answer = await refreshed;
  expect(answer.status()).toBe(200);
  expect(answer.headers()['content-type']).toContain('text/x-component');
}

test.use({ storageState: sessionFile(RECRUITER) });

test('same-route refresh preserves the current session buffer, then a real new session of the same actor replaces editor memory [ADR-020]', async ({
  page,
  context,
  playwright,
  vacancy,
}) => {
  await openContent(page, vacancy);
  const first = await sessions(page.request);
  const before = await readContent(page.request, vacancy.id);
  const sent = contentWrites(page, vacancy.id);
  await replaceText(editor(page, 'description'), DRAFT_DESCRIPTION);
  await replaceText(editor(page, 'requirements'), DRAFT_REQUIREMENTS);
  await fieldSection(page, 'description')
    .getByRole('button', { name: tc.clear, exact: true })
    .click();
  const originalEditor = await editor(page, 'requirements').elementHandle();
  if (!originalEditor)
    throw new Error('Expected the mounted requirements editor');
  await editor(page, 'requirements').press('ControlOrMeta+a');
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe(DRAFT_REQUIREMENTS);
  const documentIdentity = await page.evaluate(() => {
    const marker = crypto.randomUUID();
    document.documentElement.dataset.e2eSessionDocument = marker;
    return { marker, timeOrigin: performance.timeOrigin };
  });
  const path = contentPath(vacancy.id);
  const refreshedTitle = `${vacancy.title} RSC`;
  const renamed = await withOwner(
    (sql) => sql`
      update app.vacancy set title = ${refreshedTitle}
      where id = ${vacancy.id} and title = ${vacancy.title}
      returning id`,
  );
  expect(renamed).toHaveLength(1);
  vacancy.title = refreshedTitle;
  await refreshCurrentRoute(page, path);
  await expect(page.getByText(refreshedTitle, { exact: false })).toBeVisible();
  await expect(editor(page, 'requirements')).toHaveText(DRAFT_REQUIREMENTS);
  await expect(
    page.getByRole('button', { name: tc.undoClear, exact: true }),
  ).toBeVisible();
  expect(await originalEditor.evaluate((element) => element.isConnected)).toBe(
    true,
  );
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe(DRAFT_REQUIREMENTS);

  const second = await playwright.request.newContext({ baseURL: E2E_ORIGIN });
  try {
    await signIn(second, RECRUITER);
    const next = await sessions(second);
    expect(next.current.id !== first.current.id).toBe(true);
    expect(next.items.some((item) => item.id === first.current.id)).toBe(true);
    expect((await sessions(page.request)).current.id === first.current.id).toBe(
      true,
    );
    await expect(editor(page, 'requirements')).toHaveText(DRAFT_REQUIREMENTS);
    await expect(
      page.getByRole('button', { name: tc.undoClear, exact: true }),
    ).toBeVisible();
    const canonical = await changeContent(second, vacancy.id, {
      descriptionDoc: textDoc(SAVED_DESCRIPTION),
      requirementsDoc: textDoc(SAVED_REQUIREMENTS),
    });
    expect(canonical.version).toBe(before.version + 1);
    await context.clearCookies();
    await context.addCookies((await second.storageState()).cookies);
    const revalidation = page.waitForResponse(
      (answer) =>
        answer.request().method() === 'GET' &&
        contentUrl(vacancy.id).test(answer.url()),
    );
    await refreshCurrentRoute(page, path);
    const access = await revalidation;
    expect(access.status()).toBe(200);
    expect(vacancyContentReadSchema.parse(await access.json())).toMatchObject({
      version: canonical.version,
      canEditContent: true,
      descriptionDoc: canonical.descriptionDoc,
      requirementsDoc: canonical.requirementsDoc,
    });
    await expect(editor(page, 'description')).toHaveText(SAVED_DESCRIPTION);
    await expect(editor(page, 'requirements')).toHaveText(SAVED_REQUIREMENTS);
    expect(
      await originalEditor.evaluate((element) => element.isConnected),
    ).toBe(false);
    await expect(
      page.getByRole('button', { name: tc.undoClear, exact: true }),
    ).toHaveCount(0);
    await expect(saveContent(page)).toHaveAttribute('aria-disabled', 'true');
    for (const field of ['description', 'requirements'] as const)
      await editor(page, field).press('ControlOrMeta+z');
    await expect(editor(page, 'description')).toHaveText(SAVED_DESCRIPTION);
    await expect(editor(page, 'requirements')).toHaveText(SAVED_REQUIREMENTS);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(sent).toHaveLength(0);
    expect((await sessions(page.request)).current.id === next.current.id).toBe(
      true,
    );
    expect(await readContent(page.request, vacancy.id)).toMatchObject({
      version: canonical.version,
      descriptionDoc: canonical.descriptionDoc,
      requirementsDoc: canonical.requirementsDoc,
    });
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    expect(
      await page.evaluate(() => ({
        marker: document.documentElement.dataset.e2eSessionDocument,
        timeOrigin: performance.timeOrigin,
      })),
    ).toEqual(documentIdentity);
  } finally {
    await second.dispose();
    await originalEditor.dispose();
  }
});
