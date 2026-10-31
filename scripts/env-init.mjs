import {
  copyFileSync,
  constants,
  existsSync,
  readFileSync,
  appendFileSync,
} from 'node:fs';
import console from 'node:console';

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
