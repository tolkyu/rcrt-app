import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  CreateVacancyInput,
  VacancyDetail,
} from '../../lib/schemas/vacancy';
import { listPositionCatalog } from '../../server/services/position';
import {
  createVacancy,
  getVacancyDetail,
  listVacancyPage,
} from '../../server/services/vacancy';
import {
  addUser,
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
const input = (mode: 'DRAFT' | 'PUBLISH', title: string) =>
  ({
    mode,
    verticalId: world.verticals.v1,
    title,
    ...(mode === 'PUBLISH' ? { positionId: world.positions.p1 } : {}),
  }) as CreateVacancyInput;

/** Everyone who is not the author, as the six reader types of the story plus the draft's own Team Lead and Head Recruiter of another vertical. */
const OTHERS: readonly Who[] = [
  'recruiter',
  'head',
  'admin',
  'teamLead',
  'hr',
  'headHr',
  'finance',
  'headOther',
  'recruiterOther',
  'none',
];

type Page = Awaited<ReturnType<typeof listVacancyPage>>;
const ids = (page: Page) => page.items.map((item) => item.id);

describe('A draft is visible to its author only [D92, D98, STORY-VAC-01-3 AC5, AC6]', () => {
  const authors: [string, Who][] = [
    ['a Recruiter', 'recruiter'],
    ['a Head Recruiter', 'head'],
    ['an Admin', 'admin'],
  ];

  describe.each(authors)('the draft of %s', (_label, author) => {
    it('is invisible to every other role through detail, list, filters, number and title search', async () => {
      await scenario(async (s) => {
        const tag = `Чернетка ${randomUUID().slice(0, 8)}`;
        const mine = await createVacancy(
          await s.as(roles()[author]),
          input('DRAFT', tag),
          key(),
        );
        const lead = await addUser(s.tx, {
          roles: [{ role: 'TEAM_LEAD', verticalId: world.verticals.v1 }],
        });
        const ledDraft = await createVacancy(
          await s.as(roles()[author === 'recruiter' ? 'head' : author]),
          {
            ...input('DRAFT', `${tag} з тімлідом`),
            ...(author === 'recruiter' ? {} : { teamLeadId: lead }),
          } as CreateVacancyInput,
          key(),
        );

        for (const other of OTHERS.filter((name) => name !== author)) {
          const ctx = await s.as(roles()[other], { userId: randomUUID() });
          const where = `${other} reading the draft of ${author}`;
          for (const draft of [mine, ledDraft].filter(
            (d) => author !== 'recruiter' || d === mine,
          )) {
            expect(
              await problem(getVacancyDetail(ctx, draft.id)),
              `${where}: detail`,
            ).toMatchObject({ status: 404, code: 'NOT_FOUND' });
            expect(
              await problem(getVacancyDetail(ctx, draft.id.toUpperCase())),
              `${where}: upper-case id`,
            ).toMatchObject({ status: 404 });
          }
          if (other === 'finance' || other === 'none') {
            expect(
              await problem(listVacancyPage(ctx, { limit: 100 })),
              `${where}: list`,
            ).toMatchObject({ status: 404 });
            continue;
          }
          for (const filters of [
            { limit: 100 },
            { limit: 100, status: 'DRAFT' },
            { limit: 100, vertical: world.verticals.v1 },
            { limit: 100, q: tag },
            { limit: 100, q: mine.number },
            { limit: 100, q: mine.number.toLowerCase() },
            { limit: 100, priority: 'NORMAL' },
            { limit: 25, cursor: String(BigInt(mine.number.slice(2)) + 1n) },
            {
              limit: 25,
              cursor: String(BigInt(mine.number.slice(2)) - 1n),
              direction: 'newer',
            },
          ] as const) {
            const page = await listVacancyPage(ctx, { ...filters });
            expect(
              ids(page),
              `${where}: list ${JSON.stringify(filters)}`,
            ).not.toContain(mine.id);
            expect(ids(page)).not.toContain(ledDraft.id);
          }
        }
      });
    });

    it('is visible to its author in detail, in the list, by status, by number and by title', async () => {
      await scenario(async (s) => {
        const tag = `Моя чернетка ${randomUUID().slice(0, 8)}`;
        const ctx = await s.as(roles()[author]);
        const mine = await createVacancy(ctx, input('DRAFT', tag), key());
        expect((await getVacancyDetail(ctx, mine.id)).status).toBe('DRAFT');
        for (const filters of [
          { limit: 100 },
          { limit: 100, status: 'DRAFT' },
          { limit: 100, q: tag },
          { limit: 100, q: mine.number },
        ] as const)
          expect(
            ids(await listVacancyPage(ctx, { ...filters })),
            JSON.stringify(filters),
          ).toContain(mine.id);
        expect(
          ids(await listVacancyPage(ctx, { limit: 100, status: 'OPEN' })),
        ).not.toContain(mine.id);
      });
    });
  });

  it('shows the published siblings of a draft to everyone in scope while the draft stays hidden', async () => {
    await scenario(async (s) => {
      const tag = `Пара ${randomUUID().slice(0, 8)}`;
      const author = await s.as(roles().recruiter);
      const open = await createVacancy(author, input('PUBLISH', tag), key());
      const hidden = await createVacancy(
        author,
        input('DRAFT', `${tag} чернетка`),
        key(),
      );
      for (const other of ['head', 'admin', 'hr', 'headHr'] as const) {
        const page = await listVacancyPage(
          await s.as(roles()[other], { userId: randomUUID() }),
          { limit: 100, q: tag },
        );
        expect(ids(page), other).toEqual([open.id]);
      }
      expect(
        await problem(
          getVacancyDetail(
            await s.as(roles().head, { userId: randomUUID() }),
            hidden.id,
          ),
        ),
      ).toMatchObject({ status: 404 });
      const recruiterB = await listVacancyPage(
        await s.as(roles().recruiter, { userId: randomUUID() }),
        { limit: 100, q: tag },
      );
      // The creator is auto-assigned, so the vacancy is not «unassigned open» for another recruiter (STORY-VAC-01-1 AC8).
      expect(ids(recruiterB)).toEqual([]);
    });
  });

  it('does not let the draft’s Team Lead, assigned recruiter or creator-by-assignment reach it through their own scope', async () => {
    await scenario(async (s) => {
      const lead = await addUser(s.tx, {
        roles: [{ role: 'TEAM_LEAD', verticalId: world.verticals.v1 }],
      });
      const created = await createVacancy(
        await s.as(roles().head),
        {
          ...input('DRAFT', `Тімлід ${randomUUID().slice(0, 8)}`),
          teamLeadId: lead,
        } as CreateVacancyInput,
        key(),
      );
      const asLead = await s.as(roles().teamLead, { userId: lead });
      expect(await problem(getVacancyDetail(asLead, created.id))).toMatchObject(
        { status: 404 },
      );
      expect(ids(await listVacancyPage(asLead, { limit: 100 }))).not.toContain(
        created.id,
      );
    });
  });

  describe('the author must still hold a vacancy-creating role in the draft’s vertical [D98]', () => {
    const losses: [string, (r: ReturnType<typeof roles>) => Roles][] = [
      ['lost every role', () => []],
      ['holds the role only in another vertical', (r) => r.recruiterOther],
      ['kept only the Team Lead role', (r) => r.teamLead],
      ['is now HR', (r) => r.hr],
    ];

    it.each(losses)(
      'an author who %s gets 404 and sees it nowhere, and it returns with the role',
      async (_label, pick) => {
        await scenario(async (s) => {
          const tag = `Втрата ролі ${randomUUID().slice(0, 8)}`;
          const mine = await createVacancy(
            await s.as(roles().recruiter),
            input('DRAFT', tag),
            key(),
          );
          const without = pick(roles());
          const ctxLost = await s.as(without);
          if (without.length > 0) {
            expect(
              await problem(getVacancyDetail(ctxLost, mine.id)),
            ).toMatchObject({ status: 404 });
            expect(
              ids(await listVacancyPage(ctxLost, { limit: 100, q: tag })),
            ).toEqual([]);
          } else {
            expect(
              await problem(listVacancyPage(ctxLost, { limit: 100 })),
            ).toMatchObject({ status: 404 });
          }
          expect(
            ids(
              await listVacancyPage(await s.as(roles().recruiter), {
                limit: 100,
                q: tag,
              }),
            ),
          ).toEqual([mine.id]);
        });
      },
    );
  });

  it('is excluded from the position’s open-vacancy count until it is OPEN', async () => {
    await scenario(async (s) => {
      const count = async () =>
        (
          await listPositionCatalog(await s.as(roles().admin), {
            status: 'all',
          })
        ).items.find((item) => item.id === world.positions.p1)!
          .openVacanciesCount;
      const before = await count();
      await createVacancy(
        await s.as(roles().head),
        {
          ...input('DRAFT', 'Лічильник'),
          positionId: world.positions.p1,
        } as CreateVacancyInput,
        key(),
      );
      expect(await count()).toBe(before);
      await createVacancy(
        await s.as(roles().head),
        input('PUBLISH', 'Лічильник'),
        key(),
      );
      expect(await count()).toBe(before! + 1);
    });
  });

  it('never lets a draft decide the next-page cursor of another reader', async () => {
    await scenario(async (s) => {
      const author = await s.as(roles().head);
      const published: VacancyDetail[] = [];
      for (let n = 0; n < 3; n += 1) {
        published.push(
          await createVacancy(author, input('PUBLISH', `Курсор ${n}`), key()),
        );
        await createVacancy(
          author,
          input('DRAFT', `Курсор чернетка ${n}`),
          key(),
        );
      }
      const page = await listVacancyPage(
        await s.as(roles().admin, { userId: randomUUID() }),
        { limit: 25, q: 'Курсор' },
      );
      expect(ids(page).sort()).toEqual(published.map((p) => p.id).sort());
      expect(page.nextCursor).toBeNull();
    });
  });
});
