import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { DbExecutor } from '../db';
import {
  appUser,
  teamLeadPriority,
  userInvite,
  userRole,
  vertical,
} from '../db/schema';

/** Tabs follow Ukrainian alphabetical order, like every other vertical list the Admin sees. */
export function listVerticalsByName(db: DbExecutor) {
  return db
    .select({ id: vertical.id, name: vertical.name })
    .from(vertical)
    .orderBy(sql`${vertical.name} collate "uk-UA-x-icu"`, asc(vertical.id));
}

export async function priorityVerticalExists(
  db: DbExecutor,
  verticalId: string,
) {
  const [row] = await db
    .select({ id: vertical.id })
    .from(vertical)
    .where(eq(vertical.id, verticalId));
  return Boolean(row);
}

const listRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  items: z.array(
    z.object({
      userId: z.uuid(),
      fullName: z.string(),
      priority: z.number().int().nullable(),
      version: z.number().int().nullable(),
    }),
  ),
  pendingInvites: z.number().int(),
});

/**
 * Who may hold a priority (wireframe P1.1 #3): role row `r` is TEAM_LEAD and its user `u` is active and
 * invite-accepted. One fragment for the list and the save; the aliases are fixed identifiers, never input.
 */
const eligibleTeamLead = (r: 'r' | 'er', u: 'u' | 'eu') =>
  sql.raw(
    `${r}.role = 'TEAM_LEAD' and ${u}.is_active and ${u}.activated_at is not null`,
  );

const isEligible = (userId: SQL, verticalId: SQL) => sql`exists (
  select 1 from ${userRole} er join ${appUser} eu on eu.id = er.user_id
  where er.user_id = ${userId} and er.vertical_id = ${verticalId} and ${eligibleTeamLead('er', 'eu')}
)`;

/** One query per vertical tab: the vertical, its eligible Team Leads with their priority row, and live invitees. */
export async function findVerticalTeamLeads(
  db: DbExecutor,
  verticalId: string,
  now: Date,
) {
  const [row] = await db.execute(sql`
    select v.id, v.name,
      coalesce((
        select json_agg(json_build_object(
            'userId', u.id, 'fullName', u.full_name, 'priority', p.priority, 'version', p.version)
          order by p.priority nulls last, u.full_name collate "uk-UA-x-icu", u.id)
        from ${userRole} r
        join ${appUser} u on u.id = r.user_id
        left join ${teamLeadPriority} p on p.vertical_id = r.vertical_id and p.user_id = r.user_id
        where r.vertical_id = v.id and ${eligibleTeamLead('r', 'u')}
      ), '[]'::json) as items,
      (
        select count(*)::int from ${userRole} r
        join ${appUser} u on u.id = r.user_id and u.is_active and u.activated_at is null
        where r.vertical_id = v.id and r.role = 'TEAM_LEAD'
          and exists (select 1 from ${userInvite} i where i.user_id = u.id and i.status = 'PENDING'
            and i.expires_at > ${now.toISOString()}::timestamptz)
      ) as "pendingInvites"
    from ${vertical} v
    where v.id = ${verticalId}::uuid
  `);
  return row ? listRowSchema.parse(row) : null;
}

/**
 * Locks users with NO KEY UPDATE (id order) before their priority rows, the order role edits and reactivation use
 * (user row first), so a concurrent TEAM_LEAD removal either waits for this save or is seen by it.
 */
export async function lockTeamLeadEligibility(
  db: DbExecutor,
  verticalId: string,
  userIds: readonly string[],
) {
  await db.execute(sql`
    select u.id from ${appUser} u
    where u.id in (${sql.join(
      userIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})
    order by u.id for no key update of u
  `);
  const rows = await db.execute(sql`
    select u.id, ${isEligible(sql`u.id`, sql`${verticalId}::uuid`)} as eligible
    from ${appUser} u
    where u.id in (${sql.join(
      userIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})
    order by u.id
  `);
  return z
    .array(z.object({ id: z.uuid(), eligible: z.boolean() }))
    .parse([...rows]);
}

export function lockTeamLeadPriorityRows(
  db: DbExecutor,
  verticalId: string,
  userIds: readonly string[],
) {
  return db
    .select({
      userId: teamLeadPriority.userId,
      priority: teamLeadPriority.priority,
      version: teamLeadPriority.version,
    })
    .from(teamLeadPriority)
    .where(
      and(
        eq(teamLeadPriority.verticalId, verticalId),
        inArray(teamLeadPriority.userId, [...userIds]),
      ),
    )
    .orderBy(asc(teamLeadPriority.userId))
    .for('update');
}

export async function insertTeamLeadPriority(
  db: DbExecutor,
  row: {
    verticalId: string;
    userId: string;
    priority: number;
    version: number;
  },
  actorId: string,
  now: Date,
) {
  await db
    .insert(teamLeadPriority)
    .values({ ...row, updatedAt: now, updatedBy: actorId });
}

export async function updateTeamLeadPriority(
  db: DbExecutor,
  row: {
    verticalId: string;
    userId: string;
    priority: number;
    version: number;
  },
  actorId: string,
  now: Date,
) {
  await db
    .update(teamLeadPriority)
    .set({
      priority: row.priority,
      updatedAt: now,
      updatedBy: actorId,
      version: row.version,
    })
    .where(
      and(
        eq(teamLeadPriority.verticalId, row.verticalId),
        eq(teamLeadPriority.userId, row.userId),
      ),
    );
}

/** A recreated priority must never reuse a stale row version; role edits share this user's monotonic counter. */
export async function nextTeamLeadPriorityVersion(
  db: DbExecutor,
  userId: string,
  previous: number,
  now: Date,
) {
  const [row] = await db
    .update(appUser)
    .set({
      version: sql`greatest(${appUser.version}, ${previous}) + 1`,
      updatedAt: now,
    })
    .where(eq(appUser.id, userId))
    .returning({ version: appUser.version });
  return row!.version;
}

export async function deleteTeamLeadPriority(
  db: DbExecutor,
  verticalId: string,
  userId: string,
) {
  await db
    .delete(teamLeadPriority)
    .where(
      and(
        eq(teamLeadPriority.verticalId, verticalId),
        eq(teamLeadPriority.userId, userId),
      ),
    );
}

/** Removes a user's priority rows in the given verticals and returns what was cleared, for history. */
export function deleteUserTeamLeadPriorities(
  db: DbExecutor,
  userId: string,
  verticalIds: readonly string[],
) {
  return db
    .delete(teamLeadPriority)
    .where(
      and(
        eq(teamLeadPriority.userId, userId),
        inArray(teamLeadPriority.verticalId, [...verticalIds]),
      ),
    )
    .returning({
      verticalId: teamLeadPriority.verticalId,
      priority: teamLeadPriority.priority,
    });
}
