import { existsSync } from 'node:fs';
import { parseLocalDatabaseTargets } from '../lib/env';

parseLocalDatabaseTargets(process.env);
const required = ['drizzle.config.ts', 'server/db/seed/index.ts'];
const missing = required.filter((path) => !existsSync(path));
if (missing.length) {
  console.error(
    `Setup is not ready: Phase 1 T2 must provide ${missing.join(', ')}. See docs/PROGRESS.md.`,
  );
  process.exitCode = 1;
}
