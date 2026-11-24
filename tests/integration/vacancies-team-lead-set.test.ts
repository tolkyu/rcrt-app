import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { ZodError } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { positionNameKey } from '../../lib/position-name';
import { VACANCY_WRITE_RATE_LIMIT } from '../../lib/schemas/vacancy';
import type { RequestContext } from '../../server/context/request-context';
import * as schema from '../../server/db/schema';
import { getVacancyDetail } from '../../server/services/vacancy';
import { patchVacancyDraft } from '../../server/services/vacancy-draft';
import { setVacancyTeamLead } from '../../server/services/vacancy-team-lead-set';
import { createLockRace } from '../support/lock-race';
import {
  addUser,
  contextFor,
  createScenarioRunner,
  NOW,
  problem,
  rolesOf,
  type Roles,
} from '../support/vacancy-write-harness';
import {
  createVacancyWorld,
  WORLD_OPENED_AT,
  type VacancyWorld,
} from '../support/vacancy-world';
import { connectTestDatabase, testDatabaseUrls } from './database';

const urls = testDatabaseUrls();
const admin = connectTestDatabase(urls.migration);
const probe = connectTestDatabase(urls.migration);
const client = postgres(urls.runtime, { max: 8, prepare: false });
let world: VacancyWorld;
let scenario: ReturnType<typeof createScenarioRunner>;
let open: {
  onHold: string;
  filled: string;
  ownDraft: string;
  otherVertical: string;
};

beforeAll(async () => {
  world = await createVacancyWorld(admin);
  scenario = createScenarioRunner(client);
  const noLead = { team_lead_id: null, recruiter_initiated: true };
  open = {
    onHold: await world.addVacancy({
      title: `Пауза без тімліда ${world.tag}`,
      status: 'ON_HOLD',
      ...noLead,
    }),
    filled: await world.addVacancy({
      title: `Закрита без тімліда ${world.tag}`,
      status: 'FILLED',
      closed_at: WORLD_OPENED_AT,
      ...noLead,
    }),
    ownDraft: await world.addVacancy({
      title: `Чернетка без тімліда ${world.tag}`,
      status: 'DRAFT',
      opened_at: null,
      ...noLead,
    }),
    otherVertical: await world.addVacancy({
      title: `Вільна Б без тімліда ${world.tag}`,
      vertical_id: world.verticals.v2,
      position_id: world.positions.p2,
      ...noLead,
    }),
  };
});
afterAll(async () => {
  await world.cleanup();
  await Promise.all([admin.end(), probe.end(), client.end()]);
});

const roles = () => rolesOf(world);
type Scenario = Parameters<Parameters<typeof scenario>[0]>[0];
const leadRole = (verticalId = world.verticals.v1): Roles => [
  { role: 'TEAM_LEAD', verticalId },
];
/** Open vacancy of the first vertical with no Team Lead. */
const free = () => world.v.recruiterInitiated;

const set = (
  ctx: RequestContext,
  id: string,
  teamLeadId: string,
  expectedVersion = 1,
) => setVacancyTeamLead(ctx, id, { teamLeadId, expectedVersion });
const stored = async (s: Scenario, id: string) =>
  (
    await s.tx
      .select({
        teamLeadId: schema.vacancy.teamLeadId,
        recruiterInitiated: schema.vacancy.recruiterInitiated,
        version: schema.vacancy.version,
      })
      .from(schema.vacancy)
      .where(eq(schema.vacancy.id, id))
  )[0];
const eventsOf = (s: Scenario, id: string) =>
  s.tx
    .select()
    .from(schema.entityEvent)
    .where(eq(schema.entityEvent.vacancyId, id));
const piiOf = async (s: Scenario, id: string) => {
  const ids = (await eventsOf(s, id)).map((event) => event.id);
  return ids.length === 0
    ? []
    : s.tx
        .select()
        .from(schema.entityEventPii)
        .where(inArray(schema.entityEventPii.eventId, ids));
};
const auditsOf = (s: Scenario, id: string) =>
  s.tx.select().from(schema.auditLog).where(eq(schema.auditLog.entityId, id));

