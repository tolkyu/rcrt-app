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
const productionPolicySchema = z.array(
  z.object({
    ghsa: z.string(),
    module: z.string(),
    severity: z.enum(['info', 'low', 'moderate', 'high', 'critical']),
    paths: z.array(z.string()).min(1),
    reason: z.string().min(1),
    until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
);
type Report = z.infer<typeof reportSchema>;

function ghsaOf(url: string) {
  return url.match(/^https:\/\/github\.com\/advisories\/(GHSA-[\w-]+)$/)?.[1];
}

/** A production exemption names one advisory, module and exact dependency paths, and lapses on `until` so it cannot outlive its review. */
function unacceptedProduction(
  prod: Report,
  accepted: z.infer<typeof productionPolicySchema>,
  now: Date,
) {
  return Object.values(prod.advisories).filter((entry) => {
    const ghsa = ghsaOf(entry.url);
    const exemption = accepted.find(
      (item) =>
        item.ghsa === ghsa &&
        item.module === entry.module_name &&
        item.severity === entry.severity,
    );
    const paths = entry.findings.flatMap((finding) => finding.paths);
    return (
      !exemption ||
      now.getTime() >= Date.parse(`${exemption.until}T23:59:59.999Z`) ||
      paths.length === 0 ||
      paths.some((path) => !exemption.paths.includes(path))
    );
  });
}

export function assessAudit(
  production: unknown,
  tooling: unknown,
  accepted: unknown,
  productionAccepted: unknown = [],
  now: Date = new Date(),
) {
  const prod = reportSchema.parse(production);
  const dev = reportSchema.parse(tooling);
  const policy = policySchema.parse(accepted);
  const blockingProduction = unacceptedProduction(
    prod,
    productionPolicySchema.parse(productionAccepted),
    now,
  );
  if (blockingProduction.length)
    throw new Error(
      `Production dependency audit must have zero unaccepted advisories: ${blockingProduction.map((entry) => `${entry.module_name} ${entry.url}`).join(', ')}`,
    );
  const blocking = Object.values(dev.advisories).filter((entry) => {
    if (entry.severity !== 'high' && entry.severity !== 'critical')
      return false;
    const ghsa = ghsaOf(entry.url);
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
  const productionAccepted: unknown = JSON.parse(
    readFileSync('.github/production-advisories.json', 'utf8'),
  );
  const count = assessAudit(
    audit(['--prod']),
    audit([]),
    accepted,
    productionAccepted,
  );
  console.info(
    `Dependency audit passed: production has no unaccepted advisories (time-boxed exemptions only); ${count} tooling advisories (known high/critical IDs explicitly scoped).`,
  );
}
