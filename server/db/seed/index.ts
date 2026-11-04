import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  assertDisposableLocalData,
  parseLocalDatabaseTargets,
} from '../../../lib/env';
import * as schema from '../schema';
import { toolErrorSummary } from '../tool-error';

export function demoId(key: string): string {
  const hash = createHash('sha256').update(`hris:phase1:${key}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
export const DEMO_VERTICALS = {
  gambling: demoId('vertical:gambling'),
  crypto: demoId('vertical:crypto'),
};
type SeedRole = {
  role: (typeof schema.roleCodes)[number];
  verticalId: string | null;
};
const g = DEMO_VERTICALS.gambling;
const c = DEMO_VERTICALS.crypto;
/** Kyiv wall time; Kyiv is UTC+2 for the whole seed history (after 25.10.2026). */
const kyiv = (local: string) => new Date(`${local}+02:00`);

/** Seed history predates 03.11.2026; the unaccepted invite expires before local runs. */
export const DEMO_HISTORY = {
  verticalsCreatedAt: {
    gambling: kyiv('2026-10-30T08:58:12'),
    crypto: kyiv('2026-10-30T09:03:40'),
  },
  prioritiesSetAt: {
    gambling: kyiv('2026-11-01T10:02:15'),
    crypto: kyiv('2026-11-01T10:04:48'),
  },
  savedFiltersAt: {
    'admin@demo': kyiv('2026-11-01T12:15:27'),
    'head.recruiter.gambling@demo': kyiv('2026-11-01T13:30:08'),
  },
};

export const DEMO_USERS: {
  email: string;
  fullName: string;
  roles: SeedRole[];
  invitedAt: Date;
  /** `null` = the invite was never accepted (and has expired). */
  acceptedAt: Date | null;
  deactivatedAt?: Date;
}[] = [
  {
    email: 'admin@demo',
    fullName: 'Іван Коваленко',
    roles: [{ role: 'ADMIN', verticalId: null }],
    invitedAt: kyiv('2026-10-30T08:02:17'),
    acceptedAt: kyiv('2026-10-30T08:06:49'),
  },
  {
    email: 'head.recruiter.gambling@demo',
    fullName: 'Олена Мельник',
    roles: [{ role: 'HEAD_RECRUITER', verticalId: g }],
    invitedAt: kyiv('2026-10-31T10:14:36'),
    acceptedAt: kyiv('2026-10-31T10:41:10'),
  },
  {
    email: 'recruiter1.gambling@demo',
    fullName: 'Марія Шевченко',
    roles: [{ role: 'RECRUITER', verticalId: g }],
    invitedAt: kyiv('2026-10-31T10:16:02'),
    acceptedAt: kyiv('2026-10-31T11:05:33'),
  },
  {
    email: 'recruiter2.gambling@demo',
    fullName: 'Андрій Бондар',
    roles: [{ role: 'RECRUITER', verticalId: g }],
    invitedAt: kyiv('2026-10-31T10:17:25'),
    acceptedAt: kyiv('2026-10-31T12:47:20'),
  },
  {
    email: 'recruiter.crypto@demo',
    fullName: 'Софія Ткаченко',
    roles: [{ role: 'RECRUITER', verticalId: c }],
    invitedAt: kyiv('2026-10-31T10:18:51'),
    acceptedAt: kyiv('2026-10-31T10:58:02'),
  },
  {
    email: 'head.hr@demo',
    fullName: 'Наталія Кравченко',
    roles: [
      { role: 'HEAD_HR', verticalId: g },
      { role: 'HEAD_HR', verticalId: c },
    ],
    invitedAt: kyiv('2026-10-31T10:20:13'),
    acceptedAt: kyiv('2026-10-31T14:12:45'),
  },
  {
    email: 'hr@demo',
    fullName: 'Оксана Олійник',
    roles: [
      { role: 'HR', verticalId: g },
      { role: 'HR', verticalId: c },
    ],
    invitedAt: kyiv('2026-10-31T10:21:40'),
    acceptedAt: kyiv('2026-10-31T11:20:19'),
  },
  {
    email: 'vasyl.tl@demo',
    fullName: 'Василь Мороз',
    roles: [{ role: 'TEAM_LEAD', verticalId: g }],
    invitedAt: kyiv('2026-10-31T10:23:04'),
    acceptedAt: kyiv('2026-10-31T11:31:54'),
  },
  {
    email: 'taras.tl@demo',
    fullName: 'Тарас Лисенко',
    roles: [{ role: 'TEAM_LEAD', verticalId: g }],
    invitedAt: kyiv('2026-10-31T10:24:29'),
    acceptedAt: kyiv('2026-11-01T09:05:27'),
  },
  {
    email: 'tl.crypto@demo',
    fullName: 'Дмитро Савченко',
    roles: [{ role: 'TEAM_LEAD', verticalId: c }],
    invitedAt: kyiv('2026-10-31T10:25:57'),
    acceptedAt: kyiv('2026-10-31T16:40:08'),
  },
  {
    email: 'finance@demo',
    fullName: 'Ірина Романенко',
    roles: [{ role: 'FINANCE', verticalId: null }],
    invitedAt: kyiv('2026-10-31T10:27:18'),
    acceptedAt: kyiv('2026-11-01T11:22:36'),
  },
  {
    email: 'yuliia.petrenko@demo',
    fullName: 'Юлія Петренко',
    roles: [{ role: 'RECRUITER', verticalId: g }],
    invitedAt: kyiv('2026-10-31T10:28:44'),
    acceptedAt: kyiv('2026-10-31T13:03:11'),
    deactivatedAt: kyiv('2026-11-02T09:45:32'),
  },
  {
    email: 'bohdan.polishchuk@demo',
    fullName: 'Богдан Поліщук',
    roles: [{ role: 'RECRUITER', verticalId: g }],
    invitedAt: kyiv('2026-10-30T09:11:26'),
    acceptedAt: null,
  },
];

/** The DB fixture deliberately does not fabricate Supabase identities or MFA factors. */
export async function seedDemo(
  source: Record<string, string | undefined>,
): Promise<void> {
  const { migrationUrl } = parseLocalDatabaseTargets(source);
  const client = postgres(migrationUrl, {
    prepare: false,
    max: 1,
    onnotice: () => undefined,
  });
  const db = drizzle(client, { schema });
  try {
    await assertDisposableLocalData(client);
    await db.transaction(async (tx) => {
      await tx.execute('SELECT pg_advisory_xact_lock(742918604)');
      const record = async (
        occurredAt: Date,
        type: string,
        subjectType: string,
        subjectId: string,
        verticalId?: string,
        payload: Record<string, unknown> = {},
      ) => {
        const [event] = await tx
          .insert(schema.entityEvent)
          .values({
            occurredAt,
            actorKind: 'SYSTEM',
            type,
            subjectType,
            subjectId,
            verticalId,
            payload: { v: 1, ...payload },
          })
          .returning({ id: schema.entityEvent.id });
        if (!event) throw new Error('Seed history insert failed');
        await tx.insert(schema.auditLog).values({
          occurredAt,
          actorKind: 'SYSTEM',
          action: type,
          // Audit rows name users 'user', as the services write them; events keep 'app_user'.
          entityType: subjectType === 'app_user' ? 'user' : subjectType,
          entityId: subjectId,
        });
      };
      for (const [key, name] of [
        ['gambling', 'Гемблінг'],
        ['crypto', 'Крипто'],
      ] as const) {
        const createdAt = DEMO_HISTORY.verticalsCreatedAt[key];
        const rows = await tx
          .insert(schema.vertical)
          .values({
            id: DEMO_VERTICALS[key],
            name,
            createdAt,
            updatedAt: createdAt,
          })
          .onConflictDoNothing()
          .returning({ id: schema.vertical.id });
        if (rows.length)
          await record(
            createdAt,
            'vertical.created',
            'vertical',
            DEMO_VERTICALS[key],
            DEMO_VERTICALS[key],
          );
      }
      // The bootstrap Admin has no earlier inviter, so Admin's own invite references Admin itself as `invitedBy`.
      const adminId = demoId('user:admin@demo');
      for (const user of DEMO_USERS) {
        const id = demoId(`user:${user.email}`);
        const { invitedAt, acceptedAt, deactivatedAt = null } = user;
        const rows = await tx
          .insert(schema.appUser)
          .values({
            id,
            email: user.email,
            fullName: user.fullName,
            isActive: deactivatedAt === null,
            deactivatedAt,
            deactivatedBy: deactivatedAt ? adminId : null,
            createdAt: invitedAt,
            updatedAt: deactivatedAt ?? acceptedAt ?? invitedAt,
          })
          .onConflictDoNothing()
          .returning({ id: schema.appUser.id });
        // Roles are granted with the invite, as the invite service does.
        await tx
          .insert(schema.userRole)
          .values(
            user.roles.map((role) => ({
              id: demoId(`role:${user.email}:${role.role}:${role.verticalId}`),
              userId: id,
              ...role,
              createdAt: invitedAt,
              createdBy: adminId,
            })),
          )
          .onConflictDoNothing();
        if (!rows.length) continue;
        // Every demo user came in by invite, so `user.invited` points at a real row; only the invitee's is still pending.
        const pending = acceptedAt === null;
        const invited = await tx
          .insert(schema.userInvite)
          .values({
            id: demoId(pending ? 'invite:expired' : `invite:${user.email}`),
            userId: id,
            tokenHash: createHash('sha256')
              .update(
                pending
                  ? 'hris:phase1:expired-demo-invite-no-usable-token'
                  : `hris:phase1:accepted-demo-invite:${user.email}`,
              )
              .digest(),
            roles: user.roles,
            sentAt: invitedAt,
            expiresAt: new Date(invitedAt.getTime() + 72 * 3_600_000),
            invitedBy: adminId,
            createdAt: invitedAt,
            ...(pending ? {} : { status: 'ACCEPTED' as const, acceptedAt }),
          })
          .onConflictDoNothing()
          .returning({ id: schema.userInvite.id });
        if (invited.length)
          await record(invitedAt, 'user.invited', 'app_user', id, undefined, {
            inviteId: invited[0]!.id,
            roles: user.roles,
          });
        if (deactivatedAt)
          await record(deactivatedAt, 'user.deactivated', 'app_user', id);
      }
      for (const [email, key, priority] of [
        ['vasyl.tl@demo', 'gambling', 0],
        ['taras.tl@demo', 'gambling', 1],
        ['tl.crypto@demo', 'crypto', 0],
      ] as const) {
        const userId = demoId(`user:${email}`);
        const verticalId = DEMO_VERTICALS[key];
        const setAt = DEMO_HISTORY.prioritiesSetAt[key];
        const rows = await tx
          .insert(schema.teamLeadPriority)
          .values({
            userId,
            verticalId,
            priority,
            updatedAt: setAt,
            updatedBy: adminId,
          })
          .onConflictDoNothing()
          .returning({ userId: schema.teamLeadPriority.userId });
        if (!rows.length) continue;
        // Same shapes as the priorities service: event on the Team Lead's own timeline (D73), audit on the vertical.
        await tx.insert(schema.entityEvent).values({
          occurredAt: setAt,
          actorKind: 'SYSTEM',
          type: 'vertical.tl_priority_changed',
          subjectType: 'app_user',
          subjectId: userId,
          verticalId,
          payload: { v: 1, userId, old: null, new: priority },
        });
        await tx.insert(schema.auditLog).values({
          occurredAt: setAt,
          actorKind: 'SYSTEM',
          action: 'vertical.tl_priority_changed',
          entityType: 'vertical',
          entityId: verticalId,
          before: { priority: null },
          after: { priority },
          details: { teamLead: userId },
        });
      }
      for (const [email, name, filters] of [
        ['admin@demo', 'Усі напрями', {}],
        ['head.recruiter.gambling@demo', 'Гемблінг', { verticalId: g }],
      ] as const) {
        const savedAt = DEMO_HISTORY.savedFiltersAt[email];
        const rows = await tx
          .insert(schema.savedFilter)
          .values({
            id: demoId(`filter:${email}`),
            userId: demoId(`user:${email}`),
            name,
            filters,
            createdAt: savedAt,
            updatedAt: savedAt,
          })
          .onConflictDoNothing()
          .returning({ id: schema.savedFilter.id });
        if (rows.length)
          await record(
            savedAt,
            'settings.updated',
            'saved_filter',
            rows[0]!.id,
          );
      }
    });
  } finally {
    await client.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  seedDemo(process.env)
    .then(() =>
      console.info(
        'Local Phase 1 database fixture loaded; Supabase Auth provisioning is separate',
      ),
    )
    .catch((error: unknown) => {
      console.error(
        `Phase 1 seed refused or failed (${toolErrorSummary(error)}); verify local environment and migration privileges`,
      );
      process.exitCode = 1;
    });
}
