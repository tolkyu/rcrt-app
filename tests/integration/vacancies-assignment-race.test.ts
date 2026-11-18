import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { positionNameKey } from '../../lib/position-name';
import * as schema from '../../server/db/schema';
import {
  assignVacancyRecruiters,
  claimVacancy,
} from '../../server/services/vacancy-assignment';
import { createLockRace } from '../support/lock-race';
import {
  contextFor,
  problem,
  type Roles,
} from '../support/vacancy-write-harness';
import { WORLD_OPENED_AT } from '../support/vacancy-world';
import { connectTestDatabase, testDatabaseUrls } from './database';

const urls = testDatabaseUrls();
const admin = connectTestDatabase(urls.migration);
const probe = connectTestDatabase(urls.migration);
const client = postgres(urls.runtime, { max: 8, prepare: false });
const db = drizzle(client, { schema });
const raceWithLock = createLockRace(admin, probe);
let verticalId: string;
let positionId: string;
let recruiterRoles: Roles;
let headRoles: Roles;

beforeAll(async () => {
  verticalId = randomUUID();
  positionId = randomUUID();
  const owner = randomUUID();
  const name = `Гонка команди ${verticalId.slice(0, 8)}`;
  recruiterRoles = [{ role: 'RECRUITER', verticalId }];
  headRoles = [{ role: 'HEAD_RECRUITER', verticalId }];
  await admin`insert into app.vertical (id, name) values (${verticalId}, ${`Світ ${name}`})`;
  await admin`insert into app.app_user (id, email, full_name) values (${owner}, ${`${owner}@fixture.test`}, 'Власник позиції')`;
  await admin`insert into app.position (id, vertical_id, name, name_key, created_by)
    values (${positionId}, ${verticalId}, ${name}, ${positionNameKey(name)}, ${owner})`;
});
afterAll(async () => {
  await Promise.all([admin.end(), probe.end(), client.end()]);
});

async function newUser(role: 'RECRUITER' | 'HEAD_RECRUITER') {
  const id = randomUUID();
  await admin`insert into app.app_user (id, email, full_name, activated_at) values (${id}, ${`${id}@fixture.test`}, 'Учасник гонки', now())`;
  await admin`insert into app.user_role (user_id, role, vertical_id) values (${id}, ${role}, ${verticalId})`;
  return id;
}
async function newVacancy(createdBy: string) {
  const id = randomUUID();
  await admin`insert into app.vacancy (id, vertical_id, position_id, title, recruiter_initiated, status, opened_at, created_by)
    values (${id}, ${verticalId}, ${positionId}, 'Гонка команди', true, 'OPEN', ${WORLD_OPENED_AT}, ${createdBy})`;
  return id;
}
const ctxFor = (userId: string, roles: Roles) => contextFor(db, userId, roles);
const recruitersOf = async (id: string) =>
  (
    await admin`select user_id from app.vacancy_recruiter where vacancy_id = ${id}`
  ).map((row) => row.user_id as string);
const countOf = async (id: string, type: string) =>
  (
    await admin`select count(*)::int as n from app.entity_event where vacancy_id = ${id} and type = ${type}`
  )[0]!.n as number;
const auditCount = async (id: string) =>
  (
    await admin`select count(*)::int as n from app.audit_log where entity_id = ${id}::text`
  )[0]!.n as number;

