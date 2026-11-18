import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { richTextDocSchema } from '../../lib/schemas/rich-text';
import * as schema from '../../server/db/schema';
import { updateVacancyContent } from '../../server/services/vacancy-content';
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
const client = postgres(urls.runtime, { max: 1, prepare: false });
const scenario = createScenarioRunner(client);
let world: VacancyWorld;

beforeAll(async () => {
  world = await createVacancyWorld(admin);
});
afterAll(async () => {
  await world.cleanup();
  await Promise.all([admin.end(), client.end()]);
});

describe('independent mixed-role acceptance [ADR-018, VAC-08]', () => {
  it('aal1 retains assigned content rights while withheld Admin grants cannot widen scope', async () => {
    await scenario(async (s) => {
      const roles = rolesOf(world);
      const ctx = await s.as([...roles.admin, ...roles.recruiter], {
        aal: 'aal1',
        userId: world.users.recA,
      });
      const descriptionDoc = richTextDocSchema.parse({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Уточнений опис вакансії' }],
          },
        ],
      });
      const body = { expectedVersion: 1, descriptionDoc };
      expect(
        await updateVacancyContent(ctx, world.v.assignedOpen, body),
      ).toMatchObject({ version: 2, descriptionDoc });

      for (const { id, status, code } of [
        { id: world.v.unassignedOpen, status: 403, code: 'FORBIDDEN' },
        { id: world.v.otherAssigned, status: 404, code: 'NOT_FOUND' },
        { id: world.v.draft, status: 404, code: 'NOT_FOUND' },
      ]) {
        expect(await problem(updateVacancyContent(ctx, id, body))).toEqual({
          status,
          code,
        });
        const [row] = await s.tx
          .select({
            version: schema.vacancy.version,
            descriptionDoc: schema.vacancy.descriptionDoc,
          })
          .from(schema.vacancy)
          .where(eq(schema.vacancy.id, id));
        expect(row).toEqual({ version: 1, descriptionDoc: null });
        expect(
          await s.tx
            .select({ id: schema.entityEvent.id })
            .from(schema.entityEvent)
            .where(eq(schema.entityEvent.vacancyId, id)),
        ).toEqual([]);
        expect(
          await s.tx
            .select({ id: schema.auditLog.id })
            .from(schema.auditLog)
            .where(eq(schema.auditLog.entityId, id)),
        ).toEqual([]);
      }
    });
  });
});