/** A refused or no-op request leaves the row, the events, their PII rows and the audit trail exactly as they were. */
async function expectUntouched(
  s: Scenario,
  id: string,
  teamLeadId: string | null = null,
) {
  expect(await stored(s, id)).toMatchObject({ teamLeadId, version: 1 });
  expect(await eventsOf(s, id)).toEqual([]);
  expect(await piiOf(s, id)).toEqual([]);
  expect(await auditsOf(s, id)).toEqual([]);
}

describe('First Team Lead assignment, allowed callers [STORY-VAC-03-2, D130 (3)]', () => {
  it.each(['head', 'admin'] as const)(
    '%s sets a Team Lead without a priority: version +1, one event, one audit row, recruiter_initiated kept',
    async (who) => {
      await scenario(async (s) => {
        const id = free();
        const lead = await addUser(s.tx, { roles: leadRole() });
        const detail = await set(await s.as(roles()[who]), id, lead);
        expect(detail).toMatchObject({
          id,
          version: 2,
          teamLead: { id: lead },
          recruiterInitiated: true,
          canSetTeamLead: false,
          updatedAt: NOW.toISOString(),
        });
        expect(await stored(s, id)).toEqual({
          teamLeadId: lead,
          recruiterInitiated: true,
          version: 2,
        });
        const events = await eventsOf(s, id);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          type: 'vacancy.team_lead_assigned',
          actorId: s.actorId,
          occurredAt: NOW,
          verticalId: world.verticals.v1,
          subjectType: 'vacancy',
          subjectId: id,
          payload: { v: 1, teamLeadId: lead, by: s.actorId },
        });
        expect(await piiOf(s, id)).toEqual([]);
        const audits = await auditsOf(s, id);
        expect(audits).toHaveLength(1);
        expect(audits[0]).toMatchObject({
          action: 'vacancy.team_lead_assigned',
          actorId: s.actorId,
          entityType: 'vacancy',
          before: { teamLeadId: null },
          after: { teamLeadId: lead },
        });
      });
    },
  );

  it('Admin sets it in any vertical', async () => {
    await scenario(async (s) => {
      const lead = await addUser(s.tx, {
        roles: leadRole(world.verticals.v2),
      });
      expect(
        await set(await s.as(roles().admin), open.otherVertical, lead),
      ).toMatchObject({ teamLead: { id: lead } });
    });
  });

  it('allows ON_HOLD', async () => {
    await scenario(async (s) => {
      const lead = await addUser(s.tx, { roles: leadRole() });
      expect(
        await set(await s.as(roles().head), open.onHold, lead),
      ).toMatchObject({ status: 'ON_HOLD', teamLead: { id: lead } });
    });
  });

  it('the new Team Lead reads exactly this vacancy afterwards, not before, and may pause or cancel it but not reopen [D67, D94]', async () => {
    await scenario(async (s) => {
      const lead = await addUser(s.tx, { roles: leadRole() });
      const asLead = s.asNew(leadRole(), { userId: lead });
      expect(await problem(getVacancyDetail(asLead, free()))).toMatchObject({
        status: 404,
      });
      await set(await s.as(roles().head), free(), lead);
      const detail = await getVacancyDetail(asLead, free());
      expect(detail).toMatchObject({ teamLead: { id: lead } });
      expect(detail.statusActions).toEqual(
        expect.arrayContaining(['HOLD', 'CANCEL']),
      );
      expect(detail.statusActions).not.toContain('REOPEN');
      expect(
        await problem(getVacancyDetail(asLead, open.onHold)),
      ).toMatchObject({ status: 404 });
    });
  });

  it('a Team Lead who is also a Recruiter in the vertical is eligible', async () => {
    await scenario(async (s) => {
      const lead = await addUser(s.tx, { roles: roles().teamLeadAndRecruiter });
      expect(await set(await s.as(roles().head), free(), lead)).toMatchObject({
        teamLead: { id: lead },
      });
    });
  });

  it('the same Team Lead again at the current version is 200 and writes nothing more', async () => {
    await scenario(async (s) => {
      const lead = await addUser(s.tx, { roles: leadRole() });
      const ctx = await s.as(roles().head);
      const first = await set(ctx, free(), lead);
      const again = await set(ctx, free(), lead, first.version);
      expect(again).toMatchObject({ version: 2, teamLead: { id: lead } });
      expect(await eventsOf(s, free())).toHaveLength(1);
      expect(await auditsOf(s, free())).toHaveLength(1);
    });
  });

  it('the same Team Lead from a stale version is a no-op, not a conflict', async () => {
    await scenario(async (s) => {
      const id = world.v.assignedOpen;
      const detail = await set(
        await s.as(roles().head),
        id,
        world.users.tlA,
        9,
      );
      expect(detail).toMatchObject({
        version: 1,
        teamLead: { id: world.users.tlA },
      });
      await expectUntouched(s, id, world.users.tlA);
    });
  });
});

