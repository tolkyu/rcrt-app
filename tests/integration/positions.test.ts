import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { positionNameKey } from '../../lib/position-name';
import {
  POSITION_LIST_LIMIT,
  POSITION_PER_VERTICAL_LIMIT,
  POSITION_WRITE_RATE_LIMIT,
  type Position,
} from '../../lib/schemas/position';
import { buildAuthContext } from '../../server/authz/context';
import type { UserId } from '../../server/authz/types';
import type { DbExecutor } from '../../server/db';
import type { RequestContext } from '../../server/context/request-context';
import * as schema from '../../server/db/schema';
import { mapError } from '../../server/http/map-error';
import { RateLimitedError } from '../../server/http/errors';
import {
  createPosition,
  listPositionCatalog,
  PositionListOverflowError,
  patchPosition,
} from '../../server/services/position';
import {
  createVacancyWorld,
  type VacancyWorld,
} from '../support/vacancy-world';
import { connectTestDatabase, testDatabaseUrls } from './database';

/** Fixtures of the concurrent and cap suites are committed on purpose (events keep a foreign key to their vertical), so leftover rows are intentional. */
const urls = testDatabaseUrls();
const admin = connectTestDatabase(urls.migration);
const client = postgres(urls.runtime, { max: 8, prepare: false });
const db = drizzle(client, { schema });
const clock = { now: () => new Date('2026-11-16T08:00:00Z') };
let world: VacancyWorld;

beforeAll(async () => {
  world = await createVacancyWorld(admin);
});
afterAll(async () => {
  await world.cleanup();
  await Promise.all([admin.end(), client.end()]);
});

type Roles = readonly { role: string; verticalId: string | null }[];
type Aal = 'aal1' | 'aal2';

function contextFor(
  executor: DbExecutor,
  userId: string,
  roles: Roles,
  aal: Aal = 'aal2',
  requestId: string = randomUUID(),
): RequestContext {
  return {
    identity: { authUserId: randomUUID(), sessionId: randomUUID(), aal },
    auth: buildAuthContext({
      userId: userId as UserId,
      roles,
      aal,
      timezone: 'Europe/Kyiv',
    }),
    db: executor,
    clock,
    requestId,
    ip: null,
    userAgent: null,
    mutationId: null,
  };
}

/** Code points as numbers: decomposed letters must survive any editor or formatter normalisation. */
const char = (...codes: number[]) => String.fromCharCode(...codes);

const rollback = Symbol('rollback positions scenario');
interface Scenario {
  readonly tx: DbExecutor;
  readonly actorId: string;
  readonly as: (roles: Roles, aal?: Aal, requestId?: string) => RequestContext;
}

