import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  CreateVacancyInput,
  PatchVacancyInput,
} from '../../lib/schemas/vacancy';
import * as schema from '../../server/db/schema';
import { updateTeamLeadPriorities } from '../../server/services/team-lead-priority';
import { createVacancy } from '../../server/services/vacancy';
import {
  patchVacancyDraft,
  publishVacancyDraft,
} from '../../server/services/vacancy-draft';
import { listAssignableTeamLeads } from '../../server/services/vacancy-team-lead';
import {
  addUser,
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

const roles = () => rolesOf(world);
const key = () => randomUUID();
const input = (
  mode: 'DRAFT' | 'PUBLISH',
  overrides: Record<string, unknown> = {},
): CreateVacancyInput =>
  ({
    mode,
    verticalId: world.verticals.v1,
    positionId: world.positions.p1,
    title: 'Медіабаєр — Facebook',
    ...overrides,
  }) as CreateVacancyInput;
const edit = (version: number, rest: Record<string, unknown>) =>
  ({ expectedVersion: version, ...rest }) as PatchVacancyInput;
const INVALID = {
  status: 400,
  code: 'VALIDATION_FAILED',
  errors: [{ path: 'body.teamLeadId', code: 'invalid_team_lead' }],
};
describe('One Team Lead eligibility rule on every write [D122, S1]', () => {
  const teamLead = (
    tx: Parameters<typeof addUser>[0],
    options: { invited?: boolean; active?: boolean } = {},
  ) =>
    addUser(tx, {
      roles: [{ role: 'TEAM_LEAD', verticalId: world.verticals.v1 }],
      ...options,
    });

  it('create accepts an active Team Lead who accepted the invite, as OPEN and as DRAFT', async () => {
    await scenario(async (s) => {
      const lead = await teamLead(s.tx);
      const ctx = await s.as(roles().head);
      for (const mode of ['PUBLISH', 'DRAFT'] as const)
        expect(
          await createVacancy(ctx, input(mode, { teamLeadId: lead }), key()),
        ).toMatchObject({ teamLead: { id: lead }, recruiterInitiated: false });
    });
  });

  it('create refuses an invitee Team Lead as OPEN and as DRAFT and writes nothing', async () => {
    await scenario(async (s) => {
      const invitee = await teamLead(s.tx, { invited: true });
      const ctx = await s.as(roles().head);
      for (const mode of ['PUBLISH', 'DRAFT'] as const)
        expect(
          await problem(
            createVacancy(ctx, input(mode, { teamLeadId: invitee }), key()),
          ),
          mode,
        ).toEqual(INVALID);
      const written = await s.tx
        .select({ id: schema.vacancy.id })
        .from(schema.vacancy)
        .where(eq(schema.vacancy.teamLeadId, invitee));
      expect(written).toEqual([]);
    });
  });

  it('PATCH of a draft accepts an accepted Team Lead and refuses an invitee, leaving the draft unchanged', async () => {
    await scenario(async (s) => {
      const accepted = await teamLead(s.tx);
      const invitee = await teamLead(s.tx, { invited: true });
      const ctx = await s.as(roles().head);
      const created = await createVacancy(ctx, input('DRAFT'), key());
      expect(
        await problem(
          patchVacancyDraft(
            ctx,
            created.id,
            edit(created.version, { teamLeadId: invitee }),
          ),
        ),
      ).toEqual(INVALID);
      const saved = await patchVacancyDraft(
        ctx,
        created.id,
        edit(created.version, { teamLeadId: accepted }),
      );
      expect(saved.teamLead).toMatchObject({ id: accepted });
      expect(saved.version).toBe(created.version + 1);
    });
  });

  it('publish accepts a draft whose Team Lead accepted the invite and refuses one whose Team Lead is an invitee, keeping the draft', async () => {
    await scenario(async (s) => {
      const lead = await teamLead(s.tx);
      const ctx = await s.as(roles().head);
      const created = await createVacancy(
        ctx,
        input('DRAFT', { teamLeadId: lead }),
        key(),
      );
      await s.tx
        .update(schema.appUser)
        .set({ activatedAt: null })
        .where(eq(schema.appUser.id, lead));
      expect(
        await problem(
          publishVacancyDraft(ctx, created.id, key(), {
            expectedVersion: created.version,
          }),
        ),
      ).toEqual(INVALID);
      const [stored] = await s.tx
        .select({ status: schema.vacancy.status })
        .from(schema.vacancy)
        .where(eq(schema.vacancy.id, created.id));
      expect(stored!.status).toBe('DRAFT');

      await s.tx
        .update(schema.appUser)
        .set({ activatedAt: new Date() })
        .where(eq(schema.appUser.id, lead));
      expect(
        (
          await publishVacancyDraft(ctx, created.id, key(), {
            expectedVersion: created.version,
          })
        ).status,
      ).toBe('OPEN');
    });
  });

  it('the picker, create and the priority save accept exactly the same Team Leads', async () => {
    await scenario(async (s) => {
      const { v1, v2 } = world.verticals;
      const candidates = {
        eligible: await teamLead(s.tx),
        invitee: await teamLead(s.tx, { invited: true }),
        deactivated: await teamLead(s.tx, { active: false }),
        otherVertical: await addUser(s.tx, {
          roles: [{ role: 'TEAM_LEAD', verticalId: v2 }],
        }),
        recruiterOnly: await addUser(s.tx, {
          roles: [{ role: 'RECRUITER', verticalId: v1 }],
        }),
      };
      const head = await s.as(roles().head);
      const known = new Set<string>(Object.values(candidates));
      const offered = (await listAssignableTeamLeads(head, v1)).items
        .map((item) => item.id)
        .filter((id) => known.has(id));
      expect(offered).toEqual([candidates.eligible]);

      const admin = await s.as(roles().admin);
      for (const [name, teamLeadId] of Object.entries(candidates)) {
        const isEligible = teamLeadId === candidates.eligible;
        const created = createVacancy(
          head,
          input('PUBLISH', { teamLeadId, title: `Вакансія ${name}` }),
          key(),
        );
        if (isEligible) {
          expect(await created, name).toMatchObject({
            teamLead: { id: teamLeadId },
          });
        } else expect(await problem(created), name).toEqual(INVALID);
        // Awaited one after the other: a refused call rolls back to its own savepoint, so they must not overlap.
        const saved = updateTeamLeadPriorities(admin, v1, {
          changes: [{ userId: teamLeadId, priority: 0, version: null }],
        });
        if (isEligible) expect(await saved, name).toBeDefined();
        else
          expect(await problem(saved), name).toMatchObject({
            status: 409,
            code: 'STALE_STATE',
          });
      }
    });
  });
});
