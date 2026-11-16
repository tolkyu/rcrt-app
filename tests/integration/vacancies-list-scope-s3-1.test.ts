import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CreateVacancyInput } from '../../lib/schemas/vacancy';
import * as schema from '../../server/db/schema';
import { cancelVacancyDraft } from '../../server/services/vacancy-draft';
import { createVacancy, listVacancyPage } from '../../server/services/vacancy';
import {
  addUser,
  createScenarioRunner,
  NOW,
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

const roles = () => rolesOf(world);
const ids = (page: Awaited<ReturnType<typeof listVacancyPage>>) =>
  page.items.map((item) => item.id);
const input = (mode: 'DRAFT' | 'PUBLISH', title: string) =>
  ({
    mode,
    verticalId: world.verticals.v1,
    title,
    ...(mode === 'PUBLISH' ? { positionId: world.positions.p1 } : {}),
  }) as CreateVacancyInput;

/** The reader types that must never learn of another author's draft through the new «Усі» predicate (D110). */
const FOREIGN = [
  'recruiter',
  'head',
  'admin',
  'teamLead',
  'hr',
  'headHr',
  'headOther',
  'recruiterOther',
] as const;

describe('the status-less list predicate never widens a role scope [D110, D92, D98, D112]', () => {
  it('a foreign reader finds another author’s draft and cancelled draft under no status filter, DRAFT or CANCELLED, by title and by number', async () => {
    await scenario(async (s) => {
      const tag = `Чужа ${randomUUID().slice(0, 8)}`;
      const author = await s.as(roles().recruiter);
      const draft = await createVacancy(
        author,
        input('DRAFT', `${tag} чернетка`),
        randomUUID(),
      );
      const cancelled = await createVacancy(
        author,
        input('DRAFT', `${tag} скасована`),
        randomUUID(),
      );
      await cancelVacancyDraft(author, cancelled.id, { reason: 'Причина' });

      for (const who of FOREIGN) {
        const reader = await s.as(roles()[who], { userId: randomUUID() });
        for (const status of [undefined, 'DRAFT', 'CANCELLED'] as const)
          for (const q of [
            undefined,
            tag,
            draft.number,
            cancelled.number.toLowerCase(),
          ] as const) {
            const filters = {
              limit: 100 as const,
              ...(status ? { status } : {}),
              ...(q ? { q } : {}),
            };
            const listed = ids(await listVacancyPage(reader, filters));
            const where = `${who} ${JSON.stringify(filters)}`;
            expect(listed, where).not.toContain(draft.id);
            expect(listed, where).not.toContain(cancelled.id);
          }
      }
    });
  });

  it('a vacancy cancelled after it was OPEN stays in «Усі» and «Скасовані» for everyone in its scope, the author included', async () => {
    await scenario(async (s) => {
      const tag = `Скасована після відкриття ${randomUUID().slice(0, 8)}`;
      const author = await s.as(roles().recruiter);
      const created = await createVacancy(
        author,
        input('PUBLISH', tag),
        randomUUID(),
      );
      await s.tx
        .update(schema.vacancy)
        .set({ status: 'CANCELLED', closedAt: NOW, cancelledAt: NOW })
        .where(eq(schema.vacancy.id, created.id));
      for (const who of ['recruiter', 'head', 'admin'] as const) {
        const reader = await s.as(roles()[who], {
          userId: who === 'recruiter' ? s.actorId : randomUUID(),
        });
        for (const status of [undefined, 'CANCELLED'] as const)
          expect(
            ids(
              await listVacancyPage(reader, {
                limit: 100,
                q: tag,
                ...(status ? { status } : {}),
              }),
            ),
            `${who} ${status ?? 'all'}`,
          ).toEqual([created.id]);
      }
      for (const who of ['headOther', 'recruiterOther'] as const)
        expect(
          ids(
            await listVacancyPage(
              await s.as(roles()[who], { userId: randomUUID() }),
              { limit: 100, q: tag },
            ),
          ),
          who,
        ).toEqual([]);
    });
  });

  it('an author who lost the authoring role no longer lists their own draft under any status, and still lists published work only through the role scope', async () => {
    await scenario(async (s) => {
      const tag = `Втрата ${randomUUID().slice(0, 8)}`;
      const authorId = await addUser(s.tx, { roles: roles().recruiter });
      const mine = await createVacancy(
        await s.as(roles().recruiter, { userId: authorId }),
        input('DRAFT', tag),
        randomUUID(),
      );
      for (const lost of [roles().teamLead, roles().hr, roles().recruiterOther]) {
        const ctx = await s.as(lost, { userId: authorId });
        for (const status of [undefined, 'DRAFT', 'CANCELLED'] as const)
          expect(
            ids(
              await listVacancyPage(ctx, {
                limit: 100,
                q: tag,
                ...(status ? { status } : {}),
              }),
            ),
            JSON.stringify([lost, status]),
          ).toEqual([]);
      }
      expect(
        await problem(
          listVacancyPage(await s.as(roles().none, { userId: authorId }), {
            limit: 100,
          }),
        ),
      ).toMatchObject({ status: 404 });
      expect(mine.status).toBe('DRAFT');
    });
  });
});
