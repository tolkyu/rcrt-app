import { pathToFileURL } from 'node:url';
import { inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  assertDisposableLocalData,
  parseLocalDatabaseTargets,
} from '../../../lib/env';
import { positionNameKey } from '../../../lib/position-name';
import * as schema from '../schema';
import { toolErrorSummary } from '../tool-error';
import { DEMO_VERTICALS, demoId, kyiv } from './index';

type VerticalKey = keyof typeof DEMO_VERTICALS;
type DemoEmail =
  | 'admin@demo'
  | 'head.recruiter.gambling@demo'
  | 'recruiter1.gambling@demo'
  | 'recruiter2.gambling@demo'
  | 'recruiter.crypto@demo'
  | 'vasyl.tl@demo'
  | 'taras.tl@demo'
  | 'tl.crypto@demo';

interface SeedPosition {
  key: string;
  vertical: VerticalKey;
  name: string;
  createdBy: DemoEmail;
  createdAt: Date;
  isActive?: false;
  updatedAt?: Date;
}

interface SeedVacancy {
  key: string;
  vertical: VerticalKey;
  position: string | null;
  title: string;
  teamLead: DemoEmail | null;
  createdBy: DemoEmail;
  createdAt: Date;
  status: (typeof schema.vacancy.$inferInsert)['status'];
  headcount?: number;
  seniority?: string;
  workFormat?: (typeof schema.vacancy.$inferInsert)['workFormat'];
  employmentType?: string;
  location?: string;
  salary?: { min: bigint; max: bigint; currency: string };
  priority?: 'URGENT';
  source?: 'TELEGRAM_BOT';
  closedAt?: Date;
  updatedAt?: Date;
  recruiters?: { email: DemoEmail; assignedAt: Date; assignedBy: DemoEmail }[];
  deleted?: { at: Date; by: DemoEmail; reason: string };
}

const HEAD = 'head.recruiter.gambling@demo';
const FULL_TIME = 'Повна зайнятість';

/** Catalogs follow the owner's D75: Head Recruiter curates Гемблінг, Admin curates Крипто (no crypto Head Recruiter exists). */
export const DEMO_POSITIONS: readonly SeedPosition[] = [
  {
    key: 'gambling-media-buyer-facebook',
    vertical: 'gambling',
    name: 'Медіабаєр — Facebook',
    createdBy: HEAD,
    createdAt: kyiv('2026-10-31T11:20:08'),
  },
  {
    key: 'gambling-media-buyer-tiktok',
    vertical: 'gambling',
    name: 'Медіабаєр — TikTok',
    createdBy: HEAD,
    createdAt: kyiv('2026-10-31T11:21:41'),
  },
  {
    key: 'gambling-affiliate-manager',
    vertical: 'gambling',
    name: 'Афілейт-менеджер',
    createdBy: HEAD,
    createdAt: kyiv('2026-10-31T11:23:15'),
  },
  {
    key: 'gambling-creative-designer',
    vertical: 'gambling',
    name: 'Крео-дизайнер',
    createdBy: HEAD,
    createdAt: kyiv('2026-10-31T11:25:02'),
  },
  {
    key: 'gambling-support-manager',
    vertical: 'gambling',
    name: 'Саппорт-менеджер',
    createdBy: HEAD,
    createdAt: kyiv('2026-10-31T11:26:30'),
    isActive: false,
    updatedAt: kyiv('2026-11-02T14:10:44'),
  },
  {
    key: 'crypto-trader',
    vertical: 'crypto',
    name: 'Крипто-трейдер',
    createdBy: 'admin@demo',
    createdAt: kyiv('2026-10-31T12:05:19'),
  },
  {
    key: 'crypto-community-manager',
    vertical: 'crypto',
    name: 'Community-менеджер',
    createdBy: 'admin@demo',
    createdAt: kyiv('2026-10-31T12:06:47'),
  },
  {
    key: 'crypto-onchain-analyst',
    vertical: 'crypto',
    name: 'Аналітик on-chain',
    createdBy: 'admin@demo',
    createdAt: kyiv('2026-10-31T12:08:03'),
  },
];

/**
 * Chronological by creation time: the identity sequence hands out V-0001… in this order on a fresh
 * database. The only FILLED row is a display fixture for the closed-urgent styling (D99); real
 * fills require a hire (ADR-012).
 */