describe('Team Lead assignment, denied callers [STORY-VAC-03-2, SEC-VC-03]', () => {
  it.each([
    ['Recruiter', 'recruiter'],
    ['Team Lead', 'teamLead'],
    ['HR', 'hr'],
    ['Head HR', 'headHr'],
  ] as const)('%s is 403 and nothing is written', async (_name, who) => {
    await scenario(async (s) => {
      const lead = await addUser(s.tx, { roles: leadRole() });
      expect(
        await problem(set(await s.as(roles()[who]), free(), lead)),
      ).toMatchObject({ status: 403, code: 'FORBIDDEN' });
      await expectUntouched(s, free());
    });
  });

  it('a Recruiter who works the vacancy and a Team Lead who is its own are still 403', async () => {
    await scenario(async (s) => {
      const lead = await addUser(s.tx, { roles: leadRole() });
      const recruiter = await s.as(roles().recruiter, {
        userId: world.users.recB,
      });
      expect(await problem(set(recruiter, free(), lead))).toMatchObject({
        status: 403,
      });
      const own = await s.as(roles().teamLead, { userId: world.users.tlA });
      expect(await problem(set(own, world.v.assignedOpen, lead))).toMatchObject(
        { status: 403 },
      );
      await expectUntouched(s, free());
      await expectUntouched(s, world.v.assignedOpen, world.users.tlA);
    });
  });

  it('Finance has no vacancy read: 404', async () => {
    await scenario(async (s) => {
      const lead = await addUser(s.tx, { roles: leadRole() });
      expect(
        await problem(set(await s.as(roles().finance), free(), lead)),
      ).toMatchObject({ status: 404 });
      await expectUntouched(s, free());
    });
  });

  it('a Head Recruiter of another vertical gets 404', async () => {
    await scenario(async (s) => {
      const lead = await addUser(s.tx, { roles: leadRole() });
      expect(
        await problem(set(await s.as(roles().headOther), free(), lead)),
      ).toMatchObject({ status: 404 });
      await expectUntouched(s, free());
    });
  });

  it('a Head Recruiter of one vertical who is only Team Lead in the other cannot set there', async () => {
    await scenario(async (s) => {
      const mixed: Roles = [
        { role: 'HEAD_RECRUITER', verticalId: world.verticals.v1 },
        { role: 'TEAM_LEAD', verticalId: world.verticals.v2 },
      ];
      const lead = await addUser(s.tx, {
        roles: leadRole(world.verticals.v2),
      });
      expect(
        await problem(set(await s.as(mixed), open.otherVertical, lead)),
      ).toMatchObject({ status: 404 });
      await expectUntouched(s, open.otherVertical);
    });
  });

  it('Admin without aal2 is 401 MFA_REQUIRED', async () => {
    await scenario(async (s) => {
      const lead = await addUser(s.tx, { roles: leadRole() });
      const ctx = await s.as(roles().admin, { aal: 'aal1' });
      expect(await problem(set(ctx, free(), lead))).toMatchObject({
        status: 401,
        code: 'MFA_REQUIRED',
      });
      await expectUntouched(s, free());
    });
  });

  it('someone else draft is 404 for a Head Recruiter and for an Admin who is not the author', async () => {
    await scenario(async (s) => {
      const lead = await addUser(s.tx, { roles: leadRole() });
      // The world's drafts are authored by `world.users.admin`; the scenario actor is a different Admin.
      for (const who of ['admin', 'head'] as const)
        expect(
          await problem(set(await s.as(roles()[who]), open.ownDraft, lead)),
        ).toMatchObject({ status: 404 });
      await expectUntouched(s, open.ownDraft);
    });
  });

  it('a deleted vacancy, an unknown id and a malformed id are 404', async () => {
    await scenario(async (s) => {
      const lead = await addUser(s.tx, { roles: leadRole() });
      const ctx = await s.as(roles().admin);
      for (const id of [world.v.deleted, randomUUID(), 'not-a-uuid'])
        expect(await problem(set(ctx, id, lead))).toMatchObject({
          status: 404,
        });
      await expectUntouched(s, world.v.deleted, world.users.tlA);
    });
  });

  it('refuses malformed bodies before any lookup and writes nothing (no way to clear a Team Lead)', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(roles().head);
      const teamLeadId = randomUUID();
      for (const body of [
        { teamLeadId, expectedVersion: 1, status: 'FILLED' },
        { teamLeadId, expectedVersion: 1, recruiterInitiated: false },
        { teamLeadId: null, expectedVersion: 1 },
        { teamLeadId: 'nobody', expectedVersion: 1 },
        { teamLeadId, expectedVersion: 0 },
        { teamLeadId, expectedVersion: 1.5 },
        { teamLeadId },
        { expectedVersion: 1 },
      ])
        await expect(
          setVacancyTeamLead(ctx, free(), body as never),
        ).rejects.toBeInstanceOf(ZodError);
      await expectUntouched(s, free());
    });
  });

  it('the draft PATCH cannot change the Team Lead of a published vacancy', async () => {
    await scenario(async (s) => {
      const other = await addUser(s.tx, { roles: leadRole() });
      const ctx = await s.as(roles().admin, { userId: world.users.admin });
      const refused = await problem(
        patchVacancyDraft(ctx, world.v.assignedOpen, {
          teamLeadId: other,
          expectedVersion: 1,
        }),
      );
      expect([400, 404, 409]).toContain(refused.status);
      await expectUntouched(s, world.v.assignedOpen, world.users.tlA);
    });
  });
});

