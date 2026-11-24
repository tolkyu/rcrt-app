import console from 'node:console';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const ownerPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const leasePath = (root) => resolve(root, '.cache', 'ai-edit-lease');

function validateOwner(owner) {
  if (typeof owner !== 'string' || !ownerPattern.test(owner)) {
    throw new Error(
      'Owner must be 1–128 letters, digits, dots, underscores, colons or hyphens, starting with a letter or digit.',
    );
  }
}

export function statusLease(root) {
  let raw;
  try {
    raw = readFileSync(leasePath(root), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  try {
    const lease = JSON.parse(raw);
    validateOwner(lease.owner);
    if (
      !Number.isSafeInteger(lease.pid) ||
      lease.pid <= 0 ||
      typeof lease.acquiredAt !== 'string' ||
      new Date(lease.acquiredAt).toISOString() !== lease.acquiredAt
    ) {
      throw new Error('Invalid lease fields');
    }
    return lease;
  } catch {
    throw new Error(
      'Corrupt edit lease metadata; inspect .cache/ai-edit-lease manually.',
    );
  }
}

export function acquireLease(root, owner) {
  validateOwner(owner);
  const path = leasePath(root);
  mkdirSync(dirname(path), { recursive: true });
  const lease = {
    owner,
    pid: process.pid,
    acquiredAt: new Date().toISOString(),
  };
  try {
    writeFileSync(path, `${JSON.stringify(lease)}\n`, { flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(
        'Checkout edit lease already exists; acquisition refused (including the same owner).',
      );
    }
    throw error;
  }
  return lease;
}

export function releaseLease(root, owner) {
  validateOwner(owner);
  const lease = statusLease(root);
  if (!lease) throw new Error('No checkout edit lease exists.');
  if (lease.owner !== owner)
    throw new Error(
      'Checkout edit lease belongs to another owner; release refused.',
    );
  unlinkSync(leasePath(root));
  return lease;
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  try {
    const [command, owner, ...extra] = process.argv.slice(2);
    if (
      extra.length ||
      !['acquire', 'status', 'release'].includes(command) ||
      (command === 'status' ? owner !== undefined : owner === undefined)
    ) {
      throw new Error(
        'Usage: node scripts/ai-edit-lease.mjs acquire <unique-owner> | status | release <unique-owner>',
      );
    }
    const root = resolve(dirname(scriptPath), '..');
    const result =
      command === 'status'
        ? statusLease(root)
        : command === 'acquire'
          ? acquireLease(root, owner)
          : releaseLease(root, owner);
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
