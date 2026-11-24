import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { z } from 'zod';
import { markers, contextCopy } from './privacy-fixture';
import { metadataFixture } from './privacy-git-fixture';

const localRequire = createRequire(import.meta.url);
const dependencyRequire = createRequire(
  localRequire.resolve('@playwright/test/package.json'),
);
const { utils } = z
  .object({
    utils: z.object({
      extractZip: z.custom<
        (path: string, options: { dir: string }) => Promise<void>
      >((value) => typeof value === 'function'),
    }),
  })
  .parse(dependencyRequire('playwright-core/lib/coreBundle'));
const root = resolve('.cache/ci-log-canary');
mkdirSync(root, { recursive: true });
const run = mkdtempSync(join(root, 'run-'));
const testFile = z.object({
  tests: z.array(
    z.object({
      title: z.string(),
      outcome: z.string(),
      results: z.array(
        z.object({
          status: z.string(),
          attachments: z
            .array(z.object({ name: z.string(), body: z.string().optional() }))
            .optional(),
        }),
      ),
    }),
  ),
});

function scan(directory: string) {
  for (const file of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, file.name);
    if (file.isDirectory()) scan(path);
    else {
      assert(!file.name.endsWith('.zip'), 'Raw archive published');
      const text = readFileSync(path).toString();
      for (const marker of Object.values(markers))
        assert(
          !text.includes(marker),
          'Credential marker appeared in report/artifact',
        );
    }
  }
}

function rawFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((file) => {
    const path = join(directory, file.name);
    return file.isDirectory() ? rawFiles(path) : [path];
  });
}