/** Runs against the committed world inside a transaction that is always rolled back, audit and events included. */
async function scenario(run: (s: Scenario) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      const actorId = randomUUID();
      await tx.insert(schema.appUser).values({
        id: actorId,
        email: `${actorId}@fixture.test`,
        fullName: 'Куратор довідника',
      });
      await run({
        tx,
        actorId,
        as: (roles, aal, requestId) =>
          contextFor(tx, actorId, roles, aal, requestId),
      });
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

/** Domain errors and database constraint errors both end as the problem the API would answer. */
async function problem(run: Promise<unknown>) {
  try {
    await run;
  } catch (error) {
    const response = mapError(error, randomUUID());
    if (!response) throw error;
    return {
      status: response.status,
      code: ((await response.json()) as { code: string }).code,
    };
  }
  throw new Error('Expected the call to be refused');
}

const roles = () => {
  const { v1, v2 } = world.verticals;
  return {
    admin: [{ role: 'ADMIN', verticalId: null }],
    head: [{ role: 'HEAD_RECRUITER', verticalId: v1 }],
    recruiter: [{ role: 'RECRUITER', verticalId: v1 }],
    teamLead: [{ role: 'TEAM_LEAD', verticalId: v1 }],
    headHr: [{ role: 'HEAD_HR', verticalId: v1 }],
    hr: [
      { role: 'HR', verticalId: v1 },
      { role: 'HR', verticalId: v2 },
    ],
    mixed: [
      { role: 'HEAD_RECRUITER', verticalId: v1 },
      { role: 'RECRUITER', verticalId: v2 },
    ],
    finance: [{ role: 'FINANCE', verticalId: null }],
    none: [],
  } satisfies Record<string, Roles>;
};

const events = (executor: DbExecutor, subjectId: string) =>
  executor
    .select({
      type: schema.entityEvent.type,
      subjectType: schema.entityEvent.subjectType,
      verticalId: schema.entityEvent.verticalId,
      actorId: schema.entityEvent.actorId,
      payload: schema.entityEvent.payload,
    })
    .from(schema.entityEvent)
    .where(eq(schema.entityEvent.subjectId, subjectId))
    .orderBy(schema.entityEvent.id);

const audits = (executor: DbExecutor, entityId: string) =>
  executor
    .select({
      action: schema.auditLog.action,
      entityType: schema.auditLog.entityType,
      actorId: schema.auditLog.actorId,
      before: schema.auditLog.before,
      after: schema.auditLog.after,
    })
    .from(schema.auditLog)
    .where(
      and(
        eq(schema.auditLog.entityId, entityId),
        eq(schema.auditLog.result, 'SUCCESS'),
      ),
    )
    .orderBy(schema.auditLog.id);

const stored = async (executor: DbExecutor, id: string) =>
  (
    await executor
      .select({
        name: schema.position.name,
        isActive: schema.position.isActive,
        version: schema.position.version,
      })
      .from(schema.position)
      .where(eq(schema.position.id, id))
  )[0];

const mine = (items: readonly Position[]) =>
  items.filter((item) =>
    [world.positions.p1, world.positions.p2].some((id) => id === item.id),
  );

describe('Position catalog authorization [D76, D90, ADR-013, SEC-CORE-05]', () => {
  type Outcome = 'ok' | 401 | 403 | 404;
  const table = (): [string, Roles, Aal, Record<string, Outcome>][] => [
    [
      'Admin (aal2)',
      roles().admin,
      'aal2',
      {
        active: 'ok',
        all: 'ok',
        create1: 'ok',
        create2: 'ok',
        patch1: 'ok',
        patch2: 'ok',
      },
    ],
    [
      'Admin without aal2',
      roles().admin,
      'aal1',
      {
        active: 401,
        all: 401,
        create1: 401,
        create2: 401,
        patch1: 401,
        patch2: 401,
      },
    ],
    [
      'Head Recruiter of the first vertical',
      roles().head,
      'aal2',
      {
        active: 'ok',
        all: 'ok',
        create1: 'ok',
        create2: 404,
        patch1: 'ok',
        patch2: 404,
      },
    ],
    [
      'Recruiter',
      roles().recruiter,
      'aal2',
      {
        active: 'ok',
        all: 403,
        create1: 403,
        create2: 403,
        patch1: 403,
        patch2: 403,
      },
    ],
    [
      'Team Lead',
      roles().teamLead,
      'aal2',
      {
        active: 'ok',
        all: 403,
        create1: 403,
        create2: 403,
        patch1: 403,
        patch2: 403,
      },
    ],
    [
      'Head HR',
      roles().headHr,
      'aal2',
      {
        active: 'ok',
        all: 403,
        create1: 403,
        create2: 403,
        patch1: 403,
        patch2: 403,
      },
    ],
    [
      'HR of both verticals',
      roles().hr,
      'aal2',
      {
        active: 'ok',
        all: 403,
        create1: 403,
        create2: 403,
        patch1: 403,
        patch2: 403,
      },
    ],
    [
      'Head Recruiter in one vertical and Recruiter in the other',
      roles().mixed,
      'aal2',
      {
        active: 'ok',
        all: 'ok',
        create1: 'ok',
        create2: 403,
        patch1: 'ok',
        patch2: 403,
      },
    ],
    [
      'Finance',
      roles().finance,
      'aal2',
      {
        active: 404,
        all: 404,
        create1: 404,
        create2: 404,
        patch1: 404,
        patch2: 404,
      },
    ],
    [
      'a user without roles',
      roles().none,
      'aal2',
      {
        active: 404,
        all: 404,
        create1: 404,
        create2: 404,
        patch1: 404,
        patch2: 404,
      },
    ],
  ];

  it.each(Array.from({ length: 10 }, (_, index) => index))(
    'answers every action of role case %i exactly as the matrix says',
    async (index) => {
      const [label, granted, aal, expected] = table()[index]!;
      const { v1, v2 } = world.verticals;
      const { p1, p2 } = world.positions;
      const calls: Record<string, (s: Scenario) => Promise<unknown>> = {
        active: (s) =>
          listPositionCatalog(s.as(granted, aal), { status: 'active' }),
        all: (s) => listPositionCatalog(s.as(granted, aal), { status: 'all' }),
        create1: (s) =>
          createPosition(s.as(granted, aal), {
            verticalId: v1,
            name: `Нова ${world.tag}`,
          }),
        create2: (s) =>
          createPosition(s.as(granted, aal), {
            verticalId: v2,
            name: `Нова ${world.tag}`,
          }),
        patch1: (s) =>
          patchPosition(s.as(granted, aal), p1, {
            expectedVersion: 1,
            isActive: false,
          }),
        patch2: (s) =>
          patchPosition(s.as(granted, aal), p2, {
            expectedVersion: 1,
            isActive: false,
          }),
      };
      for (const [action, outcome] of Object.entries(expected)) {
        await scenario(async (s) => {
          const run = calls[action]!(s);
          if (outcome === 'ok')
            await expect(run, `${label}: ${action}`).resolves.toBeDefined();
          else
            expect((await problem(run)).status, `${label}: ${action}`).toBe(
              outcome,
            );
        });
      }
    },
  );

  it('lists only the readable verticals, and the manager list only the manageable ones', async () => {
    await scenario(async (s) => {
      const { v1, v2 } = world.verticals;
      const { p1, p2 } = world.positions;
      const idsOf = async (
        granted: Roles,
        query: Parameters<typeof listPositionCatalog>[1],
      ) =>
        mine((await listPositionCatalog(s.as(granted), query)).items)
          .map((i) => i.id)
          .sort();
      const both = [p1, p2].sort();
      expect(await idsOf(roles().admin, { status: 'active' })).toEqual(both);
      expect(await idsOf(roles().head, { status: 'active' })).toEqual([p1]);
      expect(await idsOf(roles().head, { status: 'all' })).toEqual([p1]);
      expect(await idsOf(roles().recruiter, { status: 'active' })).toEqual([
        p1,
      ]);
      expect(await idsOf(roles().hr, { status: 'active' })).toEqual(both);
      expect(await idsOf(roles().mixed, { status: 'active' })).toEqual(both);
      expect(await idsOf(roles().mixed, { status: 'all' })).toEqual([p1]);
      // A vertical filter outside the scope narrows to nothing instead of failing.
      expect(
        await idsOf(roles().head, { status: 'active', verticalId: v2 }),
      ).toEqual([]);
      expect(
        await idsOf(roles().head, { status: 'all', verticalId: v2 }),
      ).toEqual([]);
      expect(
        await idsOf(roles().admin, { status: 'all', verticalId: v1 }),
      ).toEqual([p1]);
    });
  });

  it('keeps inactive positions out of pickers and in the manager list', async () => {
    await scenario(async (s) => {
      const { p1 } = world.positions;
      const head = s.as(roles().head);
      await patchPosition(head, p1, { expectedVersion: 1, isActive: false });
      const active = await listPositionCatalog(head, { status: 'active' });
      const all = await listPositionCatalog(head, { status: 'all' });
      expect(active.items.map((i) => i.id)).not.toContain(p1);
      expect(all.items.find((i) => i.id === p1)).toMatchObject({
        isActive: false,
        version: 2,
      });
      await patchPosition(head, p1, { expectedVersion: 2, isActive: true });
      expect(
        (await listPositionCatalog(head, { status: 'active' })).items.map(
          (i) => i.id,
        ),
      ).toContain(p1);
    });
  });
});

describe('Position catalog writes [VAC-01, D76, ADR-013]', () => {
  it('creates an active position with audit and event in the same transaction', async () => {
    await scenario(async (s) => {
      const ctx = s.as(roles().head);
      const created = await createPosition(ctx, {
        verticalId: world.verticals.v1,
        name: '  Медіабаєр — Facebook  ',
      });
      expect(created).toMatchObject({
        verticalId: world.verticals.v1,
        name: 'Медіабаєр — Facebook',
        isActive: true,
        version: 1,
        openVacanciesCount: null,
      });
      expect(await audits(s.tx, created.id)).toEqual([
        {
          action: 'position.created',
          entityType: 'position',
          actorId: s.actorId,
          before: null,
          after: {
            name: 'Медіабаєр — Facebook',
            isActive: true,
            verticalId: world.verticals.v1,
          },
        },
      ]);
      expect(await events(s.tx, created.id)).toEqual([
        {
          type: 'position.created',
          subjectType: 'position',
          verticalId: world.verticals.v1,
          actorId: s.actorId,
          payload: { v: 1 },
        },
      ]);
      const [row] = await s.tx
        .select({ createdBy: schema.position.createdBy })
        .from(schema.position)
        .where(eq(schema.position.id, created.id));
      expect(row?.createdBy).toBe(s.actorId);
    });
  });

  it('refuses an unknown vertical with 404 and a duplicate with 409 POSITION_NAME_TAKEN, case and spaces ignored', async () => {
    await scenario(async (s) => {
      const { v1, v2 } = world.verticals;
      const admin = s.as(roles().admin);
      expect(
        await problem(
          createPosition(admin, { verticalId: randomUUID(), name: 'Невідома' }),
        ),
      ).toEqual({ status: 404, code: 'NOT_FOUND' });
      await createPosition(admin, { verticalId: v1, name: 'Афілейт Лід' });
      for (const name of ['афілейт лід', ' АФІЛЕЙТ ЛІД ', 'Афілейт Лід']) {
        expect(
          await problem(createPosition(admin, { verticalId: v1, name })),
        ).toEqual({ status: 409, code: 'POSITION_NAME_TAKEN' });
      }
      const sameInOther = await createPosition(admin, {
        verticalId: v2,
        name: 'Афілейт Лід',
      });
      expect(sameInOther.verticalId).toBe(v2);
    });
  });

  it('keeps the name of a deactivated position reserved and allows case-only renames of the same row', async () => {
    await scenario(async (s) => {
      const { v1 } = world.verticals;
      const head = s.as(roles().head);
      const created = await createPosition(head, {
        verticalId: v1,
        name: 'Резерв',
      });
      await patchPosition(head, created.id, {
        expectedVersion: 1,
        isActive: false,
      });
      expect(
        await problem(createPosition(head, { verticalId: v1, name: 'резерв' })),
      ).toEqual({ status: 409, code: 'POSITION_NAME_TAKEN' });
      const renamed = await patchPosition(head, created.id, {
        expectedVersion: 2,
        name: 'РЕЗЕРВ',
      });
      expect(renamed).toMatchObject({
        name: 'РЕЗЕРВ',
        isActive: false,
        version: 3,
      });
    });
  });

  it('refuses a rename onto another position of the vertical and leaves everything unchanged', async () => {
    await scenario(async (s) => {
      const { v1 } = world.verticals;
      const head = s.as(roles().head);
      await createPosition(head, { verticalId: v1, name: 'Перша' });
      const second = await createPosition(head, {
        verticalId: v1,
        name: 'Друга',
      });
      expect(
        await problem(
          patchPosition(head, second.id, { expectedVersion: 1, name: 'перша' }),
        ),
      ).toEqual({ status: 409, code: 'POSITION_NAME_TAKEN' });
      expect(await stored(s.tx, second.id)).toEqual({
        name: 'Друга',
        isActive: true,
        version: 1,
      });
      expect(await audits(s.tx, second.id)).toHaveLength(1);
    });
  });

  it('records rename old→new in audit and a bare event; the version rises once', async () => {
    await scenario(async (s) => {
      const head = s.as(roles().head);
      const created = await createPosition(head, {
        verticalId: world.verticals.v1,
        name: 'Стара назва',
      });
      const renamed = await patchPosition(head, created.id, {
        expectedVersion: 1,
        name: ' Нова назва ',
      });
      expect(renamed).toMatchObject({ name: 'Нова назва', version: 2 });
      expect((await audits(s.tx, created.id)).slice(1)).toEqual([
        {
          action: 'position.renamed',
          entityType: 'position',
          actorId: s.actorId,
          before: { name: 'Стара назва' },
          after: { name: 'Нова назва' },
        },
      ]);
      expect(
        (await events(s.tx, created.id)).map((e) => [e.type, e.payload]),
      ).toEqual([
        ['position.created', { v: 1 }],
        ['position.renamed', { v: 1 }],
      ]);
    });
  });

  it('writes deactivate and reactivate rows, and two rows each when one request changes both fields', async () => {
    await scenario(async (s) => {
      const head = s.as(roles().head);
      const created = await createPosition(head, {
        verticalId: world.verticals.v1,
        name: 'Перемикач',
      });
      const off = await patchPosition(head, created.id, {
        expectedVersion: 1,
        isActive: false,
      });
      expect(off).toMatchObject({ isActive: false, version: 2 });
      const both = await patchPosition(head, created.id, {
        expectedVersion: 2,
        isActive: true,
        name: 'Перемикач 2',
      });
      expect(both).toMatchObject({
        isActive: true,
        name: 'Перемикач 2',
        version: 3,
      });
      expect(
        (await audits(s.tx, created.id)).map((a) => [
          a.action,
          a.before,
          a.after,
        ]),
      ).toEqual([
        [
          'position.created',
          null,
          { name: 'Перемикач', isActive: true, verticalId: world.verticals.v1 },
        ],
        ['position.deactivated', { isActive: true }, { isActive: false }],
        ['position.renamed', { name: 'Перемикач' }, { name: 'Перемикач 2' }],
        ['position.reactivated', { isActive: false }, { isActive: true }],
      ]);
      expect((await events(s.tx, created.id)).map((e) => e.type)).toEqual([
        'position.created',
        'position.deactivated',
        'position.renamed',
        'position.reactivated',
      ]);
    });
  });

  it('treats a matching version with no effective change as a no-op: no bump, no audit, no event', async () => {
    await scenario(async (s) => {
      const head = s.as(roles().head);
      const created = await createPosition(head, {
        verticalId: world.verticals.v1,
        name: 'Без змін',
      });
      for (const body of [
        { name: 'Без змін' },
        { name: '  Без змін  ' },
        { isActive: true },
        { name: 'Без змін', isActive: true },
      ]) {
        const result = await patchPosition(head, created.id, {
          expectedVersion: 1,
          ...body,
        });
        expect(result).toMatchObject({
          name: 'Без змін',
          isActive: true,
          version: 1,
        });
      }
      expect(await audits(s.tx, created.id)).toHaveLength(1);
      expect(await events(s.tx, created.id)).toHaveLength(1);
    });
  });

  it('still answers 409 STALE_STATE for a no-op with an outdated version, and for a stale real change', async () => {
    await scenario(async (s) => {
      const head = s.as(roles().head);
      const created = await createPosition(head, {
        verticalId: world.verticals.v1,
        name: 'Версії',
      });
      await patchPosition(head, created.id, {
        expectedVersion: 1,
        name: 'Версії 2',
      });
      for (const body of [
        { name: 'Версії 2' },
        { name: 'Версії 3' },
        { isActive: false },
      ]) {
        expect(
          await problem(
            patchPosition(head, created.id, { expectedVersion: 1, ...body }),
          ),
        ).toEqual({ status: 409, code: 'STALE_STATE' });
      }
      expect(await stored(s.tx, created.id)).toEqual({
        name: 'Версії 2',
        isActive: true,
        version: 2,
      });
      expect(await audits(s.tx, created.id)).toHaveLength(2);
    });
  });

  it('answers 404 for an unknown position id, before any version check', async () => {
    await scenario(async (s) => {
      expect(
        await problem(
          patchPosition(s.as(roles().admin), randomUUID(), {
            expectedVersion: 99,
            name: 'Ніхто',
          }),
        ),
      ).toEqual({ status: 404, code: 'NOT_FOUND' });
    });
  });

  it('gives a manager of another vertical the same 404 as an unknown id, and a reader 403, without writing', async () => {
    await scenario(async (s) => {
      const { p2 } = world.positions;
      const body = { expectedVersion: 1, name: 'Чужа' };
      expect(
        await problem(patchPosition(s.as(roles().head), p2, body)),
      ).toEqual({
        status: 404,
        code: 'NOT_FOUND',
      });
      expect(await problem(patchPosition(s.as(roles().hr), p2, body))).toEqual({
        status: 403,
        code: 'FORBIDDEN',
      });
      expect((await stored(s.tx, p2))?.version).toBe(1);
      expect(await audits(s.tx, p2)).toEqual([]);
      expect(await events(s.tx, p2)).toEqual([]);
    });
  });

  it.each([
    ['empty', ''],
    ['one character', 'Т'],
    ['81 characters', 'Т'.repeat(81)],
    ['NUL', 'Назва\u0000'],
    ['a control character', 'Назва\u001b'],
  ])('rejects a %s name before touching the database', async (_label, name) => {
    await scenario(async (s) => {
      const head = s.as(roles().head);
      await expect(
        createPosition(head, { verticalId: world.verticals.v1, name }),
      ).rejects.toMatchObject({ name: 'ZodError' });
      await expect(
        patchPosition(head, world.positions.p1, { expectedVersion: 1, name }),
      ).rejects.toMatchObject({ name: 'ZodError' });
      await expect(
        patchPosition(head, world.positions.p1, { expectedVersion: 1 }),
      ).rejects.toMatchObject({ name: 'ZodError' });
    });
  });

  it('answers 403 before parsing the body to callers who manage no vertical, and 404 to Finance and roleless users', async () => {
    await scenario(async (s) => {
      const malformedCreate = { verticalId: 'не-uuid', name: '' };
      const malformedPatch = { expectedVersion: 0 };
      for (const granted of [
        roles().recruiter,
        roles().teamLead,
        roles().headHr,
        roles().hr,
      ]) {
        const ctx = s.as(granted);
        expect(await problem(createPosition(ctx, malformedCreate))).toEqual({
          status: 403,
          code: 'FORBIDDEN',
        });
        expect(
          await problem(patchPosition(ctx, randomUUID(), malformedPatch)),
        ).toEqual({ status: 403, code: 'FORBIDDEN' });
        expect(
          await problem(patchPosition(ctx, world.positions.p1, malformedPatch)),
        ).toEqual({ status: 403, code: 'FORBIDDEN' });
      }
      for (const granted of [roles().finance, roles().none]) {
        const ctx = s.as(granted);
        expect(await problem(createPosition(ctx, malformedCreate))).toEqual({
          status: 404,
          code: 'NOT_FOUND',
        });
        expect(
          await problem(patchPosition(ctx, randomUUID(), malformedPatch)),
        ).toEqual({ status: 404, code: 'NOT_FOUND' });
      }
    });
  });

  it('does not spend the write budget of callers who are refused for lack of a manage grant', async () => {
    await scenario(async (s) => {
      const recruiter = s.as(roles().recruiter);
      for (
        let attempt = 0;
        attempt <= POSITION_WRITE_RATE_LIMIT.perUser;
        attempt++
      )
        expect(
          await problem(
            createPosition(recruiter, {
              verticalId: world.verticals.v1,
              name: `Заборонена ${attempt}`,
            }),
          ),
        ).toEqual({ status: 403, code: 'FORBIDDEN' });
    });
  });

  it('treats a decomposed «й» or «ї» and an upper-case Cyrillic name as the same name, with the key stored beside the name', async () => {
    await scenario(async (s) => {
      const { v1 } = world.verticals;
      const head = s.as(roles().head);
      const composed = await createPosition(head, {
        verticalId: v1,
        name: 'Йога для Їжаків',
      });
      const decomposed = `${char(0x0418, 0x0306)}ога для ${char(0x0406, 0x0308)}жаків`;
      for (const name of [decomposed, 'ЙОГА ДЛЯ ЇЖАКІВ', 'йога  для  їжаків']) {
        expect(
          await problem(createPosition(head, { verticalId: v1, name })),
        ).toEqual({ status: 409, code: 'POSITION_NAME_TAKEN' });
      }
      const other = await createPosition(head, {
        verticalId: v1,
        name: 'Інша посада',
      });
      expect(
        await problem(
          patchPosition(head, other.id, {
            expectedVersion: 1,
            name: decomposed,
          }),
        ),
      ).toEqual({ status: 409, code: 'POSITION_NAME_TAKEN' });
      const keyOf = async (id: string) =>
        (
          await s.tx
            .select({ key: schema.position.nameKey })
            .from(schema.position)
            .where(eq(schema.position.id, id))
        )[0]?.key;
      expect(await keyOf(composed.id)).toBe(positionNameKey('Йога для Їжаків'));
      const renamed = await patchPosition(head, other.id, {
        expectedVersion: 1,
        name: 'ІНША  ПОСАДА Б',
      });
      expect(renamed.name).toBe('ІНША ПОСАДА Б');
      expect(await keyOf(other.id)).toBe('інша посада б');
    });
  });

  it('treats apostrophe variants as the same name while storing the name as typed', async () => {
    await scenario(async (s) => {
      const { v1 } = world.verticals;
      const head = s.as(roles().head);
      const typed = `Про${char(0x2019)}єкт П${char(0x2019)}ять`;
      const created = await createPosition(head, {
        verticalId: v1,
        name: typed,
      });
      expect(created.name).toBe(typed);
      for (const code of [0x27, 0x2018, 0x60, 0xb4, 0x02bc])
        expect(
          await problem(
            createPosition(head, {
              verticalId: v1,
              name: `Про${char(code)}єкт П${char(code)}ять`,
            }),
          ),
        ).toEqual({ status: 409, code: 'POSITION_NAME_TAKEN' });
    });
  });

  it('keeps the name_key of a case-only rename equal and lets the same row take it', async () => {
    await scenario(async (s) => {
      const head = s.as(roles().head);
      const created = await createPosition(head, {
        verticalId: world.verticals.v1,
        name: 'Ключ рядка',
      });
      const renamed = await patchPosition(head, created.id, {
        expectedVersion: 1,
        name: 'КЛЮЧ РЯДКА',
      });
      expect(renamed).toMatchObject({ name: 'КЛЮЧ РЯДКА', version: 2 });
      const [row] = await s.tx
        .select({ key: schema.position.nameKey })
        .from(schema.position)
        .where(eq(schema.position.id, created.id));
      expect(row?.key).toBe('ключ рядка');
    });
  });

  it('orders positions by Ukrainian collation: А, Г, Є, І, Ї', async () => {
    await scenario(async (s) => {
      const { v1 } = world.verticals;
      const head = s.as(roles().head);
      const names = [
        'Ї-посада',
        'Г-посада',
        'І-посада',
        'А-посада',
        'Є-посада',
      ];
      for (const name of names)
        await createPosition(head, { verticalId: v1, name });
      const listed = (
        await listPositionCatalog(head, { status: 'all', verticalId: v1 })
      ).items
        .map((item) => item.name)
        .filter((name) => names.includes(name));
      expect(listed).toEqual([
        'А-посада',
        'Г-посада',
        'Є-посада',
        'І-посада',
        'Ї-посада',
      ]);
    });
  });

  it('allows the same name in two verticals of an Admin catalog', async () => {
    await scenario(async (s) => {
      const { v1, v2 } = world.verticals;
      const admin = s.as(roles().admin);
      const first = await createPosition(admin, {
        verticalId: v1,
        name: 'Спільна назва',
      });
      const second = await createPosition(admin, {
        verticalId: v2,
        name: 'СПІЛЬНА НАЗВА',
      });
      expect([first.verticalId, second.verticalId]).toEqual([v1, v2]);
    });
  });

  it('rolls the write back when the audit or event insert fails', async () => {
    await scenario(async (s) => {
      const { v1 } = world.verticals;
      const head = s.as(roles().head);
      const created = await createPosition(head, {
        verticalId: v1,
        name: 'Атомарна',
      });
      // A request id that is not a uuid makes the audit insert fail after the row was written.
      const broken = s.as(roles().head, 'aal2', 'not-a-uuid');
      await expect(
        patchPosition(broken, created.id, {
          expectedVersion: 1,
          name: 'Зламана',
        }),
      ).rejects.toThrow();
      await expect(
        patchPosition(broken, created.id, {
          expectedVersion: 1,
          isActive: false,
        }),
      ).rejects.toThrow();
      expect(await stored(s.tx, created.id)).toEqual({
        name: 'Атомарна',
        isActive: true,
        version: 1,
      });
      await expect(
        createPosition(broken, { verticalId: v1, name: 'Привид' }),
      ).rejects.toThrow();
      const ghosts = await s.tx
        .select({ id: schema.position.id })
        .from(schema.position)
        .where(
          and(
            eq(schema.position.verticalId, v1),
            inArray(schema.position.name, ['Привид', 'Зламана']),
          ),
        );
      expect(ghosts).toEqual([]);
      expect(await audits(s.tx, created.id)).toHaveLength(1);
      expect(await events(s.tx, created.id)).toHaveLength(1);
    });
  });
});

describe('Open vacancy counts [ADR-013]', () => {
  it('counts live OPEN vacancies only (not DRAFT or ON_HOLD), in the manager list only', async () => {
    await scenario(async (s) => {
      const { p1, p2 } = world.positions;
      const { v1 } = world.verticals;
      const admin = s.as(roles().admin);
      const created = await createPosition(admin, {
        verticalId: v1,
        name: 'Порожня',
      });
      const manager = await listPositionCatalog(admin, { status: 'all' });
      const count = (id: string) =>
        manager.items.find((item) => item.id === id)?.openVacanciesCount;
      // 3 OPEN of p1; its ON_HOLD, DRAFT, cancelled and soft-deleted vacancies are excluded.
      expect(count(p1)).toBe(3);
      expect(count(p2)).toBe(2);
      expect(count(created.id)).toBe(0);
      const picker = await listPositionCatalog(admin, { status: 'active' });
      expect(mine(picker.items).map((i) => i.openVacanciesCount)).toEqual([
        null,
        null,
      ]);
    });
  });

  it('shows 0 for a position whose vacancies are all DRAFT, ON_HOLD or CANCELLED and counts only its live OPEN ones', async () => {
    const extra = randomUUID();
    const name = `Без відкритих ${world.tag}`;
    const { v1 } = world.verticals;
    const vacancies: string[] = [];
    await admin`insert into app.position (id, vertical_id, name, name_key, created_by)
      values (${extra}, ${v1}, ${name}, ${positionNameKey(name)}, ${world.users.admin})`;
    try {
      const counted: (number | null | undefined)[] = [];
      const countOf = () =>
        scenario(async (s) => {
          const { items } = await listPositionCatalog(s.as(roles().head), {
            status: 'all',
          });
          counted.push(items.find((i) => i.id === extra)?.openVacanciesCount);
        });
      for (const [status, extraColumns] of [
        ['DRAFT', { opened_at: null }],
        ['ON_HOLD', {}],
        ['CANCELLED', { closed_at: new Date('2026-11-02T09:00:00Z') }],
      ] as const)
        vacancies.push(
          await world.addVacancy({
            position_id: extra,
            status,
            ...extraColumns,
          }),
        );
      await countOf();
      vacancies.push(await world.addVacancy({ position_id: extra }));
      vacancies.push(
        await world.addVacancy({
          position_id: extra,
          deleted_at: new Date('2026-11-02T09:00:00Z'),
          deleted_by: world.users.admin,
          delete_reason: 'Дублікат',
        }),
      );
      await countOf();
      expect(counted).toEqual([0, 1]);
    } finally {
      if (vacancies.length)
        await admin`delete from app.vacancy where id in ${admin(vacancies)}`;
      await admin`delete from app.position where id = ${extra}`;
    }
  });

  it('never carries counts of a vertical the caller does not manage', async () => {
    await scenario(async (s) => {
      const { p1, p2 } = world.positions;
      const head = await listPositionCatalog(s.as(roles().head), {
        status: 'all',
      });
      expect(head.items.find((i) => i.id === p1)?.openVacanciesCount).toBe(3);
      expect(head.items.find((i) => i.id === p2)).toBeUndefined();
      const mixed = await listPositionCatalog(s.as(roles().mixed), {
        status: 'all',
      });
      expect(mixed.items.find((i) => i.id === p2)).toBeUndefined();
      const reader = await listPositionCatalog(s.as(roles().mixed), {
        status: 'active',
      });
      expect(
        reader.items.find((i) => i.id === p2)?.openVacanciesCount,
      ).toBeNull();
    });
  });

  it('keeps existing vacancies, their position name and the count after a deactivation', async () => {
    await scenario(async (s) => {
      const { p1 } = world.positions;
      const head = s.as(roles().head);
      await patchPosition(head, p1, { expectedVersion: 1, isActive: false });
      const rows = await s.tx
        .select({
          id: schema.vacancy.id,
          positionId: schema.vacancy.positionId,
        })
        .from(schema.vacancy)
        .where(eq(schema.vacancy.id, world.v.assignedOpen));
      expect(rows).toEqual([{ id: world.v.assignedOpen, positionId: p1 }]);
      const all = await listPositionCatalog(head, { status: 'all' });
      expect(all.items.find((i) => i.id === p1)).toMatchObject({
        isActive: false,
        openVacanciesCount: 3,
      });
    });
  });
});

describe('Concurrent catalog writers on separate connections [ADR-013]', () => {
  const state: { vertical: string; actor: string; created: string[] } = {
    vertical: randomUUID(),
    actor: randomUUID(),
    created: [],
  };
  const adminRoles = [{ role: 'ADMIN', verticalId: null }] as const;
  const ctx = () => contextFor(db, state.actor, adminRoles);

  beforeAll(async () => {
    await admin`insert into app.vertical (id, name) values (${state.vertical}, ${`Гонка посад ${state.vertical}`})`;
    await admin`insert into app.app_user (id, email, full_name, is_active, deactivated_at)
      values (${state.actor}, ${`${state.actor}@fixture.test`}, 'Гонка посад', false, ${clock.now()})`;
  });
  // Events keep a foreign key to the vertical, so it stays; only the disposable positions go.
  afterAll(async () => {
    await admin`delete from app.position where vertical_id = ${state.vertical}`;
  });

  const rowsNamed = (name: string) =>
    admin`select id, name from app.position where vertical_id = ${state.vertical} and name_key = ${positionNameKey(name)}`;

  it('lets exactly one of five parallel creates of the same name win', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        createPosition(ctx(), {
          verticalId: state.vertical,
          name: 'Гонка створення',
        }),
      ),
    );
    const winners = results.filter((r) => r.status === 'fulfilled');
    expect(winners).toHaveLength(1);
    for (const result of results) {
      if (result.status === 'rejected')
        expect(await problem(Promise.reject(result.reason))).toEqual({
          status: 409,
          code: 'POSITION_NAME_TAKEN',
        });
    }
    const rows = await rowsNamed('Гонка створення');
    expect(rows).toHaveLength(1);
    const id = rows[0]!.id as string;
    state.created.push(id);
    expect(await audits(db, id)).toHaveLength(1);
    expect(await events(db, id)).toHaveLength(1);
  });

  it('lets exactly one of two patches with the same expected version win', async () => {
    const created = await createPosition(ctx(), {
      verticalId: state.vertical,
      name: 'Гонка версій',
    });
    const results = await Promise.allSettled([
      patchPosition(ctx(), created.id, {
        expectedVersion: 1,
        name: 'Версія А',
      }),
      patchPosition(ctx(), created.id, {
        expectedVersion: 1,
        name: 'Версія Б',
      }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const loser = results.find((r) => r.status === 'rejected');
    expect(
      await problem(
        Promise.reject(loser?.status === 'rejected' ? loser.reason : null),
      ),
    ).toEqual({ status: 409, code: 'STALE_STATE' });
    const current = await stored(db, created.id);
    expect(current?.version).toBe(2);
    expect(['Версія А', 'Версія Б']).toContain(current?.name);
    expect((await audits(db, created.id)).map((a) => a.action)).toEqual([
      'position.created',
      'position.renamed',
    ]);
  });

  it('gives a create and a rename racing for one name a single winner', async () => {
    const existing = await createPosition(ctx(), {
      verticalId: state.vertical,
      name: 'Гонка старе',
    });
    const results = await Promise.allSettled([
      createPosition(ctx(), {
        verticalId: state.vertical,
        name: 'Гонка спільне',
      }),
      patchPosition(ctx(), existing.id, {
        expectedVersion: 1,
        name: 'гонка СПІЛЬНЕ',
      }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const loser = results.find((r) => r.status === 'rejected');
    expect(
      await problem(
        Promise.reject(loser?.status === 'rejected' ? loser.reason : null),
      ),
    ).toEqual({ status: 409, code: 'POSITION_NAME_TAKEN' });
    expect(await rowsNamed('Гонка спільне')).toHaveLength(1);
  });
});

describe('Catalog size cap, write throttle and list guard [SEC-POS-03]', () => {
  const bulk = (
    verticalId: string,
    createdBy: string,
    count: number,
    prefix: string,
  ) =>
    Array.from({ length: count }, (_, n) => {
      const name = `${prefix} ${n}`;
      return {
        verticalId,
        name,
        nameKey: positionNameKey(name),
        createdBy,
        isActive: n % 2 === 0,
      };
    });

  async function freshVertical(s: Scenario) {
    const id = randomUUID();
    await s.tx
      .insert(schema.vertical)
      .values({ id, name: `Ємність ${id.slice(0, 8)}` });
    return id;
  }

  it('refuses the position after the 300th with 409 POSITION_LIMIT_REACHED, counting inactive rows, and writes nothing', async () => {
    await scenario(async (s) => {
      const verticalId = await freshVertical(s);
      await s.tx
        .insert(schema.position)
        .values(
          bulk(
            verticalId,
            s.actorId,
            POSITION_PER_VERTICAL_LIMIT - 1,
            'Масова',
          ),
        );
      const admin = s.as(roles().admin);
      const last = await createPosition(admin, { verticalId, name: 'Остання' });
      expect(last.verticalId).toBe(verticalId);
      expect(
        await problem(createPosition(admin, { verticalId, name: 'Зайва' })),
      ).toEqual({ status: 409, code: 'POSITION_LIMIT_REACHED' });
      const rows = await s.tx
        .select({ id: schema.position.id })
        .from(schema.position)
        .where(eq(schema.position.verticalId, verticalId));
      expect(rows).toHaveLength(POSITION_PER_VERTICAL_LIMIT);
      const written = await s.tx
        .select({ entityId: schema.auditLog.entityId })
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.actorId, s.actorId),
            eq(schema.auditLog.action, 'position.created'),
          ),
        );
      expect(written).toEqual([{ entityId: last.id }]);
      // Renames and deactivation stay possible at the cap, and other verticals are unaffected.
      await patchPosition(admin, last.id, {
        expectedVersion: 1,
        isActive: false,
      });
      expect(
        (
          await createPosition(admin, {
            verticalId: world.verticals.v1,
            name: 'Інша вертикаль',
          })
        ).verticalId,
      ).toBe(world.verticals.v1);
    });
  });

  it('answers 429 with Retry-After after 30 writes in a minute, on create and PATCH alike, before any write', async () => {
    await scenario(async (s) => {
      const { v1 } = world.verticals;
      const head = s.as(roles().head);
      let first: Position | undefined;
      for (let n = 0; n < POSITION_WRITE_RATE_LIMIT.perUser; n++) {
        const created = await createPosition(head, {
          verticalId: v1,
          name: `Квота ${n}`,
        });
        first ??= created;
      }
      const refused = await createPosition(head, {
        verticalId: v1,
        name: 'Квота понад ліміт',
      }).catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(RateLimitedError);
      expect((refused as RateLimitedError).retryAfterSeconds).toBe(60);
      expect(
        await problem(
          patchPosition(head, first!.id, {
            expectedVersion: 1,
            name: 'Квота нова',
          }),
        ),
      ).toEqual({ status: 429, code: 'RATE_LIMITED' });
      expect((await stored(s.tx, first!.id))?.name).toBe('Квота 0');
      const [counted] = await s.tx
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.position)
        .where(
          and(
            eq(schema.position.verticalId, v1),
            sql`${schema.position.name} like 'Квота%'`,
          ),
        );
      expect(counted?.count).toBe(POSITION_WRITE_RATE_LIMIT.perUser);
    });
  });

  it('lists four full verticals of 300 positions in one unfiltered manager list without failing [SEC-POS-09]', async () => {
    await scenario(async (s) => {
      const verticalIds: string[] = [];
      for (let index = 0; index < 4; index += 1)
        verticalIds.push(await freshVertical(s));
      for (const [index, verticalId] of verticalIds.entries())
        await s.tx
          .insert(schema.position)
          .values(
            bulk(
              verticalId,
              s.actorId,
              POSITION_PER_VERTICAL_LIMIT,
              `Повна ${index}`,
            ),
          );
      const { items } = await listPositionCatalog(s.as(roles().admin), {
        status: 'all',
      });
      for (const verticalId of verticalIds)
        expect(
          items.filter((item) => item.verticalId === verticalId),
        ).toHaveLength(POSITION_PER_VERTICAL_LIMIT);
    });
  });

  it('fails loudly instead of truncating when the list would pass the list limit, with an error that carries no data', async () => {
    await scenario(async (s) => {
      const verticalId = await freshVertical(s);
      await s.tx
        .insert(schema.position)
        .values(bulk(verticalId, s.actorId, POSITION_LIST_LIMIT, 'Каталог'));
      const admin = s.as(roles().admin);
      const query = { status: 'all', verticalId } as const;
      expect((await listPositionCatalog(admin, query)).items).toHaveLength(
        POSITION_LIST_LIMIT,
      );
      await s.tx
        .insert(schema.position)
        .values(bulk(verticalId, s.actorId, 1, 'Понад'));
      const failure = await listPositionCatalog(admin, query).catch(
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(PositionListOverflowError);
      expect(mapError(failure, randomUUID())).toBeNull();
      expect((failure as Error).message).not.toContain(verticalId);
    });
  });
});

describe('Parallel creates at the size cap [SEC-POS-03]', () => {
  const state = { vertical: randomUUID(), actor: randomUUID() };
  const ctx = () =>
    contextFor(db, state.actor, [{ role: 'ADMIN', verticalId: null }]);

  beforeAll(async () => {
    await admin`insert into app.vertical (id, name) values (${state.vertical}, ${`Гонка ємності ${state.vertical}`})`;
    await admin`insert into app.app_user (id, email, full_name, is_active, deactivated_at)
      values (${state.actor}, ${`${state.actor}@fixture.test`}, 'Гонка ємності', false, ${clock.now()})`;
    await admin`insert into app.position (vertical_id, name, name_key, created_by)
      select ${state.vertical}, 'Масова ' || n, 'масова ' || n, ${state.actor}
      from generate_series(1, ${POSITION_PER_VERTICAL_LIMIT - 4}) as n`;
  });
  afterAll(async () => {
    await admin`delete from app.position where vertical_id = ${state.vertical}`;
  });

  it('lets exactly the free slots through when more creates race for them', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, n) =>
        createPosition(ctx(), {
          verticalId: state.vertical,
          name: `Гонка слот ${n}`,
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(4);
    for (const result of results)
      if (result.status === 'rejected')
        expect(await problem(Promise.reject(result.reason))).toEqual({
          status: 409,
          code: 'POSITION_LIMIT_REACHED',
        });
    const [row] =
      await admin`select count(*)::int as count from app.position where vertical_id = ${state.vertical}`;
    expect(row?.count).toBe(POSITION_PER_VERTICAL_LIMIT);
  });
});
