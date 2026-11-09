import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { convert } from 'openapi-to-postmanv2';
import { format, resolveConfig } from 'prettier';
import {
  mergeCases,
  type OpenApi,
  type PmCollection,
  type PmItem,
  testedFolders,
} from './postman-cases';

const root = resolve(import.meta.dirname, '..');
const input = resolve(root, process.argv[2] ?? 'openapi/openapi.json');
const output = resolve(
  root,
  process.argv[3] ?? 'tests/postman/collection.json',
);

/** Lifecycle order from docs/test-plan.md §10; Newman runs the tested folders in this order. */
const FOLDER_ORDER = [
  'Auth',
  'Profile',
  'Users',
  'Verticals',
  'Priorities',
  'Audit',
  'Vacancies',
  'Positions',
];
const postmanDir = resolve(root, 'tests/postman');
const source = readFileSync(input, 'utf8');
const spec = JSON.parse(source) as OpenApi;

const collection = await new Promise<PmCollection>((done, fail) => {
  convert(
    { type: 'string', data: source },
    { folderStrategy: 'Tags', parametersResolution: 'Schema' },
    (error, result) => {
      if (error) return fail(error);
      if (!result?.result)
        return fail(new Error(result?.reason ?? 'OpenAPI conversion failed'));
      const [first] = result.output ?? [];
      if (!first || first.type !== 'collection')
        return fail(new Error('No collection produced'));
      done(first.data as PmCollection);
    },
  );
});

/** Random ids and faker-generated example responses would make every regeneration a diff. */
function stripGenerated(items: PmItem[]) {
  for (const item of items) {
    delete item.id;
    delete item.response;
    if (item.item) stripGenerated(item.item);
  }
}

const rank = (name: string) =>
  FOLDER_ORDER.includes(name)
    ? FOLDER_ORDER.indexOf(name)
    : FOLDER_ORDER.length;
delete collection.info._postman_id;
stripGenerated(collection.item);
collection.item.sort((a, b) => rank(a.name) - rank(b.name));
mergeCases(collection, spec, postmanDir);

mkdirSync(dirname(output), { recursive: true });
writeFileSync(
  output,
  await format(JSON.stringify(collection), {
    ...(await resolveConfig(output)),
    filepath: output,
  }),
);
console.log(
  `Postman collection → ${output} (tested: ${testedFolders(collection).join(', ')})`,
);
