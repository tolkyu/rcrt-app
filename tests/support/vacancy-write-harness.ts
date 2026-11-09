import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import type postgres from 'postgres';
import { positionNameKey } from '../../lib/position-name';
import type { VacancyDetail } from '../../lib/schemas/vacancy';
import { buildAuthContext } from '../../server/authz/context';
import type { UserId } from '../../server/authz/types';
import type { RequestContext } from '../../server/context/request-context';
import type { DbExecutor } from '../../server/db';
import * as schema from '../../server/db/schema';
import { mapError } from '../../server/http/map-error';
import type { VacancyWorld } from './vacancy-world';

export type Roles = readonly { role: string; verticalId: string | null }[];
export type Aal = 'aal1' | 'aal2';

export const NOW = new Date('2026-11-16T08:00:00Z');

export function contextFor(
  executor: DbExecutor,
  userId: string,
  roles: Roles,
  options: { aal?: Aal; now?: Date } = {},
): RequestContext {
  const aal = options.aal ?? 'aal2';
  const now = options.now ?? NOW;
  return {
    identity: { authUserId: randomUUID(), sessionId: randomUUID(), aal },
    auth: buildAuthContext({
      userId: userId as UserId,
      roles,
      aal,
      timezone: 'Europe/Kyiv',
    }),
    db: executor,
    clock: { now: () => now },
    requestId: randomUUID(),
    ip: null,
    userAgent: null,
    mutationId: null,
  };
}

/** The role sets every create and visibility test runs against, in the first vertical of the world unless named otherwise. */
export function rolesOf(world: VacancyWorld) {
  const { v1, v2 } = world.verticals;
  return {
    admin: [{ role: 'ADMIN', verticalId: null }],
    head: [{ role: 'HEAD_RECRUITER', verticalId: v1 }],
    headOther: [{ role: 'HEAD_RECRUITER', verticalId: v2 }],
    recruiter: [{ role: 'RECRUITER', verticalId: v1 }],
    recruiterOther: [{ role: 'RECRUITER', verticalId: v2 }],
    teamLead: [{ role: 'TEAM_LEAD', verticalId: v1 }],
    teamLeadAndRecruiter: [
      { role: 'TEAM_LEAD', verticalId: v1 },
      { role: 'RECRUITER', verticalId: v1 },
    ],
    headHr: [{ role: 'HEAD_HR', verticalId: v1 }],
    hr: [{ role: 'HR', verticalId: v1 }],
    finance: [{ role: 'FINANCE', verticalId: null }],
    none: [],
  } satisfies Record<string, Roles>;
}

/** Domain errors and database constraint errors both end as the problem the API would answer. */
export async function problem(run: Promise<unknown>) {
  try {
    await run;
  } catch (error) {
    const response = mapError(error, randomUUID());
    if (!response) throw error;
    const body = (await response.json()) as {
      code: string;
      errors?: { path: string; code: string }[];
    };
    return {
      status: response.status,
      code: body.code,
      ...(body.errors ? { errors: body.errors } : {}),
    };
  }
  throw new Error('Expected the call to be refused');
}

export async function addUser(
  executor: DbExecutor,
  options: { roles?: Roles; active?: boolean; name?: string } = {},
) {
  const id = randomUUID();
  await executor.insert(schema.appUser).values({
    id,
    email: `${id}@fixture.test`,
    fullName: options.name ?? 'Користувач сценарію',
    ...(options.active === false
      ? { isActive: false, deactivatedAt: NOW }
      : {}),
  });
  for (const { role, verticalId } of options.roles ?? [])
    await executor
      .insert(schema.userRole)
      .values({ userId: id, role, verticalId });
  return id;
}

export async function addPosition(
  executor: DbExecutor,
  verticalId: string,
  createdBy: string,
  options: { active?: boolean } = {},
) {
  const name = `Посада ${randomUUID().slice(0, 8)}`;
  const [row] = await executor
    .insert(schema.position)
    .values({
      verticalId,
      name,
      nameKey: positionNameKey(name),
      isActive: options.active ?? true,
      createdBy,
    })
    .returning({ id: schema.position.id });
  return row!.id;
}

/** Runs against the committed world inside a transaction that is always rolled back, audit, events and idempotency rows included. */
export function createScenarioRunner(
  client: postgres.Sql,
  schemaTables: typeof schema = schema,
) {
  const db = drizzle(client, { schema: schemaTables });
  const rollback = Symbol('rollback vacancy scenario');
  return async function scenario(
    run: (s: {
      readonly tx: DbExecutor;
      readonly actorId: string;
      /** Makes the user's stored roles equal `roles` (the service re-reads them under the user lock) and returns a context built from them. */
      readonly as: (
        roles: Roles,
        options?: { aal?: Aal; now?: Date; userId?: string },
      ) => Promise<RequestContext>;
      readonly asNew: (
        roles: Roles,
        options?: { aal?: Aal; now?: Date; userId?: string },
      ) => RequestContext;
    }) => Promise<void>,
  ) {
    try {
      await db.transaction(async (tx) => {
        const actorId = await addUser(tx, { name: 'Автор сценарію' });
        await run({
          tx,
          actorId,
          as: async (roles, options = {}) => {
            const userId = options.userId ?? actorId;
            const [known] = await tx
              .select({ id: schema.appUser.id })
              .from(schema.appUser)
              .where(eq(schema.appUser.id, userId));
            if (known) {
              await tx
                .delete(schema.userRole)
                .where(eq(schema.userRole.userId, userId));
              for (const { role, verticalId } of roles)
                await tx
                  .insert(schema.userRole)
                  .values({ userId, role, verticalId });
            }
            return contextFor(tx, userId, roles, options);
          },
          asNew: (roles, options = {}) =>
            contextFor(tx, options.userId ?? actorId, roles, options),
        });
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  };
}

export const numberOf = (detail: Pick<VacancyDetail, 'number'>) =>
  BigInt(detail.number.slice(2));
