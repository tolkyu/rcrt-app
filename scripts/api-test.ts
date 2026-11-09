import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import newman, { type NewmanRunSummary } from 'newman';
import { requireLoopbackUrl } from '../tests/support/loopback';
import { removeThrowawayPositions } from '../tests/postman/cleanup';
import { signInForApi, type ApiSession } from '../tests/postman/sessions';
import { API_USERS } from '../tests/postman/users';
import { testedFolders, type PmCollection } from './postman-cases';

const root = resolve(import.meta.dirname, '..');
const PORT = 3100;
const ORIGIN = `http://localhost:${PORT}`;
const COLLECTION = resolve(root, 'tests/postman/collection.json');
const JUNIT = resolve(root, 'test-results/newman/junit.xml');

type LoadEnvConfig = (
  dir: string,
  dev: boolean,
  log: { info: () => void; error: (...args: unknown[]) => void },
) => unknown;

/** Same files and precedence as `next start` (@next/env ships with next; resolved through it, no extra dependency). */
function loadLocalEnv() {
  const fromNext = createRequire(
    createRequire(import.meta.url).resolve('next/package.json'),
  );
  const { loadEnvConfig } = fromNext('@next/env') as {
    loadEnvConfig: LoadEnvConfig;
  };
  loadEnvConfig(root, false, { info: () => {}, error: console.error });
  if (process.env.VERCEL_ENV)
    throw new Error('test:api runs only outside Vercel (VERCEL_ENV is set)');
  return {
    SUPABASE_URL: requireLoopbackUrl('SUPABASE_URL', process.env.SUPABASE_URL),
    DATABASE_URL: requireLoopbackUrl('DATABASE_URL', process.env.DATABASE_URL),
  };
}

function newestMtime(dir: string): number {
  return readdirSync(dir, { withFileTypes: true }).reduce((newest, entry) => {
    const path = join(dir, entry.name);
    const mtime = entry.isDirectory()
      ? newestMtime(path)
      : statSync(path).mtimeMs;
    return Math.max(newest, mtime);
  }, 0);
}

function warnIfStaleBuild() {
  const built = statSync(resolve(root, '.next/BUILD_ID'), {
    throwIfNoEntry: false,
  });
  if (!built) throw new Error('No production build; run `pnpm build` first');
  const source = Math.max(
    ...['app', 'server', 'lib'].map((d) => newestMtime(resolve(root, d))),
  );
  if (source > built.mtimeMs)
    console.warn('Warning: sources are newer than .next; run `pnpm build`.');
}

function assertPortFree() {
  return new Promise<void>((done, fail) => {
    const probe = createServer();
    probe.once('error', () => fail(new Error(`Port ${PORT} busy`)));
    probe.listen(PORT, '127.0.0.1', () => probe.close(() => done()));
  });
}

