import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { positionNameKey } from '../../lib/position-name';
import { requestVacancySchema } from '../../lib/schemas/vacancy-request';
import * as schema from '../../server/db/schema';
import { requestVacancy } from '../../server/services/vacancy-request';
import { createLockRace } from '../support/lock-race';
import { contextFor, problem } from '../support/vacancy-write-harness';
import { connectTestDatabase, testDatabaseUrls } from './database';

/** Commits its own fixtures on purpose (events keep a foreign key to their vertical), so leftover rows in the disposable database are intentional. */
const urls = testDatabaseUrls();
const admin = connectTestDatabase(urls.migration);
const probe = connectTestDatabase(urls.migration);
const client = postgres(urls.runtime, { max: 8, prepare: false });
const raceWithLock = createLockRace(admin, probe);
const db = () => drizzle(client, { schema });

let verticalId: string;
let creatorId: string;
let positionId: string;

beforeAll(async () => {
  const name = `Паралельний запит ${randomUUID().slice(0, 8)}`;
  verticalId = randomUUID();
  creatorId = randomUUID();
  await admin`insert into app.vertical (id, name) values (${verticalId}, ${`Світ ${name}`})`;
  await admin`insert into app.app_user (id, email, full_name) values (${creatorId}, ${`${creatorId}@fixture.test`}, 'Автор каталогу')`;
  positionId = await newPosition(name);
});
afterAll(async () => {
  await Promise.all([admin.end(), probe.end(), client.end()]);
});

async function newPosition(name: string) {
  const id = randomUUID();
  await admin`insert into app.position (id, vertical_id, name, name_key, created_by)
    values (${id}, ${verticalId}, ${name}, ${positionNameKey(name)}, ${creatorId})`;
  return id;
}

async function newTeamLead() {
  const id = randomUUID();
  await admin`insert into app.app_user (id, email, full_name, activated_at) values (${id}, ${`${id}@fixture.test`}, 'Тімлід запиту', now())`;
  await admin`insert into app.user_role (user_id, role, vertical_id) values (${id}, 'TEAM_LEAD', ${verticalId})`;
  return id;
}

const contextOf = (userId: string) =>
  contextFor(db(), userId, [{ role: 'TEAM_LEAD', verticalId }]);
const request = (userId: string, target = positionId, key = randomUUID()) =>
  requestVacancy(
    contextOf(userId),
    requestVacancySchema.parse({ positionId: target }),
    key,
  );
const lockUser = (userId: string) => (tx: postgres.TransactionSql) =>
  tx`select id from app.app_user where id = ${userId} for no key update`;
const lockPosition = (id: string) => (tx: postgres.TransactionSql) =>
  tx`select id from app.position where id = ${id} for no key update`;

async function traces(userId: string) {
  const [stored] =
    await admin`select count(*)::int as n from app.vacancy where created_by = ${userId}`;
  const [events] =
    await admin`select count(*)::int as n from app.entity_event where actor_id = ${userId}`;
  const [audits] =
    await admin`select count(*)::int as n from app.audit_log where actor_id = ${userId}`;
  const [keys] =
    await admin`select count(*)::int as n from app.idempotency_key where user_id = ${userId}`;
  return {
    vacancies: stored!.n as number,
    events: events!.n as number,
    audits: audits!.n as number,
    keys: keys!.n as number,
  };
}
const nothingWritten = { vacancies: 0, events: 0, audits: 0, keys: 0 };

describe('Team Lead request racing a committed eligibility change [STORY-VAC-03-3, D122, T-4]', () => {
  it.each([
    [
      'deactivation',
      async (tx: postgres.TransactionSql, id: string) => {
        await tx`update app.app_user set is_active = false, deactivated_at = now() where id = ${id}`;
      },
    ],
    [
      'role removal',
      async (tx: postgres.TransactionSql, id: string) => {
        await tx`delete from app.user_role where user_id = ${id}`;
      },
    ],
    [
      'invite acceptance reset',
      async (tx: postgres.TransactionSql, id: string) => {
        await tx`update app.app_user set activated_at = null where id = ${id}`;
      },
    ],
  ])(
    'a request queued behind an in-flight %s creates nothing',
    async (_name, change) => {
      const leadId = await newTeamLead();
      const refused = await raceWithLock(
        lockUser(leadId),
        (tx) => change(tx, leadId),
        () => problem(request(leadId)),
      );
      expect(refused).toMatchObject({ status: 403 });
      expect(await traces(leadId)).toEqual(nothingWritten);
    },
  );

  it('a request queued behind an in-flight position deactivation creates nothing and keeps no key', async () => {
    const leadId = await newTeamLead();
    const target = await newPosition(
      `Закривається ${randomUUID().slice(0, 8)}`,
    );
    const refused = await raceWithLock(
      lockPosition(target),
      async (tx) => {
        await tx`update app.position set is_active = false where id = ${target}`;
      },
      () => problem(request(leadId, target)),
    );
    expect(refused).toMatchObject({
      status: 400,
      errors: [{ path: 'body.positionId', code: 'position_inactive' }],
    });
    expect(await traces(leadId)).toEqual(nothingWritten);
  });

  it('a request queued behind an unrelated in-flight user change still creates the vacancy', async () => {
    const leadId = await newTeamLead();
    const created = await raceWithLock(
      lockUser(leadId),
      async (tx) => {
        await tx`update app.app_user set full_name = 'Перейменований тімлід' where id = ${leadId}`;
      },
      () => request(leadId),
    );
    expect(created).toMatchObject({ status: 'OPEN', teamLead: { id: leadId } });
    expect(await traces(leadId)).toEqual({
      vacancies: 1,
      events: 1,
      audits: 1,
      keys: 1,
    });
  });

  it('a request queued behind an unrelated in-flight position change still creates the vacancy', async () => {
    const leadId = await newTeamLead();
    const target = await newPosition(
      `Перейменовується ${randomUUID().slice(0, 8)}`,
    );
    const created = await raceWithLock(
      lockPosition(target),
      async (tx) => {
        await tx`update app.position set updated_at = now() where id = ${target}`;
      },
      () => request(leadId, target),
    );
    expect(created).toMatchObject({ status: 'OPEN', position: { id: target } });
    expect(await traces(leadId)).toMatchObject({ vacancies: 1, keys: 1 });
  });

  it('five simultaneous requests with one key create exactly one vacancy and all return it', async () => {
    const leadId = await newTeamLead();
    const sharedKey = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => request(leadId, positionId, sharedKey)),
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(await traces(leadId)).toEqual({
      vacancies: 1,
      events: 1,
      audits: 1,
      keys: 1,
    });
  });
});
