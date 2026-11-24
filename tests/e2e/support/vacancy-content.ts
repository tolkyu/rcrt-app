import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  expect,
  test as base,
  type APIRequestContext,
  type Locator,
  type Page,
  type Request,
} from '@playwright/test';
import messages from '../../../messages/uk.json' with { type: 'json' };
import type { RichTextDoc } from '../../../lib/schemas/rich-text';
import {
  vacancyContentReadSchema,
  vacancyContentSchema,
  type UpdateVacancyContentInput,
} from '../../../lib/schemas/vacancy-content';
import { openHydrated } from '../../support/hydration';
import { withOwner } from '../../support/vacancy-request-db';
import { addTeamFixture } from '../../support/vacancy-team-db';
import { write } from './vacancy-edit';

export const tc = messages.vacancies.contentEdit;
export const tr = messages.richText;
export const RECRUITER = 'recruiter1.gambling@demo';
export const textDoc = (text: string): RichTextDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

async function createContentFixture() {
  const fixture = await addTeamFixture({
    title: `E2E-CONTENT-${randomUUID()}`,
    status: 'OPEN',
    teamLead: 'vasyl.tl@demo',
    recruiters: [RECRUITER],
  });
  const description = `Published description ${fixture.id}`;
  return { ...fixture, description };
}
export type ContentFixture = Awaited<ReturnType<typeof createContentFixture>>;

export const test = base.extend<{ vacancy: ContentFixture }>({
  vacancy: async ({ page }, run) => {
    const vacancy = await createContentFixture();
    try {
      await withOwner(
        (sql) => sql`
          update app.vacancy
          set description_doc = ${sql.json(textDoc(vacancy.description))}, requirements_doc = null
          where id = ${vacancy.id}`,
      );
      await run(vacancy);
    } finally {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await withOwner(
        (sql) => sql`
          update app.vacancy
          set deleted_at = now(), deleted_by = created_by, delete_reason = 'E2E content cleanup'
          where id = ${vacancy.id} and title = ${vacancy.title} and deleted_at is null`,
      );
    }
  },
});

/** The built Tiptap runtime chunk; its options are the only stable signature in minified output. */
export async function editorRuntimePath() {
  const directory = join(process.cwd(), '.next/static/chunks');
  const names = (await readdir(directory)).filter((name) =>
    name.endsWith('.js'),
  );
  const sources = await Promise.all(
    names.map(async (name) => ({
      name,
      source: await readFile(join(directory, name), 'utf8'),
    })),
  );
  const matches = sources.filter(({ source }) =>
    source.includes('immediatelyRender:!1,shouldRerenderOnTransaction:!1'),
  );
  expect(matches).toHaveLength(1);
  return `/_next/static/chunks/${matches[0]!.name}`;
}

export const contentPath = (id: string) => `/vacancies/${id}/content/edit`;
export const contentUrl = (id: string) =>
  new RegExp(`/api/v1/vacancies/${id}/content$`);
export const editor = (page: Page, field: 'description' | 'requirements') =>
  page.getByRole('textbox', { name: tc[field], exact: true });
export const fieldSection = (
  page: Page,
  field: 'description' | 'requirements',
) =>
  page
    .locator('[data-slot="form-field"]')
    .filter({ has: page.locator(`#vacancy-content-${field}`) })
    .locator('..');
export const saveContent = (page: Page) =>
  page.getByRole('button', { name: tc.save, exact: true });
export const saved = (page: Page) =>
  page.getByRole('status').filter({ hasText: tc.saved });

export async function openContent(page: Page, vacancy: ContentFixture) {
  await openHydrated(page, contentPath(vacancy.id));
  await expect(editor(page, 'description')).toHaveAttribute(
    'contenteditable',
    'true',
  );
  await expect(editor(page, 'requirements')).toHaveAttribute(
    'contenteditable',
    'true',
  );
  await expect(editor(page, 'description')).toContainText(vacancy.description);
}

export async function replaceText(control: Locator, text: string) {
  await control.click();
  await control.press('ControlOrMeta+a');
  await control.press('Backspace');
  if (text) await control.pressSequentially(text);
}

export const contentWrites = (page: Page, id: string) => {
  const seen: Request[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PATCH' && contentUrl(id).test(request.url()))
      seen.push(request);
  });
  return seen;
};

export async function readContent(api: APIRequestContext, id: string) {
  const response = await api.get(`/api/v1/vacancies/${id}/content`);
  expect(response.status(), await response.text()).toBe(200);
  return vacancyContentReadSchema.parse(await response.json());
}

export async function changeContent(
  api: APIRequestContext,
  id: string,
  changes: Omit<UpdateVacancyContentInput, 'expectedVersion'>,
) {
  const before = await readContent(api, id);
  const response = await api.patch(`/api/v1/vacancies/${id}/content`, {
    headers: write(),
    data: { expectedVersion: before.version, ...changes },
  });
  expect(response.status(), await response.text()).toBe(200);
  return vacancyContentSchema.parse(await response.json());
}

export async function revalidateContent(page: Page, id: string) {
  const response = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      contentUrl(id).test(response.url()),
  );
  await page.evaluate(() => {
    window.dispatchEvent(new Event('visibilitychange'));
  });
  return response;
}

export const setContentStatus = (
  vacancy: ContentFixture,
  status: 'ON_HOLD' | 'FILLED' | 'CANCELLED',
) =>
  withOwner(
    (sql) => sql`
      update app.vacancy set status = ${status},
        cancelled_at = case when ${status} = 'CANCELLED'
          then '2026-11-13T09:00:00Z'::timestamptz else null end,
        closed_at = case when ${status} in ('FILLED', 'CANCELLED')
          then '2026-11-13T09:00:00Z'::timestamptz else null end
      where id = ${vacancy.id} and title = ${vacancy.title}`,
  );
