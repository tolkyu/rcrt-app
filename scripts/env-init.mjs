import {
  copyFileSync,
  constants,
  existsSync,
  readFileSync,
  appendFileSync,
} from 'node:fs';
import console from 'node:console';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/** Local-only secrets are generated per machine, never copied from the example file. */
const generated = {
  AUTH_RATE_LIMIT_SECRET: () => randomBytes(32).toString('base64url'),
  DEV_DEMO_TOTP_SECRET: () =>
    [...randomBytes(32)].map((byte) => BASE32[byte % 32]).join(''),
};

if (!existsSync('.env')) {
  copyFileSync('.env.example', '.env', constants.COPYFILE_EXCL);
  console.log('Created .env from .env.example.');
} else {
  const current = readFileSync('.env', 'utf8');
  const keys = new Set(
    [...current.matchAll(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/gm)].map(
      (match) => match[1],
    ),
  );
  const missing = readFileSync('.env.example', 'utf8')
    .split(/\r?\n/)
    .filter((line) => {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=/);
      return match && !keys.has(match[1]);
    });
  if (missing.length) appendFileSync('.env', `\n${missing.join('\n')}\n`);
  console.log(
    `Kept existing .env values; added ${missing.length} missing defaults.`,
  );
}

let env = readFileSync('.env', 'utf8');
let filled = 0;
for (const [name, make] of Object.entries(generated)) {
  const pattern = new RegExp(`^${name}=[ 	]*$`, 'm');
  if (pattern.test(env)) {
    env = env.replace(pattern, `${name}=${make()}`);
    filled += 1;
  }
}
if (filled) {
  writeFileSync('.env', env);
  console.log(`Generated ${filled} local secret(s) in .env.`);
}