try {
  for (const scenario of process.argv.includes('--metadata-only')
    ? ['metadata']
    : process.argv.includes('--context-only')
      ? ['context']
      : ['main', 'global', 'metadata', 'context']) {
    const directory = join(run, scenario);
    const fixture =
      scenario === 'metadata' ? metadataFixture(directory) : undefined;
    const result = spawnSync(
      process.execPath,
      [
        localRequire.resolve('@playwright/test/cli'),
        'test',
        '-c',
        fixture?.config ?? 'tests/security/playwright.config.ts',
        ...(scenario === 'global'
          ? [
              '--grep',
              'successful authenticated control',
              '--reporter=./tests/support/private-reporter.ts',
            ]
          : scenario === 'metadata'
            ? ['--grep', 'successful authenticated control']
            : scenario === 'context'
              ? ['--grep', 'toast and card context']
              : []),
      ],
      {
        env: {
          ...process.env,
          CI: 'true',
          CI_LOG_CASE: scenario,
          CI_LOG_RUN: run,
          PLAYWRIGHT_HTML_OUTPUT_DIR: join(directory, 'report'),
          ...fixture?.env,
        },
        encoding: 'utf8',
        timeout: 120_000,
      },
    );
    assert(!result.error, 'Canary child failed to execute');
    assert.equal(
      result.status,
      scenario === 'metadata' ? 0 : 1,
      'Unexpected child exit status',
    );
    const output = result.stdout + result.stderr;
    if (scenario !== 'context')
      assert(
        output.includes('successful authenticated control'),
        'Successful control missing',
      );
    if (scenario === 'main') {
      assert(
        output.includes('5 failed'),
        'Expected five visible failing scenarios',
      );
      assert(output.includes('ECONNRESET'), 'Network diagnostic missing');
      assert(
        output.includes('persistent document reset'),
        'Named failure missing',
      );
    }
    for (const marker of Object.values(markers))
      assert(!output.includes(marker), 'Credential marker appeared in console');
    const report = join(directory, 'report');
    const html = readFileSync(join(report, 'index.html'), 'utf8');
    const archive = html.match(
      /<template id="playwrightReportBase64">data:application\/zip;base64,([^<]+)/,
    )?.[1];
    assert(archive, 'Pinned HTML report archive missing');
    const zip = join(directory, 'report.zip');
    writeFileSync(zip, Buffer.from(archive, 'base64'));
    const decoded = join(directory, 'decoded');
    mkdirSync(decoded, { recursive: true });
    await utils.extractZip(zip, { dir: decoded });
    if (scenario === 'metadata') {
      const probe = z
        .object({
          userMetadataPresent: z.literal(true),
          runtimeShuffleLabelPreserved: z.literal(true),
          autoGitDiffPresent: z.literal(true),
          autoCommitPresent: z.literal(true),
          projectMetadataPresent: z.literal(true),
        })
        .safeParse(
          JSON.parse(readFileSync(join(directory, 'probe.json'), 'utf8')),
        );
      assert(
        probe.success,
        'Raw synthetic metadata control missing or runtime metadata mutated',
      );
      const summary = z
        .object({ metadata: z.record(z.string(), z.unknown()) })
        .parse(JSON.parse(readFileSync(join(decoded, 'report.json'), 'utf8')));
      assert(
        !JSON.stringify(summary).includes(markers.metadata),
        'User metadata credential published',
      );
      assert(
        !JSON.stringify(summary).includes(markers.gitDiff),
        'Auto Git diff credential published',
      );
      assert(
        summary.metadata.diagnosticPolicy === 'CI-LOG-01',
        'Safe metadata label missing',
      );
    }
    scan(report);
    scan(decoded);
    const files = readdirSync(decoded).filter(
      (name) => name.endsWith('.json') && name !== 'report.json',
    );
    const tests = files.flatMap(
      (name) =>
        testFile.parse(JSON.parse(readFileSync(join(decoded, name), 'utf8')))
          .tests,
    );
    const control = tests.find((test) =>
      test.title.startsWith('successful authenticated control'),
    );
    if (scenario !== 'context')
      assert.equal(
        control?.results[0]?.status,
        'passed',
        'Authenticated control did not pass',
      );
    if (scenario === 'context') {
      assert.equal(tests.length, 1, 'Context failure scenario missing');
      assert.equal(tests[0]?.outcome, 'unexpected', 'Context failure hidden');
      assert.equal(tests[0]?.results.length, 2, 'Context retry missing');
      for (const result of tests[0]?.results ?? []) {
        assert.equal(
          result.attachments?.length,
          1,
          'Unexpected context attachment publication',
        );
        const attachment = result.attachments?.find(
          (item) => item.name === 'sanitized-page-context',
        );
        assert(attachment?.body, 'Sanitized context attachment missing');
        assert(
          attachment.body.includes('Matcher subtree'),
          'Matcher scope label missing',
        );
        assert(attachment.body.includes(contextCopy.card), 'Card copy lost');
        assert(attachment.body.includes(contextCopy.toast), 'Toast copy lost');
        assert(
          attachment.body.includes('article') &&
            attachment.body.includes('alert'),
          'Context hierarchy lost',
        );
      }
      const contexts = rawFiles(join(directory, 'raw')).filter(
        (path) => basename(path) === 'error-context.md',
      );
      assert.equal(contexts.length, 2, 'Real failure context control missing');
      for (const path of contexts) {
        const raw = readFileSync(path, 'utf8');
        const snapshots = [...raw.matchAll(/```yaml\n([^]*?)\n```/g)]
          .map((match) => match[1] ?? '')
          .join('\n');
        assert(
          snapshots.includes(contextCopy.card) &&
            snapshots.includes(contextCopy.toast),
          'Real producer relevant subtree missing',
        );
        for (const marker of Object.values(markers))
          assert(snapshots.includes(marker), 'Raw DOM privacy control missing');
      }
    }
    if (scenario === 'metadata') {
      const labels = files
        .map((name) => readFileSync(join(decoded, name), 'utf8'))
        .join('');
      assert(labels.includes('@privacy-control'), 'Useful tag label lost');
      assert(labels.includes('privacy-label'), 'Useful project label lost');
      assert(
        !output.includes(markers.tag),
        'Credential tag published to console',
      );
    }
    if (scenario === 'main') {
      assert.equal(
        tests.find((test) => test.title.startsWith('closing a pending'))
          ?.results[0]?.status,
        'passed',
        'Teardown behavior regressed',
      );
      const failures = tests.filter((test) => test.outcome === 'unexpected');
      assert.equal(failures.length, 5, 'Expected five actual report failures');
      for (const failure of failures)
        assert.equal(failure.results.length, 2, 'Retry coverage missing');
      const decodedText = files
        .map((name) => readFileSync(join(decoded, name), 'utf8'))
        .join('');
      assert(
        decodedText.includes('inner step'),
        'Nested recorded steps missing',
      );
      assert(
        decodedText.includes('credential-bearing diagnostic omitted'),
        'Recorded error redaction missing',
      );
      assert(
        decodedText.includes('fixed-clock document/RSC failed (ECONNRESET)'),
        'Document/RSC diagnostic lost',
      );
      assert(
        decodedText.includes('fixed-clock masked API failed (ECONNRESET)'),
        'Masked API diagnostic lost',
      );
      const raw = rawFiles(join(directory, 'raw'));
      const stateCopies = raw.filter((path) =>
        basename(path).startsWith('opaque-file-state-'),
      );
      const traceCopies = raw.filter((path) =>
        basename(path).startsWith('trace-file-'),
      );
      assert.equal(
        stateCopies.length,
        2,
        'Raw JSON attachment retry controls missing',
      );
      assert.equal(
        traceCopies.length,
        2,
        'Raw archive attachment retry controls missing',
      );
      for (const path of stateCopies) {
        const body = readFileSync(path).toString();
        for (const marker of Object.values(markers))
          assert(
            body.includes(marker),
            'Sensitive raw attachment control missing',
          );
      }
      for (const path of traceCopies)
        assert(
          readFileSync(path).toString().includes(markers.cookie),
          'Sensitive raw archive control missing',
        );
    } else if (scenario === 'global') {
      const summary = z
        .object({ errors: z.array(z.string()) })
        .parse(JSON.parse(readFileSync(join(decoded, 'report.json'), 'utf8')));
      assert(
        summary.errors.some((error) => error.includes('ECONNRESET')),
        'Global error hidden',
      );
    }
  }
  console.info(
    'CI-LOG-01 canary passed: failure exit, auth control, console and decoded report privacy',
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Privacy canary failed',
  );
  process.exitCode = 1;
}
