import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { URL } from 'node:url';
import {
  acquireLease,
  releaseLease,
  statusLease,
} from '../../scripts/ai-edit-lease.mjs';

function checkout(t) {
  const root = mkdtempSync(join(tmpdir(), 'edit-lease-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('exclusive concurrent acquisitions have exactly one winner', async (t) => {
  const root = checkout(t);
  const moduleUrl = new URL('../../scripts/ai-edit-lease.mjs', import.meta.url)
    .href;
  const attempts = Array.from(
    { length: 8 },
    (_, index) =>
      new Promise((resolve, reject) => {
        const source = `import { acquireLease } from ${JSON.stringify(moduleUrl)};
      try { acquireLease(process.argv[1], process.argv[2]); }
      catch { process.exitCode = 1; }`;
        const child = spawn(
          process.execPath,
          ['--input-type=module', '-e', source, root, `session-${index}`],
          { stdio: 'ignore' },
        );
        child.once('error', reject);
        child.once('exit', (code) =>
          resolve({ code, owner: `session-${index}` }),
        );
      }),
  );
  const outcomes = await Promise.all(attempts);
  const winners = outcomes.filter(({ code }) => code === 0);
  assert.equal(winners.length, 1);
  assert.ok(outcomes.every(({ code }) => code === 0 || code === 1));
  assert.equal(statusLease(root).owner, winners[0].owner);
});

test('same owner cannot acquire twice and wrong owner cannot release', (t) => {
  const root = checkout(t);
  const lease = acquireLease(root, 'orchestrator-unique');
  const path = join(root, '.cache', 'ai-edit-lease');
  const raw = readFileSync(path, 'utf8');
  assert.equal(lease.pid, process.pid);
  assert.equal(new Date(lease.acquiredAt).toISOString(), lease.acquiredAt);
  assert.throws(() => acquireLease(root, lease.owner), /already exists/);
  assert.throws(() => acquireLease(root, 'another-session'), /already exists/);
  assert.throws(() => releaseLease(root, 'another-session'), /another owner/);
  assert.equal(readFileSync(path, 'utf8'), raw);
  assert.deepEqual(statusLease(root), lease);
});

test('owner can release and another session can reacquire', (t) => {
  const root = checkout(t);
  assert.equal(statusLease(root), null);
  const lease = acquireLease(root, 'first');
  assert.deepEqual(releaseLease(root, 'first'), lease);
  assert.equal(statusLease(root), null);
  assert.throws(() => releaseLease(root, 'first'), /No checkout/);
  assert.equal(acquireLease(root, 'second').owner, 'second');
});

test('invalid owners fail without creating or removing a lease', (t) => {
  const root = checkout(t);
  const invalid = [
    '',
    '../escape',
    'two words',
    '-leading',
    'x'.repeat(129),
    null,
    undefined,
  ];
  for (const owner of invalid)
    assert.throws(() => acquireLease(root, owner), /Owner must/);
  assert.equal(statusLease(root), null);
  const lease = acquireLease(root, 'valid');
  for (const owner of invalid)
    assert.throws(() => releaseLease(root, owner), /Owner must/);
  assert.deepEqual(statusLease(root), lease);
});

test('corrupt metadata fails closed for status, release and acquisition', (t) => {
  const root = checkout(t);
  acquireLease(root, 'owner');
  const path = join(root, '.cache', 'ai-edit-lease');
  const corrupt = [
    '{',
    'null',
    '{}',
    JSON.stringify({
      owner: 'owner',
      pid: 0,
      acquiredAt: new Date().toISOString(),
    }),
    JSON.stringify({
      owner: '../invalid',
      pid: 1,
      acquiredAt: new Date().toISOString(),
    }),
    JSON.stringify({ owner: 'owner', pid: 1, acquiredAt: 'yesterday' }),
  ];
  for (const raw of corrupt) {
    writeFileSync(path, raw);
    assert.throws(() => statusLease(root), /Corrupt/);
    assert.throws(() => releaseLease(root, 'owner'), /Corrupt/);
    assert.throws(() => acquireLease(root, 'other'), /already exists/);
    assert.equal(readFileSync(path, 'utf8'), raw);
  }
});

test('CLI uses its checkout root, rejects path options, and import has no side effects', (t) => {
  const root = checkout(t);
  const otherRoot = checkout(t);
  mkdirSync(join(root, 'scripts'));
  const script = join(root, 'scripts', 'ai-edit-lease.mjs');
  copyFileSync(
    new URL('../../scripts/ai-edit-lease.mjs', import.meta.url),
    script,
  );
  const imported = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `await import(${JSON.stringify(new URL('../../scripts/ai-edit-lease.mjs', import.meta.url).href)});`,
    ],
    { encoding: 'utf8', cwd: otherRoot },
  );
  assert.equal(imported.status, 0);
  assert.equal(imported.stdout, '');
  assert.equal(imported.stderr, '');
  const cli = (...args) =>
    spawnSync(process.execPath, [script, ...args], {
      encoding: 'utf8',
      cwd: otherRoot,
    });
  assert.equal(cli('acquire', 'cli-owner', '--root', otherRoot).status, 1);
  assert.equal(statusLease(root), null);
  assert.equal(cli('acquire', 'cli-owner').status, 0);
  assert.equal(statusLease(otherRoot), null);
  assert.equal(JSON.parse(cli('status').stdout).owner, 'cli-owner');
  assert.equal(cli('release', 'wrong-owner').status, 1);
  assert.equal(cli('release', 'cli-owner').status, 0);
  assert.equal(JSON.parse(cli('status').stdout), null);
});
