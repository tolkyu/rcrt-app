import { globSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildOpenApiDocument } from '../server/http/openapi';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, process.argv[2] ?? 'openapi/openapi.json');

const routes = globSync('app/api/v1/**/route.ts', { cwd: root }).sort();
for (const route of routes)
  await import(pathToFileURL(resolve(root, route)).href);

const document = buildOpenApiDocument();
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`);
console.log(
  `OpenAPI: ${Object.keys(document.paths ?? {}).length} paths from ${routes.length} route modules → ${output}`,
);
