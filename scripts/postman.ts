import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { convert } from 'openapi-to-postmanv2';

const root = resolve(import.meta.dirname, '..');
const input = resolve(root, process.argv[2] ?? 'openapi/openapi.json');
const output = resolve(
  root,
  process.argv[3] ?? 'tests/postman/collection.json',
);

const collection = await new Promise<unknown>((done, fail) => {
  convert(
    { type: 'string', data: readFileSync(input, 'utf8') },
    { folderStrategy: 'Tags', parametersResolution: 'Schema' },
    (error, result) => {
      if (error) return fail(error);
      if (!result?.result)
        return fail(new Error(result?.reason ?? 'OpenAPI conversion failed'));
      const [first] = result.output ?? [];
      if (!first || first.type !== 'collection')
        return fail(new Error('No collection produced'));
      done(first.data);
    },
  );
});

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(collection, null, 2)}\n`);
console.log(`Postman collection → ${output}`);
