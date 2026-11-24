import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CreateVacancyInput } from '../../lib/schemas/vacancy';
import {
  countOwnDrafts,
  createVacancy,
  listVacancyPage,
} from '../../server/services/vacancy';
import {
  cancelVacancyDraft,
  deleteVacancyDraft,
  publishVacancyDraft,
} from '../../server/services/vacancy-draft';
import {
  createScenarioRunner,
  problem,
  rolesOf,
  type Roles,
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
type Who = keyof ReturnType<typeof roles>;
const key = () => randomUUID();
const draft = (title: string, verticalId = world.verticals.v1) =>
  ({ mode: 'DRAFT', verticalId, title }) as CreateVacancyInput;

describe('Own draft count for the «Чернетки» chip [STORY-VAC-01-3 AC1, D110, D92, D112(3)]', () => {
  const authors: Who[] = ['recruiter', 'head', 'admin'];

  it.each(authors)(
    'counts only the live drafts of the author (%s) and agrees with the «Чернетки» list',
    async (author) => {
      await scenario(async (s) => {
        const ctx = await s.as(roles()[author]);
        expect((await countOwnDrafts(ctx)).count).toBe(
          (await listVacancyPage(ctx, { limit: 100, status: 'DRAFT' })).items
            .length,
        );
        const before = (await countOwnDrafts(ctx)).count;
        await createVacancy(ctx, draft('Чернетка 1'), key());
        const second = await createVacancy(ctx, draft('Чернетка 2'), key());
        expect((await countOwnDrafts(ctx)).count).toBe(before + 2);

        await deleteVacancyDraft(ctx, second.id);
        expect((await countOwnDrafts(ctx)).count).toBe(before + 1);
        expect(
          (await listVacancyPage(ctx, { limit: 100, status: 'DRAFT' })).items
            .length,
        ).toBe(before + 1);
      });
    },
  );

  it('does not count a published, cancelled or deleted draft', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(roles().head);
      const before = (await countOwnDrafts(ctx)).count;
      const published = await createVacancy(
        ctx,
        { ...draft('Опублікована'), positionId: world.positions.p1 },
        key(),
      );
      const cancelled = await createVacancy(ctx, draft('Скасована'), key());
      const deleted = await createVacancy(ctx, draft('Видалена'), key());
      const kept = await createVacancy(ctx, draft('Лишається'), key());
      expect((await countOwnDrafts(ctx)).count).toBe(before + 4);

      await publishVacancyDraft(ctx, published.id, key(), {
        expectedVersion: published.version,
      });
      await cancelVacancyDraft(ctx, cancelled.id, { reason: 'Не потрібна' });
      await deleteVacancyDraft(ctx, deleted.id);

      const after = (await countOwnDrafts(ctx)).count;
      const listed = await listVacancyPage(ctx, {
        limit: 100,
        status: 'DRAFT',
      });
      expect(after).toBe(listed.items.length);
      expect(listed.items.map((item) => item.id)).toContain(kept.id);
      expect(listed.items.map((item) => item.id)).not.toContain(cancelled.id);
      expect(after).toBe(before + 1);
    });
  });

  it('never counts the drafts of another user, whatever the role', async () => {
    await scenario(async (s) => {
      const author = await s.as(roles().recruiter);
      await createVacancy(author, draft('Чужа чернетка'), key());
      await createVacancy(author, draft('Чужа чернетка 2'), key());

      const readers: Who[] = [
        'head',
        'admin',
        'recruiterOther',
        'headOther',
        'teamLead',
        'hr',
        'headHr',
      ];
      for (const reader of readers) {
        const ctx = await s.as(roles()[reader], { userId: randomUUID() });
        expect(await countOwnDrafts(ctx), reader).toEqual({ count: 0 });
      }
    });
  });

  it('answers 0 to a caller who authors nowhere even when the roles cannot read vacancies', async () => {
    await scenario(async (s) => {
      for (const who of ['teamLead', 'hr', 'headHr'] as const)
        expect(
          await countOwnDrafts(
            await s.as(roles()[who], { userId: randomUUID() }),
          ),
          who,
        ).toEqual({ count: 0 });
      expect(
        await problem(
          countOwnDrafts(await s.as(roles().finance, { userId: randomUUID() })),
        ),
      ).toMatchObject({ status: 404 });
      expect(
        await problem(countOwnDrafts(await s.as(roles().none))),
      ).toMatchObject({ status: 404 });
    });
  });

  describe('an author who lost the vacancy-creating role in the draft’s vertical [D98]', () => {
    const losses: [string, (r: ReturnType<typeof roles>) => Roles][] = [
      ['kept only the Team Lead role', (r) => r.teamLead],
      ['is now HR', (r) => r.hr],
      ['holds the role only in another vertical', (r) => r.recruiterOther],
    ];

    it.each(losses)(
      'who %s counts 0, and the draft counts again with the role',
      async (_label, pick) => {
        await scenario(async (s) => {
          await createVacancy(
            await s.as(roles().recruiter),
            draft('Втрата ролі'),
            key(),
          );
          const withRole = (await countOwnDrafts(await s.as(roles().recruiter)))
            .count;
          expect(withRole).toBe(1);
          expect(await countOwnDrafts(await s.as(pick(roles())))).toEqual({
            count: 0,
          });
          expect(
            (await countOwnDrafts(await s.as(roles().recruiter))).count,
          ).toBe(withRole);
        });
      },
    );

    it('counts only the verticals where the author still authors', async () => {
      await scenario(async (s) => {
        const both: Roles = [
          { role: 'RECRUITER', verticalId: world.verticals.v1 },
          { role: 'RECRUITER', verticalId: world.verticals.v2 },
        ];
        const ctx = await s.as(both);
        await createVacancy(ctx, draft('Перша'), key());
        await createVacancy(ctx, draft('Друга', world.verticals.v2), key());
        expect((await countOwnDrafts(ctx)).count).toBe(2);
        expect(
          (await countOwnDrafts(await s.as(roles().recruiter))).count,
        ).toBe(1);
      });
    });
  });
});
