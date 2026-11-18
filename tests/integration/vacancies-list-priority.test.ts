import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CreateVacancyInput } from '../../lib/schemas/vacancy';
import { createVacancy, listVacancyPage } from '../../server/services/vacancy';
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
const publish = (title: string, priority: 'NORMAL' | 'URGENT') =>
  ({
    mode: 'PUBLISH',
    verticalId: world.verticals.v1,
    title,
    positionId: world.positions.p1,
    priority,
  }) as CreateVacancyInput;
const ids = (page: Awaited<ReturnType<typeof listVacancyPage>>) =>
  page.items.map((item) => item.id);
const cursorOf = (number: string) => String(BigInt(number.slice(2)));

describe('list filter «Терміновість» (priority) [VAC-04-4, VAC-08-2]', () => {
  it('lists only the chosen urgency, pages by cursor inside it and never widens the role scope', async () => {
    await scenario(async (s) => {
      const tag = `Терміновість ${randomUUID().slice(0, 8)}`;
      const author = await s.as(roles().head);
      const create = (suffix: string, priority: 'NORMAL' | 'URGENT') =>
        createVacancy(
          author,
          publish(`${tag} ${suffix}`, priority),
          randomUUID(),
        );
      const first = await create('1', 'URGENT');
      const plain = await create('2', 'NORMAL');
      const second = await create('3', 'URGENT');
      const third = await create('4', 'URGENT');

      const admin = await s.as(roles().admin, { userId: randomUUID() });
      const list = (filters: Parameters<typeof listVacancyPage>[1]) =>
        listVacancyPage(admin, { limit: 25, q: tag, ...filters });

      expect(ids(await list({ priority: 'URGENT' }))).toEqual([
        third.id,
        second.id,
        first.id,
      ]);
      expect(ids(await list({ priority: 'NORMAL' }))).toEqual([plain.id]);
      expect(ids(await list({}))).toEqual([
        third.id,
        second.id,
        plain.id,
        first.id,
      ]);
      expect(
        ids(
          await list({
            priority: 'URGENT',
            cursor: cursorOf(third.number),
            direction: 'older',
          }),
        ),
      ).toEqual([second.id, first.id]);
      expect(
        ids(
          await list({
            priority: 'URGENT',
            cursor: cursorOf(first.number),
            direction: 'newer',
          }),
        ),
      ).toEqual([third.id, second.id]);
      expect(
        await list({ priority: 'URGENT', status: 'FILLED' }),
      ).toMatchObject({ items: [] });

      for (const who of ['headOther', 'recruiterOther'] as const) {
        const outsider = await s.as(roles()[who], { userId: randomUUID() });
        expect(
          ids(
            await listVacancyPage(outsider, {
              limit: 25,
              q: tag,
              priority: 'URGENT',
            }),
          ),
          who,
        ).toEqual([]);
      }
    });
  });
});
