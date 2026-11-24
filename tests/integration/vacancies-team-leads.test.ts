import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { assignableTeamLeadsSchema } from '../../lib/schemas/team-lead-priority';
import type { DbExecutor } from '../../server/db';
import * as schema from '../../server/db/schema';
import { listAssignableTeamLeads } from '../../server/services/vacancy-team-lead';
import {
  createScenarioRunner,
  NOW,
  problem,
  type Roles,
} from '../support/vacancy-write-harness';
import { testDatabaseUrls } from './database';

const client = postgres(testDatabaseUrls().runtime, {
  max: 2,
  prepare: false,
});
const scenario = createScenarioRunner(client);
afterAll(() => client.end());

const tag = randomUUID().slice(0, 8);

async function addVertical(tx: DbExecutor, name: string) {
  const [row] = await tx
    .insert(schema.vertical)
    .values({ name: `${name} ${tag}` })
    .returning({ id: schema.vertical.id });
  return row!.id;
}

async function addLead(
  tx: DbExecutor,
  verticalId: string,
  name: string,
  options: {
    priority?: number;
    active?: boolean;
    accepted?: boolean;
    role?: string;
  } = {},
) {
  const id = randomUUID();
  const active = options.active ?? true;
  await tx.insert(schema.appUser).values({
    id,
    email: `${id}@fixture.test`,
    fullName: name,
    isActive: active,
    activatedAt: options.accepted === false ? null : NOW,
    deactivatedAt: active ? null : NOW,
  });
  await tx
    .insert(schema.userRole)
    .values({ userId: id, role: options.role ?? 'TEAM_LEAD', verticalId });
  if (options.priority !== undefined)
    await tx.insert(schema.teamLeadPriority).values({
      userId: id,
      verticalId,
      priority: options.priority,
    });
  return id;
}

