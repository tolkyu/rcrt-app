import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CreateVacancyInput } from '../../lib/schemas/vacancy';
import { cancelVacancyDraft } from '../../server/services/vacancy-draft';
import {
  countOwnDrafts,
  createVacancy,
  getVacancyDetail,
  listVacancyPage,
} from '../../server/services/vacancy';
import {
  createScenarioRunner,
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
const draft = (title: string) =>
  ({
    mode: 'DRAFT',
    verticalId: world.verticals.v1,
    title,
  }) as CreateVacancyInput;
const open = (title: string) =>
  ({
    mode: 'PUBLISH',
    verticalId: world.verticals.v1,
    positionId: world.positions.p1,
    title,
  }) as CreateVacancyInput;

/** D110: drafts live under the «Чернетки» chip only; «Усі» (no status filter) neither lists nor counts them. */
describe('the list without a status leaves the author’s own drafts out [D110, STORY-VAC-01-3]', () => {
  it.each([
    ['a Recruiter', 'recruiter'],
    ['a Head Recruiter', 'head'],
    ['an Admin', 'admin'],
  ] as const)(
    'a draft of %s is listed under status=DRAFT and nowhere else, yet its card still opens',
    async (_label, who) => {
      await scenario(async (s) => {
        const tag = `Усі без чернеток ${randomUUID().slice(0, 8)}`;
        const ctx = await s.as(roles()[who]);
        const published = await createVacancy(
          ctx,
          open(`${tag} відкрита`),
          randomUUID(),
        );
        const mine = await createVacancy(
          ctx,
          draft(`${tag} чернетка`),
          randomUUID(),
        );
        const cancelled = await createVacancy(
          ctx,
          draft(`${tag} скасована`),
          randomUUID(),
        );
        await cancelVacancyDraft(ctx, cancelled.id, { reason: 'Причина' });

        for (const filters of [
          { limit: 100 },
          { limit: 100, q: tag },
          { limit: 100, q: mine.number },
          { limit: 100, vertical: world.verticals.v1 },
        ] as const) {
          const listed = ids(await listVacancyPage(ctx, { ...filters }));
          expect(listed, JSON.stringify(filters)).not.toContain(mine.id);
          expect(listed, JSON.stringify(filters)).not.toContain(cancelled.id);
        }
        expect(ids(await listVacancyPage(ctx, { limit: 100, q: tag }))).toEqual(
          [published.id],
        );
        expect(
          ids(await listVacancyPage(ctx, { limit: 100, status: 'DRAFT' })),
        ).toContain(mine.id);
        expect(
          ids(await listVacancyPage(ctx, { limit: 100, status: 'CANCELLED' })),
        ).toContain(cancelled.id);
        expect((await getVacancyDetail(ctx, mine.id)).status).toBe('DRAFT');
        expect((await countOwnDrafts(ctx)).count).toBeGreaterThanOrEqual(1);
      });
    },
  );
});