export const DEMO_VACANCIES: readonly SeedVacancy[] = [
  {
    key: 'vasyl-facebook-senior',
    vertical: 'gambling',
    position: 'gambling-media-buyer-facebook',
    title: 'Медіабаєр — Facebook',
    teamLead: 'vasyl.tl@demo',
    createdBy: 'vasyl.tl@demo',
    createdAt: kyiv('2026-10-31T13:20:44'),
    status: 'OPEN',
    headcount: 2,
    priority: 'URGENT',
    seniority: 'Сеніор',
    workFormat: 'REMOTE',
    employmentType: FULL_TIME,
    location: 'Київ',
    salary: { min: 200000n, max: 350000n, currency: 'USD' },
    recruiters: [
      {
        email: 'recruiter1.gambling@demo',
        assignedAt: kyiv('2026-10-31T13:45:10'),
        assignedBy: HEAD,
      },
      {
        email: 'recruiter2.gambling@demo',
        assignedAt: kyiv('2026-10-31T13:46:03'),
        assignedBy: HEAD,
      },
    ],
  },
  {
    key: 'vasyl-tiktok-on-hold',
    vertical: 'gambling',
    position: 'gambling-media-buyer-tiktok',
    title: 'Медіабаєр — TikTok',
    teamLead: 'vasyl.tl@demo',
    createdBy: 'vasyl.tl@demo',
    createdAt: kyiv('2026-10-31T15:05:30'),
    updatedAt: kyiv('2026-11-02T12:15:21'),
    status: 'ON_HOLD',
    priority: 'URGENT',
    seniority: 'Мідл',
    workFormat: 'REMOTE',
    employmentType: FULL_TIME,
    recruiters: [
      {
        email: 'recruiter2.gambling@demo',
        assignedAt: kyiv('2026-10-31T15:30:12'),
        assignedBy: HEAD,
      },
    ],
  },
  {
    key: 'crypto-trader-open',
    vertical: 'crypto',
    position: 'crypto-trader',
    title: 'Крипто-трейдер',
    teamLead: 'tl.crypto@demo',
    createdBy: 'tl.crypto@demo',
    createdAt: kyiv('2026-10-31T17:10:12'),
    status: 'OPEN',
    seniority: 'Мідл',
    workFormat: 'HYBRID',
    employmentType: FULL_TIME,
    location: 'Київ',
    salary: { min: 150000n, max: 250000n, currency: 'USD' },
    recruiters: [
      {
        email: 'recruiter.crypto@demo',
        assignedAt: kyiv('2026-10-31T17:30:45'),
        assignedBy: 'admin@demo',
      },
    ],
  },
  {
    key: 'taras-facebook',
    vertical: 'gambling',
    position: 'gambling-media-buyer-facebook',
    title: 'Медіабаєр — Facebook',
    teamLead: 'taras.tl@demo',
    createdBy: 'taras.tl@demo',
    createdAt: kyiv('2026-11-01T10:30:21'),
    status: 'OPEN',
    seniority: 'Мідл',
    workFormat: 'REMOTE',
    employmentType: FULL_TIME,
    location: 'Львів',
    recruiters: [
      {
        email: 'recruiter1.gambling@demo',
        assignedAt: kyiv('2026-11-01T11:02:19'),
        assignedBy: HEAD,
      },
    ],
  },
  {
    key: 'taras-affiliate-unassigned',
    vertical: 'gambling',
    position: 'gambling-affiliate-manager',
    title: 'Афілейт-менеджер',
    teamLead: 'taras.tl@demo',
    createdBy: 'taras.tl@demo',
    createdAt: kyiv('2026-11-01T11:48:05'),
    status: 'OPEN',
    workFormat: 'HYBRID',
    employmentType: FULL_TIME,
    location: 'Київ',
  },
  {
    key: 'taras-affiliate-cancelled',
    vertical: 'gambling',
    position: 'gambling-affiliate-manager',
    title: 'Афілейт-менеджер — ринок Польщі',
    teamLead: 'taras.tl@demo',
    createdBy: 'taras.tl@demo',
    createdAt: kyiv('2026-11-01T14:10:02'),
    closedAt: kyiv('2026-11-02T16:20:40'),
    updatedAt: kyiv('2026-11-02T16:20:40'),
    status: 'CANCELLED',
    priority: 'URGENT',
    workFormat: 'REMOTE',
    employmentType: FULL_TIME,
    recruiters: [
      {
        email: 'recruiter2.gambling@demo',
        assignedAt: kyiv('2026-11-01T14:30:27'),
        assignedBy: HEAD,
      },
    ],
  },
  {
    key: 'crypto-community-unassigned',
    vertical: 'crypto',
    position: 'crypto-community-manager',
    title: 'Community-менеджер',
    teamLead: 'tl.crypto@demo',
    createdBy: 'tl.crypto@demo',
    createdAt: kyiv('2026-11-02T09:15:40'),
    status: 'OPEN',
    seniority: 'Джуніор',
    workFormat: 'REMOTE',
    employmentType: FULL_TIME,
  },
  {
    key: 'vasyl-tiktok-draft',
    vertical: 'gambling',
    position: null,
    title: 'Медіабаєр — TikTok (нова команда)',
    teamLead: 'vasyl.tl@demo',
    createdBy: 'vasyl.tl@demo',
    createdAt: kyiv('2026-11-02T09:42:18'),
    status: 'DRAFT',
    headcount: 3,
  },
  {
    key: 'vasyl-long-title',
    vertical: 'gambling',
    position: 'gambling-media-buyer-facebook',
    title:
      'Старший медіабаєр (Facebook + TikTok) для запуску нового ГЕО на ринки Латинської Америки та Східної Європи з бюджетом від 50 000 USD на місяць',
    teamLead: 'vasyl.tl@demo',
    createdBy: 'vasyl.tl@demo',
    createdAt: kyiv('2026-11-02T10:20:55'),
    status: 'OPEN',
    seniority: 'Сеніор',
    workFormat: 'REMOTE',
    employmentType: FULL_TIME,
    recruiters: [
      {
        email: 'recruiter1.gambling@demo',
        assignedAt: kyiv('2026-11-02T10:41:36'),
        assignedBy: HEAD,
      },
    ],
  },
  {
    key: 'recruiter-initiated-creative',
    vertical: 'gambling',
    position: 'gambling-creative-designer',
    title: 'Крео-дизайнер',
    teamLead: null,
    createdBy: 'recruiter1.gambling@demo',
    createdAt: kyiv('2026-11-02T11:05:33'),
    status: 'OPEN',
    workFormat: 'REMOTE',
    recruiters: [
      {
        email: 'recruiter1.gambling@demo',
        assignedAt: kyiv('2026-11-02T11:05:33'),
        assignedBy: 'recruiter1.gambling@demo',
      },
    ],
  },
  {
    key: 'taras-telegram-video',
    vertical: 'gambling',
    position: 'gambling-creative-designer',
    title: 'Відеомонтажер крео-матеріалів',
    teamLead: 'taras.tl@demo',
    createdBy: 'taras.tl@demo',
    createdAt: kyiv('2026-11-02T12:40:07'),
    status: 'OPEN',
    source: 'TELEGRAM_BOT',
    workFormat: 'REMOTE',
  },
  {
    key: 'crypto-onchain-urgent',
    vertical: 'crypto',
    position: 'crypto-onchain-analyst',
    title: 'Аналітик on-chain',
    teamLead: 'tl.crypto@demo',
    createdBy: 'tl.crypto@demo',
    createdAt: kyiv('2026-11-02T13:25:50'),
    status: 'OPEN',
    priority: 'URGENT',
    seniority: 'Сеніор',
    workFormat: 'REMOTE',
    employmentType: FULL_TIME,
    salary: { min: 300000n, max: 450000n, currency: 'USD' },
    recruiters: [
      {
        email: 'recruiter.crypto@demo',
        assignedAt: kyiv('2026-11-02T13:50:18'),
        assignedBy: 'admin@demo',
      },
    ],
  },
  {
    key: 'taras-facebook-duplicate-deleted',
    vertical: 'gambling',
    position: 'gambling-media-buyer-facebook',
    title: 'Медіабаєр — Facebook (дубль)',
    teamLead: 'taras.tl@demo',
    createdBy: 'taras.tl@demo',
    createdAt: kyiv('2026-11-02T14:02:11'),
    updatedAt: kyiv('2026-11-02T15:30:12'),
    status: 'DRAFT',
    deleted: {
      at: kyiv('2026-11-02T15:30:12'),
      by: HEAD,
      reason: 'Дублікат вакансії',
    },
  },
  {
    key: 'crypto-trader-filled-urgent',
    vertical: 'crypto',
    position: 'crypto-trader',
    title: 'Крипто-трейдер (команда закрита)',
    teamLead: 'tl.crypto@demo',
    createdBy: 'tl.crypto@demo',
    createdAt: kyiv('2026-11-02T16:10:26'),
    closedAt: kyiv('2026-11-02T18:05:12'),
    updatedAt: kyiv('2026-11-02T18:05:12'),
    status: 'FILLED',
    priority: 'URGENT',
    seniority: 'Сеніор',
    workFormat: 'REMOTE',
    employmentType: FULL_TIME,
    recruiters: [
      {
        email: 'recruiter.crypto@demo',
        assignedAt: kyiv('2026-11-02T16:30:40'),
        assignedBy: 'admin@demo',
      },
    ],
  },
];

