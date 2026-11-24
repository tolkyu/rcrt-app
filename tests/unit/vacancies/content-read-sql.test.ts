import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { describe, expect, it } from 'vitest';
import type { DbExecutor } from '@/server/db';
import { findVacancyContent } from '@/server/repositories/vacancy';

const ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

describe('findVacancyContent SQL [VAC-08, ADR-019]', () => {
  it('correlates assigned recruiters by fully qualified columns', async () => {
    const statements: string[] = [];
    const db = drizzle.mock({
      logger: { logQuery: (query) => statements.push(query) },
    }) as unknown as DbExecutor;
    // The mock driver has no connection: the statement is logged, then the call rejects.
    await expect(findVacancyContent(db, sql`true`, ID)).rejects.toBeDefined();
    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain(
      'where "app"."vacancy_recruiter"."vacancy_id" = "app"."vacancy"."id")',
    );
  });
});
