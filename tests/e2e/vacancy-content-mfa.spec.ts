import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { expect, type APIResponse, type Page } from '@playwright/test';
import { z } from 'zod';
import { FIXED_CLOCK_ISO } from '../../lib/fixed-clock';
import { mfaStatusResponseSchema } from '../../lib/schemas/auth';
import {
  updateVacancyContentSchema,
  vacancyContentReadSchema,
  vacancyContentSchema,
} from '../../lib/schemas/vacancy-content';
import type { vacancy as vacancyTable } from '../../server/db/schema';
import { DEMO_VERTICALS, demoId } from '../../server/db/seed';
import { demoPositionId } from '../../server/db/seed/vacancies';
import { signIn } from '../support/e2e-session';
import { requireLoopbackUrl } from '../support/loopback';
import { withOwner } from '../support/vacancy-request-db';
import {
  contentPath,
  contentUrl,
  contentWrites,
  editor,
  openContent,
  readContent,
  replaceText,
  saveContent,
  saved,
  test as base,
  textDoc,
  type ContentFixture,
} from './support/vacancy-content';
import { write } from './support/vacancy-edit';

type LowerRole = 'HEAD_RECRUITER' | 'RECRUITER' | 'TEAM_LEAD';
type Actor = { id: string; email: string; authId: string };
type Stored = Pick<
  typeof vacancyTable.$inferSelect,
  'version' | 'descriptionDoc' | 'requirementsDoc'
> & { events: number; updates: number };
const problem = z.object({ code: z.string() });