export const demoPositionId = (key: string) => demoId(`position:${key}`);
export const demoVacancyId = (key: string) => demoId(`vacancy:${key}`);

const SEED_LOCK = 742918606;

const referencedEmails = (): DemoEmail[] => [
  ...new Set(
    [
      ...DEMO_POSITIONS.map((p) => p.createdBy),
      ...DEMO_VACANCIES.flatMap((v) => [
        v.createdBy,
        ...(v.teamLead ? [v.teamLead] : []),
        ...(v.deleted ? [v.deleted.by] : []),
        ...(v.recruiters ?? []).flatMap((r) => [r.email, r.assignedBy]),
      ]),
    ].sort(),
  ),
];

/** Needs `db:seed` first; existing rows are never modified, so edits made through the app survive a re-run. */
export async function seedDemoVacancies(
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
      await tx.execute(sql`select pg_advisory_xact_lock(${SEED_LOCK})`);
      const emails = referencedEmails();
      const users = await tx
        .select({ id: schema.appUser.id, email: schema.appUser.email })
        .from(schema.appUser)
        .where(inArray(schema.appUser.email, emails));
      const userId = new Map(users.map((u) => [u.email, u.id]));
      const need = (email: DemoEmail): string => {
        const id = userId.get(email);
        if (!id) throw new Error(`Demo user ${email} is missing; run db:seed`);
        return id;
      };

      await tx
        .insert(schema.position)
        .values(
          DEMO_POSITIONS.map((p) => ({
            id: demoPositionId(p.key),
            verticalId: DEMO_VERTICALS[p.vertical],
            name: p.name,
            nameKey: positionNameKey(p.name),
            isActive: p.isActive ?? true,
            createdBy: need(p.createdBy),
            createdAt: p.createdAt,
            updatedAt: p.updatedAt ?? p.createdAt,
          })),
        )
        .onConflictDoNothing();

      // Conflicting inserts would still consume identity values, so only missing rows are inserted.
      const existing = new Set(
        (
          await tx
            .select({ id: schema.vacancy.id })
            .from(schema.vacancy)
            .where(
              inArray(
                schema.vacancy.id,
                DEMO_VACANCIES.map((v) => demoVacancyId(v.key)),
              ),
            )
        ).map((row) => row.id),
      );
      for (const v of DEMO_VACANCIES) {
        const id = demoVacancyId(v.key);
        if (existing.has(id)) continue;
        await tx.insert(schema.vacancy).values({
          id,
          verticalId: DEMO_VERTICALS[v.vertical],
          positionId: v.position ? demoPositionId(v.position) : null,
          title: v.title,
          teamLeadId: v.teamLead ? need(v.teamLead) : null,
          recruiterInitiated: v.teamLead === null,
          status: v.status,
          headcount: v.headcount ?? 1,
          seniority: v.seniority ?? null,
          workFormat: v.workFormat ?? null,
          employmentType: v.employmentType ?? null,
          location: v.location ?? null,
          salaryMinMinor: v.salary?.min ?? null,
          salaryMaxMinor: v.salary?.max ?? null,
          salaryCurrency: v.salary?.currency ?? null,
          priorityFlag: v.priority ?? 'NORMAL',
          source: v.source ?? 'APP',
          openedAt: v.status === 'DRAFT' ? null : v.createdAt,
          closedAt: v.closedAt ?? null,
          createdBy: need(v.createdBy),
          deletedAt: v.deleted?.at ?? null,
          deletedBy: v.deleted ? need(v.deleted.by) : null,
          deleteReason: v.deleted?.reason ?? null,
          createdAt: v.createdAt,
          updatedAt: v.updatedAt ?? v.createdAt,
        });
        if (v.recruiters?.length)
          await tx.insert(schema.vacancyRecruiter).values(
            v.recruiters.map((r) => ({
              vacancyId: id,
              userId: need(r.email),
              assignedAt: r.assignedAt,
              assignedBy: need(r.assignedBy),
            })),
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
  seedDemoVacancies(process.env)
    .then(() => console.info('Local vacancy fixture loaded'))
    .catch((error: unknown) => {
      console.error(
        `Vacancy seed refused or failed (${toolErrorSummary(error)}); run db:seed first and verify the local environment`,
      );
      process.exitCode = 1;
    });
}
