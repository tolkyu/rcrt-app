import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  assertDisposableLocalData,
  parseLocalDatabaseTargets,
} from '../../../lib/env';
import { fixedClockNow } from '../../../lib/fixed-clock';
import * as schema from '../schema';
import { toolErrorSummary } from '../tool-error';

const DEMO_CLOCK = fixedClockNow();
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
export const DEMO_USERS: {
  email: string;
  fullName: string;
  roles: SeedRole[];
  inactive?: boolean;
}[] = [
  {
    email: 'admin@demo',
    fullName: 'Іван Коваленко',
    roles: [{ role: 'ADMIN', verticalId: null }],
  },
  {
    email: 'head.recruiter.gambling@demo',
    fullName: 'Олена Мельник',
    roles: [{ role: 'HEAD_RECRUITER', verticalId: g }],
  },
  {
    email: 'recruiter1.gambling@demo',
    fullName: 'Марія Шевченко',
    roles: [{ role: 'RECRUITER', verticalId: g }],
  },
  {
    email: 'recruiter2.gambling@demo',
    fullName: 'Андрій Бондар',
    roles: [{ role: 'RECRUITER', verticalId: g }],
  },
  {
    email: 'recruiter.crypto@demo',
    fullName: 'Софія Ткаченко',
    roles: [{ role: 'RECRUITER', verticalId: c }],
  },
  {
    email: 'head.hr@demo',
    fullName: 'Наталія Кравченко',
    roles: [
      { role: 'HEAD_HR', verticalId: g },
      { role: 'HEAD_HR', verticalId: c },
    ],
  },
  {
    email: 'hr@demo',
    fullName: 'Оксана Олійник',
    roles: [
      { role: 'HR', verticalId: g },
      { role: 'HR', verticalId: c },
    ],
  },
  {
    email: 'vasyl.tl@demo',
    fullName: 'Василь Мороз',
    roles: [{ role: 'TEAM_LEAD', verticalId: g }],
  },
  {
    email: 'taras.tl@demo',
    fullName: 'Тарас Лисенко',
    roles: [{ role: 'TEAM_LEAD', verticalId: g }],
  },
  {
    email: 'tl.crypto@demo',
    fullName: 'Дмитро Савченко',
    roles: [{ role: 'TEAM_LEAD', verticalId: c }],
  },
  {
    email: 'finance@demo',
    fullName: 'Ірина Романенко',
    roles: [{ role: 'FINANCE', verticalId: null }],
  },
  {
    email: 'inactive.recruiter@demo',
    fullName: 'Юлія Петренко',
    inactive: true,
    roles: [{ role: 'RECRUITER', verticalId: g }],
  },
  { email: 'expired.invite@demo', fullName: 'Богдан Поліщук', roles: [] },
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
        type: string,
        subjectType: string,
        subjectId: string,
        verticalId?: string,
      ) => {
        const [event] = await tx
          .insert(schema.entityEvent)
          .values({
            occurredAt: DEMO_CLOCK,
            actorKind: 'SYSTEM',
            type,
            subjectType,
            subjectId,
            verticalId,
            payload: { v: 1 },
          })
          .returning({ id: schema.entityEvent.id });
        if (!event) throw new Error('Seed history insert failed');
        await tx.insert(schema.auditLog).values({
          occurredAt: DEMO_CLOCK,
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
        const rows = await tx
          .insert(schema.vertical)
          .values({
            id: DEMO_VERTICALS[key],
            name,
            createdAt: DEMO_CLOCK,
            updatedAt: DEMO_CLOCK,
          })
          .onConflictDoNothing()
          .returning({ id: schema.vertical.id });
        if (rows.length)
          await record(
            'vertical.created',
            'vertical',
            DEMO_VERTICALS[key],
            DEMO_VERTICALS[key],
          );
      }
      const adminId = demoId('user:admin@demo');
      for (const user of DEMO_USERS) {
        const id = demoId(`user:${user.email}`);
        const rows = await tx
          .insert(schema.appUser)
          .values({
            id,
            email: user.email,
            fullName: user.fullName,
            isActive: !user.inactive,
            deactivatedAt: user.inactive ? DEMO_CLOCK : null,
            deactivatedBy: user.inactive ? adminId : null,
            createdAt: DEMO_CLOCK,
            updatedAt: DEMO_CLOCK,
          })
          .onConflictDoNothing()
          .returning({ id: schema.appUser.id });
        if (rows.length) {
          await record('user.invited', 'app_user', id);
          if (user.inactive) await record('user.deactivated', 'app_user', id);
        }
        for (const role of user.roles) {
          const assigned = await tx
            .insert(schema.userRole)
            .values({
              id: demoId(`role:${user.email}:${role.role}:${role.verticalId}`),
              userId: id,
              ...role,
              createdAt: DEMO_CLOCK,
              createdBy: adminId,
            })
            .onConflictDoNothing()
            .returning({ id: schema.userRole.id });
          if (assigned.length)
            await record(
              'user.role_assigned',
              'user_role',
              assigned[0]!.id,
              role.verticalId ?? undefined,
            );
        }
      }
      for (const [email, verticalId, priority] of [
        ['vasyl.tl@demo', g, 0],
        ['taras.tl@demo', g, 1],
        ['tl.crypto@demo', c, 0],
      ] as const) {
        const userId = demoId(`user:${email}`);
        const rows = await tx
          .insert(schema.teamLeadPriority)
          .values({
            userId,
            verticalId,
            priority,
            updatedAt: DEMO_CLOCK,
            updatedBy: adminId,
          })
          .onConflictDoNothing()
          .returning({ userId: schema.teamLeadPriority.userId });
        if (rows.length)
          await record(
            'vertical.tl_priority_changed',
            'team_lead_priority',
            `${verticalId}:${userId}`,
            verticalId,
          );
      }
      const sentAt = new Date('2020-01-10T08:00:00.000Z');
      await tx
        .insert(schema.userInvite)
        .values({
          id: demoId('invite:expired'),
          userId: demoId('user:expired.invite@demo'),
          tokenHash: createHash('sha256')
            .update('hris:phase1:expired-demo-invite-no-usable-token')
            .digest(),
          roles: [{ role: 'RECRUITER', verticalId: g }],
          sentAt,
          expiresAt: new Date('2020-01-13T08:00:00.000Z'),
          invitedBy: adminId,
          createdAt: sentAt,
        })
        .onConflictDoNothing();
      for (const [email, name, filters] of [
        ['admin@demo', 'Усі напрями', {}],
        ['head.recruiter.gambling@demo', 'Гемблінг', { verticalId: g }],
      ] as const) {
        const rows = await tx
          .insert(schema.savedFilter)
          .values({
            id: demoId(`filter:${email}`),
            userId: demoId(`user:${email}`),
            name,
            filters,
            createdAt: DEMO_CLOCK,
            updatedAt: DEMO_CLOCK,
          })
          .onConflictDoNothing()
          .returning({ id: schema.savedFilter.id });
        if (rows.length)
          await record('settings.updated', 'saved_filter', rows[0]!.id);
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
