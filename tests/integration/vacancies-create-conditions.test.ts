import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CreateVacancyInput } from '../../lib/schemas/vacancy';
import * as schema from '../../server/db/schema';
import { createVacancy } from '../../server/services/vacancy';
import {
  createScenarioRunner,
  problem,
  rolesOf,
} from '../support/vacancy-write-harness';
import {
  createVacancyWorld,
  type VacancyWorld,
} from '../support/vacancy-world';
import { connectTestDatabase, testDatabaseUrls } from './database';

const urls = testDatabaseUrls();
const admin = connectTestDatabase(urls.migration);
const client = postgres(urls.runtime, { max: 4, prepare: false });
let world: VacancyWorld;
let scenario: ReturnType<typeof createScenarioRunner>;

beforeAll(async () => {
  world = await createVacancyWorld(admin);
  scenario = createScenarioRunner(client);
});
afterAll(async () => {
  await world.cleanup();
  await Promise.all([admin.end(), client.end()]);
});

const key = () => randomUUID();
const publish = (overrides: Record<string, unknown> = {}): CreateVacancyInput =>
  ({
    mode: 'PUBLISH',
    verticalId: world.verticals.v1,
    positionId: world.positions.p1,
    title: 'Медіабаєр — Facebook',
    ...overrides,
  }) as CreateVacancyInput;
const draft = (overrides: Record<string, unknown> = {}): CreateVacancyInput =>
  ({
    mode: 'DRAFT',
    verticalId: world.verticals.v1,
    title: 'Чернетка — TikTok',
    ...overrides,
  }) as CreateVacancyInput;

const conditions = {
  seniority: 'Сеніор',
  workFormat: 'REMOTE',
  employmentType: 'Часткова зайнятість',
  location: '  Київ   Поділ ',
  salaryMinMinor: '250000',
  salaryMaxMinor: '400050',
  salaryCurrency: 'USD',
} as const;
const stored = {
  seniority: 'Сеніор',
  workFormat: 'REMOTE',
  employmentType: 'Часткова зайнятість',
  location: 'Київ Поділ',
  salaryMinMinor: '250000',
  salaryMaxMinor: '400050',
  salaryCurrency: 'USD',
} as const;
const empty = {
  seniority: null,
  workFormat: null,
  employmentType: null,
  location: null,
  salaryMinMinor: null,
  salaryMaxMinor: null,
  salaryCurrency: null,
};

describe('group «Умови» is stored by the create service [STORY-VAC-01-1, VAC-01, D114..D116]', () => {
  it.each([
    ['a Recruiter publishing', 'recruiter', publish],
    ['a Recruiter saving a draft', 'recruiter', draft],
    ['a Head Recruiter publishing', 'head', publish],
    ['a Head Recruiter saving a draft', 'head', draft],
  ] as const)(
    '%s keeps every term, trims the location and stores the amounts as minor units',
    async (_name, who, build) => {
      await scenario(async (s) => {
        const ctx = await s.as(rolesOf(world)[who]);
        const created = await createVacancy(ctx, build(conditions), key());
        expect(created).toMatchObject({ ...stored, probationDays: 90 });
        const [row] = await s.tx
          .select()
          .from(schema.vacancy)
          .where(eq(schema.vacancy.id, created.id));
        expect(row).toMatchObject({
          seniority: 'Сеніор',
          workFormat: 'REMOTE',
          employmentType: 'Часткова зайнятість',
          location: 'Київ Поділ',
          salaryMinMinor: 250000n,
          salaryMaxMinor: 400050n,
          salaryCurrency: 'USD',
          probationDays: 90,
        });
      });
    },
  );

  it.each([
    ['omitted', {}],
    ['sent as null', empty],
  ] as const)(
    'terms that are %s are stored as nothing, in both modes',
    async (_name, extra) => {
      await scenario(async (s) => {
        const ctx = await s.as(rolesOf(world).head);
        for (const build of [publish, draft])
          expect(
            await createVacancy(ctx, build(extra), key()),
            build.name,
          ).toMatchObject(empty);
      });
    },
  );

  it('stores one bound with its currency and no other', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(rolesOf(world).recruiter);
      expect(
        await createVacancy(
          ctx,
          draft({ salaryMaxMinor: '500000', salaryCurrency: 'EUR' }),
          key(),
        ),
      ).toMatchObject({
        salaryMinMinor: null,
        salaryMaxMinor: '500000',
        salaryCurrency: 'EUR',
      });
    });
  });
});

describe('probation length at creation, who may send it [D78, D115, PROB-02]', () => {
  const roles = () => rolesOf(world);

  it.each([30, 60, 90])(
    'an Admin stores %i days, in both modes',
    async (probationDays) => {
      await scenario(async (s) => {
        const ctx = await s.as(roles().admin);
        for (const build of [publish, draft])
          expect(
            await createVacancy(ctx, build({ probationDays }), key()),
            build.name,
          ).toMatchObject({ probationDays });
      });
    },
  );

  it.each([
    ['recruiter', 403, 'FORBIDDEN'],
    ['head', 403, 'FORBIDDEN'],
    ['teamLeadAndRecruiter', 403, 'FORBIDDEN'],
    ['hr', 403, 'FORBIDDEN'],
    ['headHr', 403, 'FORBIDDEN'],
    ['headOther', 404, 'NOT_FOUND'],
    ['finance', 404, 'NOT_FOUND'],
    ['none', 404, 'NOT_FOUND'],
  ] as const)(
    'a user with the roles of %s is refused with %i %s, in both modes, and nothing is written',
    async (who, status, code) => {
      await scenario(async (s) => {
        const ctx = await s.as(roles()[who]);
        const before = await s.tx.select().from(schema.vacancy);
        for (const build of [publish, draft])
          expect(
            await problem(
              createVacancy(ctx, build({ probationDays: 60 }), key()),
            ),
            build.name,
          ).toMatchObject({ status, code });
        expect(await s.tx.select().from(schema.vacancy)).toHaveLength(
          before.length,
        );
      });
    },
  );

  it('keeps the default of 90 days when an author sends no probation', async () => {
    await scenario(async (s) => {
      for (const who of ['admin', 'head', 'recruiter'] as const)
        expect(
          await createVacancy(await s.as(roles()[who]), publish(), key()),
          who,
        ).toMatchObject({ probationDays: 90 });
    });
  });
});
