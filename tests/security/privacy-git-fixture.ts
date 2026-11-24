import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { markers } from './privacy-fixture';

/** Only this temporary repository is changed; the Git plugin never inspects the application checkout. */
export function metadataFixture(directory: string) {
  const repository = join(directory, 'synthetic-git');
  mkdirSync(repository, { recursive: true });
  const env = {
    ...process.env,
    GIT_DIR: undefined,
    GIT_WORK_TREE: undefined,
    GIT_INDEX_FILE: undefined,
    GIT_COMMON_DIR: undefined,
    GIT_AUTHOR_NAME: 'Privacy Fixture',
    GIT_COMMITTER_NAME: 'Privacy Fixture',
    GIT_AUTHOR_EMAIL: 'privacy@fixture.test',
    GIT_COMMITTER_EMAIL: 'privacy@fixture.test',
    GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
    GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
  };
  const git = (...args: string[]) => {
    const result = spawnSync(
      'git',
      [
        '-c',
        `core.hooksPath=${join(repository, 'no-hooks')}`,
        '-c',
        'commit.gpgSign=false',
        ...args,
      ],
      { cwd: repository, env, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, 'Synthetic Git fixture command failed');
    return result.stdout.trim();
  };
  git('init', '--initial-branch=main');
  writeFileSync(join(repository, 'fixture.txt'), 'synthetic baseline\n');
  git('add', 'fixture.txt');
  const base = git(
    'commit-tree',
    git('write-tree'),
    '-m',
    'Synthetic fixture baseline',
  );
  git('update-ref', 'HEAD', base);
  writeFileSync(join(repository, 'fixture.txt'), `${markers.gitDiff}\n`);
  git('add', 'fixture.txt');
  const head = git(
    'commit-tree',
    git('write-tree'),
    '-p',
    base,
    '-m',
    'Synthetic fixture diff',
  );
  git('update-ref', 'HEAD', head);

  const config = join(repository, 'playwright.config.ts');
  writeFileSync(
    config,
    `
import config from ${JSON.stringify(resolve('tests/security/playwright.config.ts').replaceAll('\\', '/'))};
export default {
  ...config,
  testDir: ${JSON.stringify(resolve('tests/security'))},
  captureGitInfo: { commit: true, diff: true },
  metadata: { custom: ${JSON.stringify(markers.metadata)}, shuffleSeed: ${JSON.stringify(markers.metadata)} },
  projects: [{ name: 'privacy-label', metadata: { custom: ${JSON.stringify(markers.projectMetadata)} } }],
  reporter: [
    [${JSON.stringify(resolve('tests/security/privacy-metadata-probe.ts'))}],
    [${JSON.stringify(resolve('tests/support/private-reporter.ts'))}, { outputFolder: ${JSON.stringify(join(directory, 'report'))} }],
  ],
};
`,
  );
  const event = join(directory, 'github-event.json');
  writeFileSync(
    event,
    JSON.stringify({
      pull_request: {
        title: 'Synthetic privacy fixture',
        number: 1,
        base: { sha: base },
      },
    }),
  );
  return {
    config,
    env: {
      GIT_DIR: undefined,
      GIT_WORK_TREE: undefined,
      GIT_INDEX_FILE: undefined,
      GIT_COMMON_DIR: undefined,
      GITHUB_ACTIONS: 'true',
      GITHUB_SERVER_URL: 'https://fixture.invalid',
      GITHUB_REPOSITORY: 'fixture/privacy',
      GITHUB_RUN_ID: '1',
      GITHUB_SHA: head,
      GITHUB_EVENT_PATH: event,
    },
  };
}
