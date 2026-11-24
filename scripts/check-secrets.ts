import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
if (
  tracked.some(
    (path) =>
      /(^|\/)\.env(?:$|\.)/.test(path) &&
      !path.endsWith('/.env.example') &&
      path !== '.env.example',
  )
)
  throw new Error('Environment files must not be tracked');
for (const path of tracked.filter(
  (path) =>
    /^(app|components|lib|server)\/.*\.[cm]?[jt]sx?$/.test(path) ||
    path === 'next.config.ts',
)) {
  if (!existsSync(path)) continue;
  if (/NEXT_PUBLIC_[A-Z0-9_]+/.test(readFileSync(path, 'utf8')))
    throw new Error(`Public environment export needs security review: ${path}`);
}
if (!existsSync('.next/static'))
  throw new Error('Run the production build before scanning client assets');
const manifest: unknown = JSON.parse(
  readFileSync('.next/server/app-paths-manifest.json', 'utf8'),
);
if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest))
  throw new Error('Invalid production route manifest');
if (
  Object.keys(manifest).some((path) =>
    /(?:^|\/)(?:dev-login|api\/dev\/login)(?:\/|$)/.test(path),
  )
)
  throw new Error(
    'Development login route appeared in the production manifest',
  );
const environment = {
  ...(existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {}),
  ...process.env,
};
const privateValues = Object.entries(environment).filter(
  ([name, value]) =>
    /SECRET|PASSWORD|DATABASE_URL|DATABASE_MIGRATION_URL|RESEND_API_KEY|CRON_SECRET/.test(
      name,
    ) &&
    value &&
    value.length >= 16,
);
for (const path of files('.next/static')) {
  const contents = readFileSync(path, 'utf8');
  for (const [name, value] of privateValues) {
    if (value && contents.includes(value))
      throw new Error(`Private ${name} appeared in client asset ${path}`);
  }
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(contents))
    throw new Error(`Private key appeared in client asset ${path}`);
}
console.info(
  'Tracked environment, production dev-route and client-secret checks passed.',
);
