import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import { resolve } from 'node:path';

const { pages } = JSON.parse(
  readFileSync('.next/app-build-manifest.json', 'utf8'),
);
const entries = Object.entries(pages).filter(([route]) =>
  route.endsWith('/page'),
);
if (!entries.length)
  throw new Error('No page entries in the Next.js build manifest');

/** size-limit treats paths as globs (relative to the config's folder, hence absolute): `[vacancyId]` would match one character and silently drop the file. */
const toGlob = (chunk) =>
  resolve('.next', chunk)
    .replaceAll('\\', '/')
    .replace(/[[\]]/g, (char) => (char === '[' ? '[[]' : '[]]'));

const checks = entries.map(([route, files]) => {
  const chunks = new Set(files);
  const segments = route.split('/').slice(1, -1);
  for (let depth = 0; depth <= segments.length; depth++) {
    const parent = segments.slice(0, depth).join('/');
    for (const kind of ['layout', 'template']) {
      const key = `/${parent ? `${parent}/` : ''}${kind}`;
      for (const chunk of pages[key] ?? []) chunks.add(chunk);
    }
  }
  return {
    name: `${route} initial JavaScript (PERF-04)`,
    path: [
      ...new Set(
        [...chunks].filter((chunk) => chunk.endsWith('.js')).map(toGlob),
      ),
    ],
    gzip: true,
    limit: '180 kB',
  };
});

// Same glob engine as size-limit: every listed chunk must resolve to exactly one file.
for (const check of checks)
  for (const pattern of check.path) {
    const matches = await Array.fromAsync(glob(pattern));
    if (matches.length !== 1)
      throw new Error(
        `${check.name}: ${pattern} matched ${matches.length} files, expected 1`,
      );
  }

mkdirSync('.cache', { recursive: true });
writeFileSync(
  '.cache/client-size-limit.json',
  `${JSON.stringify(checks, null, 2)}\n`,
);