function localAuthAdmin() {
  const env = {
    ...(existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {}),
    ...process.env,
  };
  const url = requireLoopbackUrl('SUPABASE_URL', env.SUPABASE_URL);
  if (!env.SUPABASE_SECRET_KEY)
    throw new Error(
      'Isolated MFA actors require the local Supabase secret key',
    );
  return createClient(url, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth.admin;
}

async function provisionActor(
  actor: Actor,
  role: LowerRole,
  vacancy: ContentFixture,
) {
  await withOwner((sql) =>
    sql.begin(async (tx) => {
      await tx`
        insert into app.app_user (id, auth_user_id, email, full_name, activated_at)
        values (${actor.id}, ${actor.authId}, ${actor.email}, 'E2E Content MFA', ${FIXED_CLOCK_ISO})`;
      await tx`
        insert into app.user_role (user_id, role, vertical_id)
        values (${actor.id}, 'ADMIN', null), (${actor.id}, ${role}, ${DEMO_VERTICALS.gambling})`;
      if (role === 'RECRUITER') {
        await tx`delete from app.vacancy_recruiter where vacancy_id = ${vacancy.id}`;
        await tx`
          insert into app.vacancy_recruiter (vacancy_id, user_id, assigned_by)
          values (${vacancy.id}, ${actor.id}, ${demoId('user:head.recruiter.gambling@demo')})`;
      }
      if (role === 'TEAM_LEAD')
        await tx`
          update app.vacancy set team_lead_id = ${actor.id}
          where id = ${vacancy.id} and title = ${vacancy.title}`;
    }),
  );
}

const test = base.extend<{ actor: Actor; lowerRole: LowerRole }>({
  lowerRole: ['RECRUITER', { option: true }],
  actor: async ({ lowerRole, page, vacancy }, run) => {
    await withOwner(async (sql) => sql`select 1`);
    const admin = localAuthAdmin();
    const id = randomUUID();
    const email = `e2e-content-mfa-${id}@fixture.test`;
    const created = await admin.createUser({ email, email_confirm: true });
    if (created.error || !created.data.user)
      throw new Error('Could not create the isolated local MFA actor');
    const actor = { id, email, authId: created.data.user.id };
    try {
      await provisionActor(actor, lowerRole, vacancy);
      await signIn(page.request, email);
      await run(actor);
    } finally {
      try {
        await withOwner((sql) =>
          sql.begin(async (tx) => {
            await tx`delete from app.user_role where user_id = ${id}`;
            await tx`
              update app.user_session set ended_at = now(), end_reason = 'USER'
              where user_id = ${id} and ended_at is null`;
            // Append-only audit references retain the inactive fixture identity.
            await tx`
              update app.app_user set is_active = false, deactivated_at = now(), auth_user_id = null
              where id = ${id} and email = ${email}`;
          }),
        );
      } finally {
        const removed = await admin.deleteUser(actor.authId);
        expect(removed.error).toBeNull();
      }
    }
  },
});

async function restrictedFixtures() {
  const targets = [
    {
      id: randomUUID(),
      title: `E2E-CONTENT-MFA-FOREIGN-${randomUUID()}`,
      vertical: DEMO_VERTICALS.crypto,
      position: demoPositionId('crypto-trader'),
      status: 'OPEN',
    },
    {
      id: randomUUID(),
      title: `E2E-CONTENT-MFA-PRIVATE-${randomUUID()}`,
      vertical: DEMO_VERTICALS.gambling,
      position: demoPositionId('gambling-media-buyer-facebook'),
      status: 'DRAFT',
    },
  ];
  await withOwner((sql) =>
    sql.begin(async (tx) => {
      for (const target of targets)
        await tx`
          insert into app.vacancy (
            id, vertical_id, position_id, title, status, recruiter_initiated, created_by,
            description_doc, opened_at
          ) values (
            ${target.id}, ${target.vertical}, ${target.position}, ${target.title}, ${target.status}, true,
            ${demoId('user:recruiter2.gambling@demo')}, ${tx.json(textDoc(target.title))},
            ${target.status === 'OPEN' ? FIXED_CLOCK_ISO : null}
          )`;
    }),
  );
  return targets;
}

async function stored(id: string) {
  return withOwner(async (sql) => {
    const rows = await sql<Stored[]>`
      select version, description_doc as "descriptionDoc", requirements_doc as "requirementsDoc",
        (select count(*)::int from app.entity_event where vacancy_id = ${id}) as events,
        (select count(*)::int from app.audit_log
          where entity_id = ${id} and action = 'vacancy.updated' and result = 'SUCCESS') as updates
      from app.vacancy where id = ${id}`;
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (!row) throw new Error('Expected the exact vacancy fixture');
    return row;
  });
}

async function denied(answer: APIResponse, status: number, code: string) {
  expect(answer.status(), await answer.text()).toBe(status);
  expect(problem.parse(await answer.json()).code).toBe(code);
}

const contentResponse = (page: Page, id: string, method: 'GET' | 'PATCH') =>
  page.waitForResponse(
    (answer) =>
      answer.request().method() === method && contentUrl(id).test(answer.url()),
  );

test.use({ storageState: { cookies: [], origins: [] } });

for (const role of [
  'HEAD_RECRUITER',
  'RECRUITER',
  'TEAM_LEAD',
] satisfies LowerRole[])
  test.describe(`Admin + ${role} at aal1 [VAC-08, D63, ADR-020]`, () => {
    test.use({ lowerRole: role });

    test('keeps the independent content grant, withholds global scope, then gates pure Admin without mutation', async ({
      page,
      vacancy,
      actor,
    }) => {
      const status = await page.request.get('/api/v1/auth/mfa');
      expect(status.status()).toBe(200);
      expect(mfaStatusResponseSchema.parse(await status.json())).toMatchObject({
        aal: 'aal1',
        required: true,
        hasOtherGrants: true,
        factors: [],
      });
      const hidden = await restrictedFixtures();
      try {
        for (const target of hidden) {
          const before = await stored(target.id);
          await denied(
            await page.request.get(`/api/v1/vacancies/${target.id}/content`),
            404,
            'NOT_FOUND',
          );
          await denied(
            await page.request.patch(`/api/v1/vacancies/${target.id}/content`, {
              headers: write(),
              data: {
                expectedVersion: before.version,
                descriptionDoc: textDoc('Forbidden global write'),
              },
            }),
            404,
            'NOT_FOUND',
          );
          expect(await stored(target.id)).toEqual(before);
          const navigation = await page.goto(contentPath(target.id));
          expect(navigation?.status()).toBe(404);
          await expect(page.getByRole('textbox')).toHaveCount(0);
          await expect(
            page.getByText(target.title, { exact: true }),
          ).toHaveCount(0);
        }

        const baseline = await readContent(page.request, vacancy.id);
        expect(baseline.canEditContent).toBe(true);
        const loaded = contentResponse(page, vacancy.id, 'GET');
        await openContent(page, vacancy);
        const read = await loaded;
        expect(read.status()).toBe(200);
        expect(vacancyContentReadSchema.parse(await read.json())).toEqual(
          baseline,
        );
        const sent = contentWrites(page, vacancy.id);
        const descriptionDoc = textDoc(`Saved description ${role}`);
        const requirementsDoc = textDoc(`Saved requirements ${role}`);
        await replaceText(
          editor(page, 'description'),
          `Saved description ${role}`,
        );
        await replaceText(
          editor(page, 'requirements'),
          `Saved requirements ${role}`,
        );
        const accepted = contentResponse(page, vacancy.id, 'PATCH');
        await saveContent(page).click();
        const answer = await accepted;
        expect(answer.status()).toBe(200);
        expect(
          updateVacancyContentSchema.parse(answer.request().postDataJSON()),
        ).toEqual({
          expectedVersion: baseline.version,
          descriptionDoc,
          requirementsDoc,
        });
        const canonical = vacancyContentSchema.parse(await answer.json());
        expect(canonical).toMatchObject({
          version: baseline.version + 1,
          descriptionDoc,
          requirementsDoc,
        });
        await expect(saved(page)).toBeVisible();
        expect(await readContent(page.request, vacancy.id)).toMatchObject(
          canonical,
        );
        expect(sent).toHaveLength(1);

        await replaceText(
          editor(page, 'requirements'),
          'Unsaved pure Admin buffer',
        );
        const removed = await withOwner(
          (sql) => sql`
          delete from app.user_role where user_id = ${actor.id} and role = ${role}
            and vertical_id = ${DEMO_VERTICALS.gambling} returning id`,
        );
        expect(removed).toHaveLength(1);
        const pure = await page.request.get('/api/v1/auth/mfa');
        expect(pure.status()).toBe(200);
        expect(mfaStatusResponseSchema.parse(await pure.json())).toMatchObject({
          aal: 'aal1',
          required: true,
          hasOtherGrants: false,
        });
        const beforeDenied = await stored(vacancy.id);
        expect(beforeDenied).toEqual({
          version: canonical.version,
          descriptionDoc,
          requirementsDoc,
          events: 1,
          updates: 1,
        });
        await denied(
          await page.request.get(`/api/v1/vacancies/${vacancy.id}/content`),
          401,
          'MFA_REQUIRED',
        );
        const rejected = contentResponse(page, vacancy.id, 'PATCH');
        await saveContent(page).click();
        const failure = await rejected;
        expect(failure.status()).toBe(401);
        expect(problem.parse(await failure.json()).code).toBe('MFA_REQUIRED');
        expect(
          updateVacancyContentSchema.parse(failure.request().postDataJSON()),
        ).toEqual({
          expectedVersion: canonical.version,
          requirementsDoc: textDoc('Unsaved pure Admin buffer'),
        });
        await expect(page).toHaveURL(/\/mfa\/setup(?:\?|$)/);
        await expect(editor(page, 'description')).toHaveCount(0);
        await expect(editor(page, 'requirements')).toHaveCount(0);
        await expect(page.getByText('Unsaved pure Admin buffer')).toHaveCount(
          0,
        );
        expect(sent).toHaveLength(2);
        expect(await stored(vacancy.id)).toEqual(beforeDenied);
        await page.goto(contentPath(vacancy.id));
        await expect(page).toHaveURL(/\/mfa\/setup(?:\?|$)/);
        expect(sent).toHaveLength(2);
        expect(await stored(vacancy.id)).toEqual(beforeDenied);
      } finally {
        await withOwner(async (sql) => {
          for (const target of hidden)
            await sql`
              update app.vacancy set deleted_at = now(), deleted_by = created_by,
                delete_reason = 'E2E content MFA cleanup'
              where id = ${target.id} and title = ${target.title} and deleted_at is null`;
        });
      }
    });
  });
