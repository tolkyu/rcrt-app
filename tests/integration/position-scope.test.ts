import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { can } from '../../server/authz/can';
import { buildAuthContext } from '../../server/authz/context';
import { positionScope, scopeWhere } from '../../server/authz/scopes';
import type { UserId, VerticalId } from '../../server/authz/types';
import * as schema from '../../server/db/schema';
import {
  createVacancyWorld,
  type VacancyWorld,
} from '../support/vacancy-world';
import { connectTestDatabase, testDatabaseUrls } from './database';

const urls = testDatabaseUrls();
const admin = connectTestDatabase(urls.migration);
const client = postgres(urls.runtime, { max: 2, prepare: false });
const db = drizzle(client, { schema });
let world: VacancyWorld;

beforeAll(async () => {
  world = await createVacancyWorld(admin);
});
afterAll(async () => {
  await world.cleanup();
  await Promise.all([admin.end(), client.end()]);
});

type Roles = readonly { role: string; verticalId: string | null }[];
const contextOf = (roles: Roles, aal: 'aal1' | 'aal2' = 'aal2') =>
  buildAuthContext({
    userId: world.users.nobody as UserId,
    roles,
    aal,
    timezone: 'Europe/Kyiv',
  });

type CatalogPermission = 'position.read' | 'position.manage';

/** Positions of this test's world that the permission's predicate returns from the database. */
async function visibleInSql(
  roles: Roles,
  aal: 'aal1' | 'aal2' = 'aal2',
  permission: CatalogPermission = 'position.read',
) {
  const { p1, p2 } = world.positions;
  const rows = await db
    .select({ id: schema.position.id })
    .from(schema.position)
    .where(
      and(
        inArray(schema.position.id, [p1, p2]),
        scopeWhere(contextOf(roles, aal), permission, positionScope),
      ),
    );
  return rows.map((row) => row.id).sort();
}

/** The same decision made by `can()` on the vertical of each position. */
function visibleInMemory(
  roles: Roles,
  aal: 'aal1' | 'aal2' = 'aal2',
  permission: CatalogPermission = 'position.read',
) {
  const ctx = contextOf(roles, aal);
  const { v1, v2 } = world.verticals;
  const { p1, p2 } = world.positions;
  return [
    [p1, v1],
    [p2, v2],
  ]
    .filter(([, verticalId]) =>
      can(ctx, permission, {
        type: 'vertical',
        id: verticalId as VerticalId,
      }),
    )
    .map(([id]) => id!)
    .sort();
}

