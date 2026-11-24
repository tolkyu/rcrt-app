import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../../server/db/schema';
import { unassignVacancyRecruiter } from '../../server/services/vacancy-assignment';
import { updateVacancyContent } from '../../server/services/vacancy-content';
import { createLockRace } from '../support/lock-race';
import {
  contextFor,
  problem,
  type Roles,
} from '../support/vacancy-write-harness';
import {
  createVacancyWorld,
  type VacancyWorld,
} from '../support/vacancy-world';
import { connectTestDatabase, testDatabaseUrls } from './database';

const urls = testDatabaseUrls();
const admin = connectTestDatabase(urls.migration);
const probe = connectTestDatabase(urls.migration);
const client = postgres(urls.runtime, { max: 8, prepare: false });
const db = drizzle(client, { schema });
const race = createLockRace(admin, probe);
let world: VacancyWorld;
const doc = (text: string) => ({
  type: 'doc' as const,
  content: [
    { type: 'paragraph' as const, content: [{ type: 'text' as const, text }] },
  ],
});
const input = {
  expectedVersion: 1,
  descriptionDoc: doc('Private race content'),
};
beforeAll(async () => {
  world = await createVacancyWorld(admin);
});
afterAll(async () => {
  await Promise.all([admin.end(), probe.end(), client.end()]);
});
async function actor(roles: Roles) {
  const id = randomUUID();
  await admin`insert into app.app_user (id, email, full_name, activated_at) values (${id}, ${`${id}@fixture.test`}, 'Content race actor', now())`;
  for (const role of roles)
    await admin`insert into app.user_role (user_id, role, vertical_id) values (${id}, ${role.role}, ${role.verticalId})`;
  return id;
}
const recRoles = (): Roles => [
  { role: 'RECRUITER', verticalId: world.verticals.v1 },
];
const headRoles = (): Roles => [
  { role: 'HEAD_RECRUITER', verticalId: world.verticals.v1 },
];
const state = async (id: string) =>
  (
    await admin`select version, status, description_doc from app.vacancy where id = ${id}`
  )[0];
const counts = async (id: string) =>
  (
    await admin`select
  (select count(*)::int from app.entity_event where vacancy_id = ${id} and type = 'vacancy.updated') as events,
  (select count(*)::int from app.audit_log where entity_id = ${id}::text and action = 'vacancy.updated') as audits`
  )[0];
const members = async (id: string) =>
  (
    await admin`select user_id from app.vacancy_recruiter where vacancy_id = ${id} order by user_id`
  ).map((row) => row.user_id);

