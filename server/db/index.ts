import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { assertRuntimeDatabaseUrl } from '../../lib/env';
import * as schema from './schema';

export function createDatabase(databaseUrl = process.env.DATABASE_URL) {
  const client = postgres(assertRuntimeDatabaseUrl(databaseUrl), {
    prepare: false,
    max: 5,
    onnotice: () => undefined,
  });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}
