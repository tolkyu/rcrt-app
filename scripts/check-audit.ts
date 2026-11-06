import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const advisorySchema = z.object({
  module_name: z.string(),
  severity: z.enum(['info', 'low', 'moderate', 'high', 'critical']),
  url: z.string(),
  findings: z.array(z.object({ paths: z.array(z.string()) })),
});
const reportSchema = z.object({
  advisories: z.record(z.string(), advisorySchema),
  metadata: z.object({ vulnerabilities: z.record(z.string(), z.number()) }),
});
const policySchema = z.array(
  z.object({
    ghsa: z.string(),
    module: z.string(),
    severity: z.enum(['high', 'critical']),
    pathPrefixes: z.array(z.string()).min(1),
  }),
);
type Report = z.infer<typeof reportSchema>;

export function assessAudit(
  production: unknown,
  tooling: unknown,
  accepted: unknown,
) {
  const prod = reportSchema.parse(production);
  const dev = reportSchema.parse(tooling);
  const policy = policySchema.parse(accepted);
  if (Object.keys(prod.advisories).length)
    throw new Error('Production dependency audit must have zero advisories');
  const blocking = Object.values(dev.advisories).filter((entry) => {
    if (entry.severity !== 'high' && entry.severity !== 'critical')
      return false;
    const ghsa = entry.url.match(
      /^https:\/\/github\.com\/advisories\/(GHSA-[\w-]+)$/,
    )?.[1];
    const exemption = policy.find(
      (item) =>
        item.ghsa === ghsa &&
        item.module === entry.module_name &&
        item.severity === entry.severity,
    );
    const paths = entry.findings.flatMap((finding) => finding.paths);
    return (
      !exemption ||
      paths.length === 0 ||
      paths.some(
        (path) =>
          !exemption.pathPrefixes.some((prefix) => path.startsWith(prefix)),
      )
    );
  });
  if (blocking.length)
    throw new Error(
      `Unaccepted high/critical tooling advisories: ${blocking.map((entry) => `${entry.module_name} ${entry.url}`).join(', ')}`,
    );
  return Object.keys(dev.advisories).length;
}

function audit(extra: string[]): Report {
  const cli = process.env.npm_execpath;
  if (!cli) throw new Error('Run audit:check through pnpm');
  const result = spawnSync(
    process.execPath,
    [cli, 'audit', '--json', ...extra],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 90_000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  if (result.error) throw new Error('Dependency audit could not run');
  return reportSchema.parse(JSON.parse(result.stdout));
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const accepted: unknown = JSON.parse(
    readFileSync('.github/development-advisories.json', 'utf8'),
  );
  const count = assessAudit(audit(['--prod']), audit([]), accepted);
  console.info(
    `Dependency audit passed: production zero; ${count} tooling advisories (known high/critical IDs explicitly scoped).`,
  );
}