async function healthy() {
  try {
    const response = await fetch(`${ORIGIN}/api/health`, {
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function startServer(env: Record<string, string>) {
  return spawn(
    process.execPath,
    [
      resolve(root, 'node_modules/next/dist/bin/next'),
      'start',
      '--port',
      String(PORT),
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        ...env,
        APP_ENV: 'test',
        APP_URL: ORIGIN,
        // The Auth folder asserts the «Google not configured» refusals; never call out to Google.
        AUTH_GOOGLE_ENABLED: 'false',
        NEXT_TELEMETRY_DISABLED: '1',
      },
      stdio: ['ignore', 'ignore', 'inherit'],
      detached: process.platform !== 'win32',
    },
  );
}
type Server = ReturnType<typeof startServer>;

function stopServer(server: Server) {
  if (server.exitCode !== null || server.pid === undefined) return;
  if (process.platform === 'win32') server.kill();
  else process.kill(-server.pid, 'SIGTERM');
}

async function waitForServer(server: Server) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error(`next start exited with code ${server.exitCode}`);
    if (await healthy()) return;
    await delay(250);
  }
  throw new Error(`${ORIGIN}/api/health did not answer within 60 s`);
}

/**
 * Tokens stay in memory: Newman receives them as environment values, never through a file. Different
 * users sign in in parallel; sessions of the same email in sequence, as a new link replaces the previous one.
 */
async function signInAll(sessions: Map<string, ApiSession>) {
  const byEmail = new Map<string, [string, (typeof API_USERS)[string]][]>();
  for (const entry of Object.entries(API_USERS))
    byEmail.set(entry[1].email, [
      ...(byEmail.get(entry[1].email) ?? []),
      entry,
    ]);
  const results = await Promise.allSettled(
    [...byEmail.values()].map(async (group) => {
      for (const [key, user] of group)
        sessions.set(key, await signInForApi(ORIGIN, user.email, user.totp));
    }),
  );
  const failed = results.find((r) => r.status === 'rejected');
  if (failed) throw failed.reason;
}

function environment(sessions: Map<string, ApiSession>) {
  return [
    { key: 'origin', value: ORIGIN },
    ...[...sessions].flatMap(([key, session]) => [
      { key: `token_${key}`, value: session.token },
      ...(API_USERS[key]?.totp
        ? [{ key: `token_${key}_aal1`, value: session.aal1Token }]
        : []),
      ...(API_USERS[key]?.cookie
        ? [{ key: `cookie_${key}`, value: session.cookie }]
        : []),
    ]),
  ];
}

function testedItems() {
  const collection = JSON.parse(
    readFileSync(COLLECTION, 'utf8'),
  ) as PmCollection;
  const folders = testedFolders(collection);
  if (!folders.length) throw new Error('The collection has no tested folders');
  const items = collection.item
    .filter((folder) => folders.includes(folder.name))
    .flatMap((folder) => (folder.item ?? []).map((item) => item.name));
  return { folders, items };
}

function runNewman(
  folders: string[],
  envVar: { key: string; value: string }[],
) {
  return new Promise<NewmanRunSummary>((done, fail) => {
    // Never enable the cli `verbose` option or htmlextra: both record request headers (Authorization).
    newman.run(
      {
        collection: COLLECTION,
        envVar,
        folder: folders,
        reporters: ['cli', 'junit'],
        reporter: { junit: { export: JUNIT } },
        timeoutRequest: 30_000,
        ignoreRedirects: true,
      },
      (error, summary) => (error ? fail(error) : done(summary)),
    );
  });
}

/** A skipped request (missing chained value) or one without a response must fail the run, not pass silently. */
function verdict(summary: NewmanRunSummary, items: string[]): boolean {
  const answered = new Set(
    summary.run.executions.filter((e) => e.response).map((e) => e.item.name),
  );
  const missing = items.filter((name) => !answered.has(name));
  if (missing.length) {
    console.error(`${missing.length} request(s) not executed:`);
    for (const name of missing) console.error(`  - ${name}`);
  }
  return summary.run.failures.length === 0 && !summary.error && !missing.length;
}

async function main() {
  const env = loadLocalEnv();
  warnIfStaleBuild();
  if (await healthy()) throw new Error(`Port ${PORT} busy`);
  await assertPortFree();
  const server = startServer(env);
  const sessions = new Map<string, ApiSession>();
  let cleaned: Promise<boolean> | undefined;
  /** Logs every session out (and checks its tokens are dead), stops the server, then removes the run's throwaway positions; runs once, also on SIGINT/SIGTERM. */
  const cleanup = () =>
    (cleaned ??= (async () => {
      const closed = await Promise.allSettled(
        [...sessions.values()].map((s) => s.close()),
      );
      stopServer(server);
      const revoked = closed.every((r) => r.status === 'fulfilled' && r.value);
      if (!revoked)
        console.error('Warning: a test session was not revoked after logout.');
      const removed = await removeThrowawayPositions(process.env).then(
        (count) => {
          console.info(`Removed ${count} throwaway positions.`);
          return true;
        },
        (error: unknown) => {
          console.error(
            `Throwaway positions were not removed: ${error instanceof Error ? error.message : String(error)}`,
          );
          return false;
        },
      );
      return revoked && removed;
    })());
  const interrupt = () => void cleanup().finally(() => process.exit(130));
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    await waitForServer(server);
    await signInAll(sessions);
    const { folders, items } = testedItems();
    return verdict(await runNewman(folders, environment(sessions)), items);
  } finally {
    if (!(await cleanup())) process.exitCode = 1;
  }
}

const passed = await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  return false;
});
process.exit(passed && process.exitCode !== 1 ? 0 : 1);