describe('Team Lead assignment, status and version rules [ADR-017, D130 (3)]', () => {
  it.each([
    ['FILLED', () => open.filled],
    ['CANCELLED', () => world.v.cancelled],
  ] as const)('%s is 409 VACANCY_CLOSED', async (_name, pick) => {
    await scenario(async (s) => {
      const lead = await addUser(s.tx, { roles: leadRole() });
      expect(
        await problem(set(await s.as(roles().head), pick(), lead)),
      ).toMatchObject({ status: 409, code: 'VACANCY_CLOSED' });
      expect(await eventsOf(s, pick())).toEqual([]);
      expect(await auditsOf(s, pick())).toEqual([]);
    });
  });

  it('a draft of the caller is 409 VACANCY_CLOSED with no event and no audit row', async () => {
    await scenario(async (s) => {
      const lead = await addUser(s.tx, { roles: leadRole() });
      const ctx = await s.as(roles().head, { userId: world.users.admin });
      expect(await problem(set(ctx, open.ownDraft, lead))).toMatchObject({
        status: 409,
        code: 'VACANCY_CLOSED',
      });
      await expectUntouched(s, open.ownDraft);
    });
  });

  it('another Team Lead on a vacancy that has one is 409 TEAM_LEAD_ALREADY_SET, also from a stale version', async () => {
    await scenario(async (s) => {
      const id = world.v.assignedOpen;
      const other = await addUser(s.tx, { roles: leadRole() });
      const ctx = await s.as(roles().head);
      for (const version of [1, 7])
        expect(await problem(set(ctx, id, other, version))).toMatchObject({
          status: 409,
          code: 'TEAM_LEAD_ALREADY_SET',
        });
      await expectUntouched(s, id, world.users.tlA);
    });
  });

  it('a stale version with no Team Lead yet is 409 STALE_STATE and nothing changes', async () => {
    await scenario(async (s) => {
      const lead = await addUser(s.tx, { roles: leadRole() });
      expect(
        await problem(set(await s.as(roles().head), free(), lead, 7)),
      ).toMatchObject({ status: 409, code: 'STALE_STATE' });
      await expectUntouched(s, free());
    });
  });
});

