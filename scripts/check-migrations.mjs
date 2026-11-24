import { spawnSync } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { relative, resolve } from 'node:path';

const root = process.cwd();
mkdirSync('.cache', { recursive: true });
const temporary = mkdtempSync(resolve('.cache/migration-check-'));
const out = relative(root, `${temporary}/migrations`).replaceAll('\\', '/');
cpSync('server/db/migrations', out, { recursive: true });
const config = `${temporary}/drizzle.config.json`;
writeFileSync(
  config,
  JSON.stringify({
    dialect: 'postgresql',
    schema: './server/db/schema.ts',
    out,
    schemaFilter: ['app'],
    strict: true,
  }),
);
for (const command of ['check', 'generate']) {
  const result = spawnSync(
    process.execPath,
    [
      resolve('node_modules/drizzle-kit/bin.cjs'),
      command,
      `--config=${config}`,
    ],
    { cwd: root, stdio: 'inherit', timeout: 60_000 },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const expected = readdirSync('server/db/migrations')
  .filter((name) => name.endsWith('.sql'))
  .sort();
const actual = readdirSync(out)
  .filter((name) => name.endsWith('.sql'))
  .sort();
if (
  JSON.stringify(expected) !== JSON.stringify(actual) ||
  expected.some(
    (name) =>
      readFileSync(`server/db/migrations/${name}`, 'utf8') !==
      readFileSync(`${out}/${name}`, 'utf8'),
  )
)
  throw new Error(
    'Drizzle schema differs from committed migrations; generate and review a migration',
  );
console.info('Migration metadata and schema snapshot are consistent.');