describe('assignable Team Leads of a vertical [STORY-VAC-01-1, vacancy.team_lead.set]', () => {
  it('lists active accepted Team Leads by priority (unset last, then name), with nothing but id, name and priority', async () => {
    await scenario(async ({ tx, asNew }) => {
      const v1 = await addVertical(tx, 'Світ А');
      const second = await addLead(tx, v1, 'Борис', { priority: 1 });
      const first = await addLead(tx, v1, 'Яків', { priority: 0 });
      const tieB = await addLead(tx, v1, 'Олег', { priority: 1 });
      const unsetB = await addLead(tx, v1, 'Юрій');
      const unsetA = await addLead(tx, v1, 'Андрій');

      const result = await listAssignableTeamLeads(
        asNew([{ role: 'ADMIN', verticalId: null }]),
        v1,
      );
      expect(result.items.map((item) => item.id)).toEqual([
        first,
        second,
        tieB,
        unsetA,
        unsetB,
      ]);
      expect(result.items.map((item) => item.priority)).toEqual([
        0,
        1,
        1,
        null,
        null,
      ]);
      expect(Object.keys(result.items[0]!).sort()).toEqual([
        'fullName',
        'id',
        'priority',
      ]);
      expect(assignableTeamLeadsSchema.safeParse(result).success).toBe(true);
    });
  });

  it('leaves out deactivated users, invitees, other roles and the Team Leads of another vertical', async () => {
    await scenario(async ({ tx, asNew }) => {
      const v1 = await addVertical(tx, 'Світ А');
      const v2 = await addVertical(tx, 'Світ Б');
      const live = await addLead(tx, v1, 'Діючий', { priority: 0 });
      await addLead(tx, v1, 'Звільнений', { priority: 0, active: false });
      await addLead(tx, v1, 'Запрошений', { accepted: false });
      await addLead(tx, v1, 'Рекрутер', { role: 'RECRUITER' });
      await addLead(tx, v2, 'Чужий', { priority: 0 });
      const both = await addLead(tx, v2, 'У двох', { priority: 3 });
      await tx
        .insert(schema.userRole)
        .values({ userId: both, role: 'TEAM_LEAD', verticalId: v1 });

      const result = await listAssignableTeamLeads(
        asNew([{ role: 'ADMIN', verticalId: null }]),
        v1,
      );
      expect(result.items.map((item) => item.id)).toEqual([live, both]);
      // The priority is the one of the asked vertical, not of the Team Lead's other vertical.
      expect(result.items.map((item) => item.priority)).toEqual([0, null]);
    });
  });

  it('an empty vertical is an empty list, an unknown or malformed one is 404', async () => {
    await scenario(async ({ tx, asNew }) => {
      const v1 = await addVertical(tx, 'Порожній');
      const admin = asNew([{ role: 'ADMIN', verticalId: null }]);
      expect(await listAssignableTeamLeads(admin, v1)).toEqual({ items: [] });
      for (const id of [randomUUID(), 'not-a-uuid', ''])
        expect(await problem(listAssignableTeamLeads(admin, id))).toMatchObject(
          { status: 404 },
        );
    });
  });

  it('Admin and the Head Recruiter of the vertical may ask; Head Recruiter of another vertical gets 404', async () => {
    await scenario(async ({ tx, asNew }) => {
      const v1 = await addVertical(tx, 'Світ А');
      const v2 = await addVertical(tx, 'Світ Б');
      const lead = await addLead(tx, v1, 'Тімлід', { priority: 0 });
      const ids = async (roles: Roles, verticalId: string) =>
        (await listAssignableTeamLeads(asNew(roles), verticalId)).items.map(
          (item) => item.id,
        );
      expect(await ids([{ role: 'ADMIN', verticalId: null }], v1)).toEqual([
        lead,
      ]);
      expect(
        await ids([{ role: 'HEAD_RECRUITER', verticalId: v1 }], v1),
      ).toEqual([lead]);
      expect(
        await problem(
          listAssignableTeamLeads(
            asNew([{ role: 'HEAD_RECRUITER', verticalId: v2 }]),
            v1,
          ),
        ),
      ).toMatchObject({ status: 404 });
    });
  });

  it('roles without vacancy.team_lead.set are refused: 403 where the vertical is theirs, 404 without any vertical access', async () => {
    await scenario(async ({ tx, asNew }) => {
      const v1 = await addVertical(tx, 'Світ А');
      await addLead(tx, v1, 'Тімлід', { priority: 0 });
      const refused = (roles: Roles) =>
        problem(listAssignableTeamLeads(asNew(roles), v1));
      for (const role of ['RECRUITER', 'TEAM_LEAD', 'HR', 'HEAD_HR'])
        expect(await refused([{ role, verticalId: v1 }]), role).toMatchObject({
          status: 403,
        });
      expect(
        await refused([{ role: 'FINANCE', verticalId: null }]),
      ).toMatchObject({ status: 404 });
      expect(await refused([])).toMatchObject({ status: 404 });
    });
  });

  it('a refusal never tells an existing vertical from an unknown one: grantless roles get 403 for both, scoped Head Recruiters 404 for both', async () => {
    await scenario(async ({ tx, asNew }) => {
      const v1 = await addVertical(tx, 'Світ А');
      const v2 = await addVertical(tx, 'Світ Б');
      const answers = (roles: Roles, ids: readonly string[]) =>
        Promise.all(
          ids.map(
            async (id) =>
              (await problem(listAssignableTeamLeads(asNew(roles), id))).status,
          ),
        );
      const ids = [v1, v2, randomUUID(), 'not-a-uuid'];
      expect(
        await answers([{ role: 'RECRUITER', verticalId: v1 }], ids),
      ).toEqual([403, 403, 403, 403]);
      expect(
        await answers(
          [{ role: 'HEAD_RECRUITER', verticalId: v1 }],
          ids.slice(1),
        ),
      ).toEqual([404, 404, 404]);
    });
  });

  it('a Head Recruiter of one vertical who only recruits in another may not read the second: 403 there, 404 for a third', async () => {
    await scenario(async ({ tx, asNew }) => {
      const v1 = await addVertical(tx, 'Світ А');
      const v2 = await addVertical(tx, 'Світ Б');
      const v3 = await addVertical(tx, 'Світ В');
      const mixed = [
        { role: 'HEAD_RECRUITER', verticalId: v1 },
        { role: 'RECRUITER', verticalId: v2 },
      ];
      expect((await listAssignableTeamLeads(asNew(mixed), v1)).items).toEqual(
        [],
      );
      expect(
        await problem(listAssignableTeamLeads(asNew(mixed), v2)),
      ).toMatchObject({ status: 403 });
      expect(
        await problem(listAssignableTeamLeads(asNew(mixed), v3)),
      ).toMatchObject({ status: 404 });
    });
  });

  it('an Admin session without TOTP (aal1) is refused with MFA_REQUIRED, not served', async () => {
    await scenario(async ({ tx, asNew }) => {
      const v1 = await addVertical(tx, 'Світ А');
      await addLead(tx, v1, 'Тімлід', { priority: 0 });
      expect(
        await problem(
          listAssignableTeamLeads(
            asNew([{ role: 'ADMIN', verticalId: null }], { aal: 'aal1' }),
            v1,
          ),
        ),
      ).toMatchObject({ status: 401, code: 'MFA_REQUIRED' });
    });
  });

  it('a Recruiter who is also the Head Recruiter of the vertical may ask (the Head Recruiter grant is enough)', async () => {
    await scenario(async ({ tx, asNew }) => {
      const v1 = await addVertical(tx, 'Світ А');
      await addLead(tx, v1, 'Тімлід');
      const both = asNew([
        { role: 'RECRUITER', verticalId: v1 },
        { role: 'HEAD_RECRUITER', verticalId: v1 },
      ]);
      expect((await listAssignableTeamLeads(both, v1)).items).toHaveLength(1);
    });
  });
});