describe('positionScope SQL matches can() for position.read [ADR-013, VIS-01]', () => {
  const cases = (): [string, Roles, 'aal1' | 'aal2', string[]][] => {
    const { v1, v2 } = world.verticals;
    const { p1, p2 } = world.positions;
    return [
      [
        'Admin (global, aal2)',
        [{ role: 'ADMIN', verticalId: null }],
        'aal2',
        [p1, p2],
      ],
      ['Admin without aal2', [{ role: 'ADMIN', verticalId: null }], 'aal1', []],
      ['Finance', [{ role: 'FINANCE', verticalId: null }], 'aal2', []],
      [
        'Head Recruiter of the first vertical',
        [{ role: 'HEAD_RECRUITER', verticalId: v1 }],
        'aal2',
        [p1],
      ],
      [
        'Head Recruiter of the second vertical',
        [{ role: 'HEAD_RECRUITER', verticalId: v2 }],
        'aal2',
        [p2],
      ],
      ['Recruiter', [{ role: 'RECRUITER', verticalId: v1 }], 'aal2', [p1]],
      ['Team Lead', [{ role: 'TEAM_LEAD', verticalId: v2 }], 'aal2', [p2]],
      ['Head HR', [{ role: 'HEAD_HR', verticalId: v1 }], 'aal2', [p1]],
      ['HR', [{ role: 'HR', verticalId: v2 }], 'aal2', [p2]],
      [
        'mixed Head Recruiter + Recruiter',
        [
          { role: 'HEAD_RECRUITER', verticalId: v1 },
          { role: 'RECRUITER', verticalId: v2 },
        ],
        'aal2',
        [p1, p2],
      ],
      [
        'Admin without aal2 who is also HR in the first vertical',
        [
          { role: 'ADMIN', verticalId: null },
          { role: 'HR', verticalId: v1 },
        ],
        'aal1',
        [p1],
      ],
      ['no roles', [], 'aal2', []],
    ];
  };

  it('returns exactly the positions of the readable verticals, and the in-memory check agrees', async () => {
    for (const [label, roles, aal, expected] of cases()) {
      const sorted = [...expected].sort();
      expect(await visibleInSql(roles, aal), label).toEqual(sorted);
      expect(visibleInMemory(roles, aal), label).toEqual(sorted);
    }
  });

  it('scopes a single-row fetch the way detail endpoints do: other vertical means no row', async () => {
    const { p1, p2 } = world.positions;
    const scope = scopeWhere(
      contextOf([{ role: 'RECRUITER', verticalId: world.verticals.v1 }]),
      'position.read',
      positionScope,
    );
    const fetch = (id: string) =>
      db
        .select({ id: schema.position.id })
        .from(schema.position)
        .where(and(eq(schema.position.id, id), scope));
    expect(await fetch(p1)).toHaveLength(1);
    expect(await fetch(p2)).toHaveLength(0);
  });
});

describe('positionScope SQL matches can() for position.manage [ADR-013, SEC-POS-06]', () => {
  const cases = (): [string, Roles, 'aal1' | 'aal2', string[]][] => {
    const { v1, v2 } = world.verticals;
    const { p1, p2 } = world.positions;
    return [
      [
        'Admin (global, aal2)',
        [{ role: 'ADMIN', verticalId: null }],
        'aal2',
        [p1, p2],
      ],
      ['Admin without aal2', [{ role: 'ADMIN', verticalId: null }], 'aal1', []],
      ['Finance', [{ role: 'FINANCE', verticalId: null }], 'aal2', []],
      [
        'Head Recruiter of the first vertical',
        [{ role: 'HEAD_RECRUITER', verticalId: v1 }],
        'aal2',
        [p1],
      ],
      [
        'Head Recruiter of the second vertical',
        [{ role: 'HEAD_RECRUITER', verticalId: v2 }],
        'aal2',
        [p2],
      ],
      ['Recruiter', [{ role: 'RECRUITER', verticalId: v1 }], 'aal2', []],
      ['Team Lead', [{ role: 'TEAM_LEAD', verticalId: v2 }], 'aal2', []],
      ['Head HR', [{ role: 'HEAD_HR', verticalId: v1 }], 'aal2', []],
      ['HR', [{ role: 'HR', verticalId: v2 }], 'aal2', []],
      [
        'mixed Head Recruiter (first) + Recruiter (second)',
        [
          { role: 'HEAD_RECRUITER', verticalId: v1 },
          { role: 'RECRUITER', verticalId: v2 },
        ],
        'aal2',
        [p1],
      ],
      [
        'Admin without aal2 who is also Head Recruiter of the second vertical',
        [
          { role: 'ADMIN', verticalId: null },
          { role: 'HEAD_RECRUITER', verticalId: v2 },
        ],
        'aal1',
        [p2],
      ],
      ['no roles', [], 'aal2', []],
    ];
  };

  it('returns exactly the positions of the managed verticals, and the in-memory check agrees', async () => {
    for (const [label, roles, aal, expected] of cases()) {
      const sorted = [...expected].sort();
      expect(await visibleInSql(roles, aal, 'position.manage'), label).toEqual(
        sorted,
      );
      expect(visibleInMemory(roles, aal, 'position.manage'), label).toEqual(
        sorted,
      );
    }
  });
});