/** Holds the vacancy row lock until `n` statements queue behind it, so the competing writes meet at the lock instead of racing by chance. */
async function withQueuedWrites<T>(
  id: string,
  n: number,
  start: () => Promise<T>,
): Promise<T> {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let locked: () => void = () => undefined;
  const holding = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const session = admin.begin(async (tx) => {
    await tx`select id from app.vacancy where id = ${id} for no key update`;
    locked();
    await held;
  });
  await holding;
  const running = start();
  const deadline = Date.now() + 10_000;
  for (;;) {
    const [row] = await probe`select count(*)::int as n from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock'
        and state = 'active' and query ilike '%from "app"."vacancy"%for no key update%'`;
    if ((row!.n as number) >= n) break;
    if (Date.now() > deadline) {
      release();
      await session;
      await running.catch(() => undefined);
      throw new Error('The writes never queued behind the vacancy lock');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  release();
  await session;
  return running;
}

describe('Claim and assignment races on committed rows [ADR-017 order and locks]', () => {
  it('two Recruiters claim one vacancy at the lock: one row, the loser 409 VACANCY_ALREADY_ASSIGNED, one event and one audit row', async () => {
    const [a, b] = [await newUser('RECRUITER'), await newUser('RECRUITER')];
    const id = await newVacancy(a);
    const settled = await withQueuedWrites(id, 2, () =>
      Promise.allSettled([
        claimVacancy(ctxFor(a, recruiterRoles), id, {}),
        claimVacancy(ctxFor(b, recruiterRoles), id, {}),
      ]),
    );
    const winners = settled.filter((r) => r.status === 'fulfilled');
    expect(winners).toHaveLength(1);
    const loser = settled.find((r) => r.status === 'rejected')!;
    expect(await problem(Promise.reject(loser.reason))).toMatchObject({
      status: 409,
      code: 'VACANCY_ALREADY_ASSIGNED',
    });
    const winner = (winners[0] as PromiseFulfilledResult<{ version: number }>)
      .value;
    expect(winner.version).toBe(2);
    expect(await recruitersOf(id)).toHaveLength(1);
    expect(await countOf(id, 'vacancy.recruiter_assigned')).toBe(1);
    expect(await auditCount(id)).toBe(1);
  });

  it('the winner repeating the claim after the commit is a 200 no-op', async () => {
    const a = await newUser('RECRUITER');
    const id = await newVacancy(a);
    await claimVacancy(ctxFor(a, recruiterRoles), id, {});
    expect(await claimVacancy(ctxFor(a, recruiterRoles), id, {})).toMatchObject(
      { version: 2 },
    );
    expect(await countOf(id, 'vacancy.recruiter_assigned')).toBe(1);
  });

  it('a claim and a manager assignment at the lock: one of them wins, never two rows from a claim, the loser is 409', async () => {
    const [a, b, head] = [
      await newUser('RECRUITER'),
      await newUser('RECRUITER'),
      await newUser('HEAD_RECRUITER'),
    ];
    const id = await newVacancy(head);
    const [claimed, assigned] = await withQueuedWrites(id, 2, () =>
      Promise.allSettled([
        claimVacancy(ctxFor(a, recruiterRoles), id, {}),
        assignVacancyRecruiters(ctxFor(head, headRoles), id, {
          recruiterIds: [b],
          expectedVersion: 1,
        }),
      ]),
    );
    const members = await recruitersOf(id);
    const version = (
      await admin`select version from app.vacancy where id = ${id}`
    )[0]!.version as number;
    if (claimed.status === 'fulfilled') {
      expect(assigned.status).toBe('rejected');
      expect(
        await problem(
          Promise.reject((assigned as PromiseRejectedResult).reason),
        ),
      ).toMatchObject({ status: 409, code: 'STALE_STATE' });
      expect(members).toEqual([a]);
    } else {
      expect(assigned.status).toBe('fulfilled');
      expect(
        await problem(
          Promise.reject((claimed as PromiseRejectedResult).reason),
        ),
      ).toMatchObject({ status: 409, code: 'VACANCY_ALREADY_ASSIGNED' });
      expect(members).toEqual([b]);
    }
    expect(version).toBe(2);
    expect(await countOf(id, 'vacancy.recruiter_assigned')).toBe(1);
  });

  it('a claim queued behind the removal of the caller RECRUITER role is 403 and writes nothing', async () => {
    const a = await newUser('RECRUITER');
    const id = await newVacancy(a);
    const refused = await raceWithLock(
      (tx) => tx`select id from app.app_user where id = ${a} for no key update`,
      async (tx) => {
        await tx`delete from app.user_role where user_id = ${a}`;
      },
      () => problem(claimVacancy(ctxFor(a, recruiterRoles), id, {})),
    );
    expect(refused).toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(await recruitersOf(id)).toEqual([]);
    expect(await countOf(id, 'vacancy.recruiter_assigned')).toBe(0);
    expect(await auditCount(id)).toBe(0);
  });

  it('an assignment queued behind the assignee losing the RECRUITER role is 400 invalid_recruiter and writes nothing', async () => {
    const [target, head] = [
      await newUser('RECRUITER'),
      await newUser('HEAD_RECRUITER'),
    ];
    const id = await newVacancy(head);
    const refused = await raceWithLock(
      (tx) =>
        tx`select id from app.app_user where id = ${target} for no key update`,
      async (tx) => {
        await tx`delete from app.user_role where user_id = ${target}`;
      },
      () =>
        problem(
          assignVacancyRecruiters(ctxFor(head, headRoles), id, {
            recruiterIds: [target],
            expectedVersion: 1,
          }),
        ),
    );
    expect(refused).toEqual({
      status: 400,
      code: 'VALIDATION_FAILED',
      errors: [{ path: 'body.recruiterIds', code: 'invalid_recruiter' }],
    });
    expect(await recruitersOf(id)).toEqual([]);
    expect(await countOf(id, 'vacancy.recruiter_assigned')).toBe(0);
    expect(await auditCount(id)).toBe(0);
  });

  it('an assignment queued behind the assignee deactivation is 400 invalid_recruiter', async () => {
    const [target, head] = [
      await newUser('RECRUITER'),
      await newUser('HEAD_RECRUITER'),
    ];
    const id = await newVacancy(head);
    const refused = await raceWithLock(
      (tx) =>
        tx`select id from app.app_user where id = ${target} for no key update`,
      async (tx) => {
        await tx`update app.app_user set is_active = false, deactivated_at = now() where id = ${target}`;
      },
      () =>
        problem(
          assignVacancyRecruiters(ctxFor(head, headRoles), id, {
            recruiterIds: [target],
            expectedVersion: 1,
          }),
        ),
    );
    expect(refused).toMatchObject({ status: 400 });
    expect(await recruitersOf(id)).toEqual([]);
  });
});
