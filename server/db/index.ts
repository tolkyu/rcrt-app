import 'server-only';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { assertRuntimeDatabaseUrl } from '../../lib/env';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Repositories and writers accept either the pool or an open transaction. */
export type DbExecutor = Database | Transaction;

export function createDatabase(databaseUrl = process.env.DATABASE_URL) {
  const client = postgres(assertRuntimeDatabaseUrl(databaseUrl), {
    prepare: false,
    max: 5,
    onnotice: () => undefined,
  });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}

const globalForDb = globalThis as typeof globalThis & {
  __recruitingDb?: Database;
};

/** One pool per server instance; created on first use so build-time imports never connect. */
export function getDb(): Database {
  globalForDb.__recruitingDb ??= createDatabase().db;
  return globalForDb.__recruitingDb;
}