describe('Team Lead eligibility is the D122 rule [D122, STORY-VAC-03-2]', () => {
  const invalid = {
    status: 400,
    errors: [{ path: 'body.teamLeadId', code: 'invalid_team_lead' }],
  };
  const cases: readonly [string, () => Parameters<typeof addUser>[1]][] = [
    ['inactive', () => ({ roles: leadRole(), active: false })],
    ['never accepted the invite', () => ({ roles: leadRole(), invited: true })],
    [
      'Team Lead of another vertical only',
      () => ({ roles: leadRole(world.verticals.v2) }),
    ],
    ['Recruiter only', () => ({ roles: roles().recruiter })],
    ['Head Recruiter only', () => ({ roles: roles().head })],
    ['without any role', () => ({ roles: [] })],
  ];
  it.each(cases)(
    '%s is refused with one identical body and nothing is written',
    async (_name, options) => {
      await scenario(async (s) => {
        const user = await addUser(s.tx, options());
        expect(
          await problem(set(await s.as(roles().head), free(), user)),
        ).toEqual({ ...invalid, code: 'VALIDATION_FAILED' });
        await expectUntouched(s, free());
      });
    },
  );

  it('an unknown user id gets the same answer', async () => {
    await scenario(async (s) => {
      expect(
        await problem(set(await s.as(roles().head), free(), randomUUID())),
      ).toEqual({ ...invalid, code: 'VALIDATION_FAILED' });
      await expectUntouched(s, free());
    });
  });
});

describe('Team Lead assignment write throttle [SEC-CORE-09]', () => {
  it(`counts every call: the ${VACANCY_WRITE_RATE_LIMIT.perUser + 1}th inside a minute is 429`, async () => {
    await scenario(async (s) => {
      const lead = await addUser(s.tx, { roles: leadRole() });
      const ctx = await s.as(roles().head);
      for (let n = 0; n < VACANCY_WRITE_RATE_LIMIT.perUser; n += 1)
        await set(ctx, world.v.assignedOpen, world.users.tlA);
      expect(await problem(set(ctx, free(), lead))).toMatchObject({
        status: 429,
        code: 'RATE_LIMITED',
      });
      await expectUntouched(s, free());
    });
  });
});