describe('serialized content writes [ADR-018]', () => {
  it('two content writers from one version commit one document and exactly one history pair', async () => {
    const who = await actor(headRoles());
    const id = await world.addVacancy();
    const ctx = contextFor(db, who, headRoles());
    const results = await race(
      (tx) =>
        tx`select id from app.app_user where id = ${who} for no key update`,
      async () => {},
      () =>
        Promise.allSettled([
          updateVacancyContent(ctx, id, input),
          updateVacancyContent(ctx, id, {
            ...input,
            descriptionDoc: doc('Other private content'),
          }),
        ]),
    );
    const winners = results.filter((r) => r.status === 'fulfilled');
    expect(winners).toHaveLength(1);
    const loser = results.find((r) => r.status === 'rejected');
    if (!loser) throw new Error('Expected a stale loser');
    expect(await problem(Promise.reject(loser.reason))).toEqual({
      status: 409,
      code: 'STALE_STATE',
    });
    expect(await state(id)).toMatchObject({
      version: 2,
      description_doc: winners[0]!.value.descriptionDoc,
    });
    expect(await counts(id)).toEqual({ events: 1, audits: 1 });
  });
  it('unassignment commits first, retains another recruiter, and denies the editor before stale/no-op', async () => {
    const who = await actor(recRoles());
    const id = await world.addVacancy({}, [who, world.users.recB]);
    const ctx = contextFor(db, who, recRoles());
    const refused = await race(
      (tx) =>
        tx`select id from app.app_user where id = ${who} for no key update`,
      async (tx) => {
        await tx`select id from app.vacancy where id = ${id} for no key update`;
        await tx`delete from app.vacancy_recruiter where vacancy_id = ${id} and user_id = ${who}`;
        await tx`update app.vacancy set version = version + 1 where id = ${id}`;
      },
      () =>
        problem(
          updateVacancyContent(ctx, id, {
            expectedVersion: 1,
            descriptionDoc: null,
          }),
        ),
    );
    expect(refused).toEqual({ status: 403, code: 'FORBIDDEN' });
    expect(await members(id)).toEqual([world.users.recB]);
    expect(await state(id)).toMatchObject({
      version: 2,
      description_doc: null,
    });
    expect(await counts(id)).toEqual({ events: 0, audits: 0 });
  });
  it('unassignment cannot cancel an independently applicable Team Lead grant', async () => {
    const roles: Roles = [
      ...recRoles(),
      { role: 'TEAM_LEAD', verticalId: world.verticals.v1 },
    ];
    const who = await actor(roles);
    const id = await world.addVacancy({ team_lead_id: who }, [
      who,
      world.users.recB,
    ]);
    const ctx = contextFor(db, who, roles);
    const result = await race(
      (tx) =>
        tx`select id from app.app_user where id = ${who} for no key update`,
      async (tx) => {
        await tx`select id from app.vacancy where id = ${id} for no key update`;
        await tx`delete from app.vacancy_recruiter where vacancy_id = ${id} and user_id = ${who}`;
        await tx`update app.vacancy set version = version + 1 where id = ${id}`;
      },
      () => updateVacancyContent(ctx, id, { ...input, expectedVersion: 2 }),
    );
    expect(result.version).toBe(3);
    expect(await members(id)).toEqual([world.users.recB]);
    expect(await counts(id)).toEqual({ events: 1, audits: 1 });
  });
  it('content that commits first makes a queued unassignment stale', async () => {
    const who = await actor(recRoles());
    const manager = await actor(headRoles());
    const id = await world.addVacancy({}, [who, world.users.recB]);
    const refused = await race(
      (tx) =>
        tx`select id from app.app_user where id = ${manager} for no key update`,
      async (tx) => {
        await tx`select id from app.vacancy where id = ${id} for no key update`;
        await tx`update app.vacancy set description_doc = ${tx.json(input.descriptionDoc)}, version = version + 1 where id = ${id}`;
      },
      () =>
        problem(
          unassignVacancyRecruiter(
            contextFor(db, manager, headRoles()),
            id,
            who,
            { expectedVersion: 1 },
          ),
        ),
    );
    expect(refused).toEqual({ status: 409, code: 'STALE_STATE' });
    expect(await members(id)).toEqual([who, world.users.recB].sort());
    expect(await counts(id)).toEqual({ events: 0, audits: 0 });
  });
  it('status close commits first, then authorized content is locked even with a stale version', async () => {
    const who = await actor(headRoles());
    const id = await world.addVacancy();
    const refused = await race(
      (tx) =>
        tx`select id from app.app_user where id = ${who} for no key update`,
      async (tx) => {
        await tx`select id from app.vacancy where id = ${id} for no key update`;
        await tx`update app.vacancy set status = 'CANCELLED', closed_at = now(), cancelled_at = now(), version = version + 1 where id = ${id}`;
      },
      () =>
        problem(
          updateVacancyContent(contextFor(db, who, headRoles()), id, input),
        ),
    );
    expect(refused).toEqual({ status: 409, code: 'VACANCY_CONTENT_LOCKED' });
    expect(await state(id)).toMatchObject({
      status: 'CANCELLED',
      version: 2,
      description_doc: null,
    });
    expect(await counts(id)).toEqual({ events: 0, audits: 0 });
  });
  it.each(['role', 'active'] as const)(
    'a queued editor loses %s authorization before mutation',
    async (kind) => {
      const who = await actor(headRoles());
      const id = await world.addVacancy();
      const refused = await race(
        (tx) =>
          tx`select id from app.app_user where id = ${who} for no key update`,
        async (tx) => {
          if (kind === 'role')
            await tx`delete from app.user_role where user_id = ${who}`;
          else
            await tx`update app.app_user set is_active = false, deactivated_at = now() where id = ${who}`;
        },
        () =>
          problem(
            updateVacancyContent(contextFor(db, who, headRoles()), id, input),
          ),
      );
      expect(refused).toEqual({ status: 403, code: 'FORBIDDEN' });
      expect(await state(id)).toMatchObject({
        version: 1,
        description_doc: null,
      });
      expect(await counts(id)).toEqual({ events: 0, audits: 0 });
    },
  );
});

describe('atomic rollback [ADR-018]', () => {
  it('failed audit insertion rolls back content, version and the already appended event', async () => {
    const who = await actor(headRoles());
    const id = await world.addVacancy();
    await admin`create function app.test_content_audit_failure() returns trigger language plpgsql as $$ begin raise exception 'content_history_failure'; end $$`;
    await admin`create trigger test_content_audit_failure before insert on app.audit_log for each row when (new.action = 'vacancy.updated') execute function app.test_content_audit_failure()`;
    try {
      await expect(
        updateVacancyContent(contextFor(db, who, headRoles()), id, input),
      ).rejects.toMatchObject({
        cause: { message: 'content_history_failure' },
      });
      expect(await state(id)).toMatchObject({
        version: 1,
        description_doc: null,
      });
      expect(await counts(id)).toEqual({ events: 0, audits: 0 });
    } finally {
      await admin`drop trigger test_content_audit_failure on app.audit_log`;
      await admin`drop function app.test_content_audit_failure()`;
    }
  });
  it('fresh scope failure rolls back documents, version, history and the scope change', async () => {
    const who = await actor(recRoles());
    const id = await world.addVacancy({}, [who, world.users.recB]);
    await admin`create function app.test_content_scope_loss() returns trigger language plpgsql security definer set search_path = pg_catalog, app as $$ begin delete from app.vacancy_recruiter where vacancy_id = new.id; insert into app.vacancy_recruiter (vacancy_id, user_id, assigned_by) values (new.id, new.created_by, new.created_by); return new; end $$`;
    await admin`create trigger test_content_scope_loss after update on app.vacancy for each row execute function app.test_content_scope_loss()`;
    try {
      expect(
        await problem(
          updateVacancyContent(contextFor(db, who, recRoles()), id, input),
        ),
      ).toEqual({ status: 404, code: 'NOT_FOUND' });
      expect(await state(id)).toMatchObject({
        version: 1,
        description_doc: null,
      });
      expect(await members(id)).toEqual([who, world.users.recB].sort());
      expect(await counts(id)).toEqual({ events: 0, audits: 0 });
    } finally {
      await admin`drop trigger test_content_scope_loss on app.vacancy`;
      await admin`drop function app.test_content_scope_loss()`;
    }
  });
});
