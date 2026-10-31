import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { pages } = JSON.parse(
  readFileSync('.next/app-build-manifest.json', 'utf8'),
);
const entries = Object.entries(pages).filter(([route]) =>
  route.endsWith('/page'),
);
if (!entries.length)
  throw new Error('No page entries in the Next.js build manifest');

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
    path: [...chunks]
      .filter((chunk) => chunk.endsWith('.js'))
      .map((chunk) => resolve('.next', chunk)),
    gzip: true,
    limit: '180 kB',
  };
});
mkdirSync('.cache', { recursive: true });
writeFileSync(
  '.cache/client-size-limit.json',
  `${JSON.stringify(checks, null, 2)}\n`,
);