describe('Team Lead assignment on committed rows [ADR-017 locks, PERF-02]', () => {
  const raceWithLock = createLockRace(admin, probe);
  let fixture: { verticalId: string; positionId: string; headRoles: Roles };

  const newUser = async (role: 'HEAD_RECRUITER' | 'TEAM_LEAD') => {
    const userId = randomUUID();
    await admin`insert into app.app_user (id, email, full_name, activated_at) values (${userId}, ${`${userId}@fixture.test`}, 'Користувач гонки', now())`;
    await admin`insert into app.user_role (user_id, role, vertical_id) values (${userId}, ${role}, ${fixture.verticalId})`;
    return userId;
  };
  const newVacancy = async (createdBy: string) => {
    const id = randomUUID();
    await admin`insert into app.vacancy (id, vertical_id, position_id, title, recruiter_initiated, status, opened_at, created_by)
      values (${id}, ${fixture.verticalId}, ${fixture.positionId}, 'Гонка тімліда', true, 'OPEN', ${WORLD_OPENED_AT}, ${createdBy})`;
    return id;
  };
  const ctx = (userId: string) =>
    contextFor(drizzle(client, { schema }), userId, fixture.headRoles);
  const stateOf = async (id: string) => {
    const [row] =
      await admin`select team_lead_id, version from app.vacancy where id = ${id}`;
    const [events] =
      await admin`select count(*)::int as n from app.entity_event where vacancy_id = ${id}`;
    const [audits] =
      await admin`select count(*)::int as n from app.audit_log where entity_id = ${id}`;
    return {
      teamLeadId: row!.team_lead_id as string | null,
      version: row!.version as number,
      events: events!.n as number,
      audits: audits!.n as number,
    };
  };
  const unchanged = { teamLeadId: null, version: 1, events: 0, audits: 0 };
  const setBy = (head: string, id: string, lead: string) =>
    setVacancyTeamLead(ctx(head), id, { teamLeadId: lead, expectedVersion: 1 });

  beforeAll(async () => {
    const verticalId = randomUUID();
    const positionId = randomUUID();
    const owner = randomUUID();
    const name = `Тімлід ${verticalId.slice(0, 8)}`;
    await admin`insert into app.vertical (id, name) values (${verticalId}, ${`Світ ${name}`})`;
    await admin`insert into app.app_user (id, email, full_name) values (${owner}, ${`${owner}@fixture.test`}, 'Власник позиції')`;
    await admin`insert into app.position (id, vertical_id, name, name_key, created_by)
      values (${positionId}, ${verticalId}, ${name}, ${positionNameKey(name)}, ${owner})`;
    fixture = {
      verticalId,
      positionId,
      headRoles: [{ role: 'HEAD_RECRUITER', verticalId }],
    };
  });

  it('two Heads set different Team Leads at once: one wins, the loser is 409 TEAM_LEAD_ALREADY_SET and wrote nothing', async () => {
    const [headA, headB, leadA, leadB] = await Promise.all([
      newUser('HEAD_RECRUITER'),
      newUser('HEAD_RECRUITER'),
      newUser('TEAM_LEAD'),
      newUser('TEAM_LEAD'),
    ]);
    const id = await newVacancy(headA);
    const settled = await Promise.allSettled([
      setBy(headA, id, leadA),
      setBy(headB, id, leadB),
    ]);
    const won = settled.findIndex((r) => r.status === 'fulfilled');
    expect(settled.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failure = settled.find((r) => r.status === 'rejected');
    expect(await problem(Promise.reject(failure!.reason))).toMatchObject({
      status: 409,
      code: 'TEAM_LEAD_ALREADY_SET',
    });
    expect(await stateOf(id)).toEqual({
      teamLeadId: won === 0 ? leadA : leadB,
      version: 2,
      events: 1,
      audits: 1,
    });
  });

  it('two Heads set the same Team Lead at once: both answer 200, one event', async () => {
    const [headA, headB, lead] = await Promise.all([
      newUser('HEAD_RECRUITER'),
      newUser('HEAD_RECRUITER'),
      newUser('TEAM_LEAD'),
    ]);
    const id = await newVacancy(headA);
    const settled = await Promise.allSettled([
      setBy(headA, id, lead),
      setBy(headB, id, lead),
    ]);
    expect(settled.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(await stateOf(id)).toEqual({
      teamLeadId: lead,
      version: 2,
      events: 1,
      audits: 1,
    });
  });

  it.each([
    ['loses the Team Lead role', 'delete from app.user_role where user_id = '],
    [
      'is deactivated',
      'update app.app_user set is_active = false, deactivated_at = now() where id = ',
    ],
  ] as const)(
    'a Team Lead who %s while the request waits is refused and nothing is written',
    async (_name, statement) => {
      const head = await newUser('HEAD_RECRUITER');
      const lead = await newUser('TEAM_LEAD');
      const id = await newVacancy(head);
      const refused = await raceWithLock(
        (tx) =>
          tx`select id from app.app_user where id = ${lead} for no key update`,
        async (tx) => {
          await tx.unsafe(`${statement}'${lead}'`);
        },
        () => problem(setBy(head, id, lead)),
      );
      expect(refused).toMatchObject({
        status: 400,
        errors: [{ path: 'body.teamLeadId', code: 'invalid_team_lead' }],
      });
      expect(await stateOf(id)).toEqual(unchanged);
    },
  );

  it('a caller whose grant is removed while the request waits is 403 and nothing is written', async () => {
    const head = await newUser('HEAD_RECRUITER');
    const lead = await newUser('TEAM_LEAD');
    const id = await newVacancy(head);
    const refused = await raceWithLock(
      (tx) =>
        tx`select id from app.app_user where id = ${head} for no key update`,
      async (tx) => {
        await tx`delete from app.user_role where user_id = ${head}`;
      },
      () => problem(setBy(head, id, lead)),
    );
    expect(refused).toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(await stateOf(id)).toEqual(unchanged);
  });

  it('sets in at most 13 statements, one of them the compare-and-set write [PERF-02]', async () => {
    const head = await newUser('HEAD_RECRUITER');
    const lead = await newUser('TEAM_LEAD');
    const id = await newVacancy(head);
    const logged: string[] = [];
    const counting = drizzle(client, {
      schema,
      logger: { logQuery: (query) => void logged.push(query) },
    });
    await setVacancyTeamLead(
      contextFor(counting, head, fixture.headRoles),
      id,
      { teamLeadId: lead, expectedVersion: 1 },
    );
    expect(logged.length).toBeLessThanOrEqual(13);
    expect(
      logged.filter((query) => /^update "app"."vacancy"/i.test(query)),
    ).toHaveLength(1);
  });
});
