import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { UNSAFE_METHODS } from '../server/http/route-shared';
import { API_TOKENS } from '../tests/postman/users';

interface PmPair {
  key: string;
  value: string;
  disabled?: boolean;
}
interface PmRequest {
  name?: string;
  method: string;
  url: {
    path: string[];
    host: string[];
    query?: PmPair[];
    variable?: PmPair[];
  };
  header?: PmPair[];
  body?: { mode: string; raw?: string; options?: unknown };
  auth?: unknown;
}
export interface PmItem {
  id?: string;
  name: string;
  request?: PmRequest;
  response?: unknown[];
  item?: PmItem[];
  event?: unknown[];
}
export interface PmCollection {
  info: Record<string, unknown>;
  item: PmItem[];
}

type JsonSchema = { [key: string]: unknown };
interface OpenApiOperation {
  operationId: string;
  responses: Record<
    string,
    { content?: Record<string, { schema: JsonSchema }> }
  >;
}
export interface OpenApi {
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: { schemas: Record<string, JsonSchema> };
}

const caseSchema = z
  .object({
    operation: z.string(),
    name: z.string().min(1),
    as: z.enum(API_TOKENS as [string, ...string[]]).nullable(),
    params: z.record(z.string(), z.string()).optional(),
    /** An array repeats the key (`?status=A&status=B`), as multi-value filters expect. */
    query: z
      .record(z.string(), z.union([z.string(), z.array(z.string()).min(1)]))
      .optional(),
    headers: z.record(z.string(), z.string().nullable()).optional(),
    body: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
    status: z.number().int().min(200).max(599),
    code: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]*$/)
      .optional(),
    errors: z
      .array(z.object({ path: z.string(), code: z.string() }))
      .optional(),
    script: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    /** Stores the whole response body under this variable for a later `sameAs`. */
    snapshot: z.string().regex(/^\w+$/).optional(),
    /** The response body must deep-equal the snapshot taken earlier (proof a refused mutation wrote nothing). */
    sameAs: z.string().regex(/^\w+$/).optional(),
  })
  .strict()
  .refine((c) => c.status >= 400 === (c.code !== undefined), {
    message: 'code is required exactly for error statuses',
  })
  .refine((c) => c.errors === undefined || c.status === 400, {
    message: 'errors are only asserted for 400',
  });
type ApiCase = z.infer<typeof caseSchema>;

const PROBLEM_KEYS = ['code', 'requestId', 'status', 'type'];
/** Variables the runner injects; everything else in `{{…}}` must be captured by an earlier case. */
const RUNNER_VARIABLES = new Set(['origin', 'baseUrl']);
const CAPTURE = /pm\.collectionVariables\.set\(\s*'(\w+)'/g;

/** Inline `$ref`s (no cycles in our spec) and drop prose so the schema fits a Postman test line. */
function inlineSchema(
  node: unknown,
  schemas: OpenApi['components']['schemas'],
  seen: readonly string[] = [],
): unknown {
  if (Array.isArray(node))
    return node.map((n) => inlineSchema(n, schemas, seen));
  if (!node || typeof node !== 'object') return node;
  const ref = Reflect.get(node, '$ref');
  if (typeof ref === 'string') {
    const name = ref.replace('#/components/schemas/', '');
    if (seen.includes(name) || !schemas[name])
      throw new Error(`Cannot inline schema ${ref}`);
    return inlineSchema(schemas[name], schemas, [...seen, name]);
  }
  return Object.fromEntries(
    Object.entries(node)
      .filter(
        ([key, value]) => key !== 'description' || typeof value !== 'string',
      )
      .map(([key, value]) => [key, inlineSchema(value, schemas, seen)]),
  );
}

function responseSchema(
  spec: OpenApi,
  operation: OpenApiOperation,
  status: number,
): unknown {
  const content = operation.responses[String(status)]?.content;
  const media =
    content?.['application/json'] ?? content?.['application/problem+json'];
  if (!media)
    throw new Error(
      `${operation.operationId}: status ${status} is not in the OpenAPI spec`,
    );
  return inlineSchema(media.schema, spec.components.schemas);
}

/** Same derivation as `problemResponse` in server/http/problem.ts. */
const problemType = (code: string) =>
  `urn:hris:problem:${code.toLowerCase().replaceAll('_', '-')}`;

function assertions(c: ApiCase, schema: unknown): string[] {
  const lines = [
    `pm.test('status ${c.status}', () => pm.response.to.have.status(${c.status}));`,
    `pm.test('Cache-Control: private, no-store', () => pm.expect(pm.response.headers.get('Cache-Control')).to.equal('private, no-store'));`,
    `pm.test('body matches the OpenAPI schema', () => pm.response.to.have.jsonSchema(${JSON.stringify(schema)}));`,
  ];
  if (c.code === undefined) return lines;
  const problem = { type: problemType(c.code), status: c.status, code: c.code };
  const keys =
    c.status === 400 ? [...PROBLEM_KEYS, 'errors'].sort() : PROBLEM_KEYS;
  lines.push(
    `pm.test('application/problem+json', () => pm.expect(pm.response.headers.get('Content-Type')).to.include('application/problem+json'));`,
    `pm.test(${JSON.stringify(`problem ${c.code}`)}, () => pm.expect(pm.response.json()).to.include(${JSON.stringify(problem)}));`,
    `pm.test('problem carries no object data', () => pm.expect(Object.keys(pm.response.json()).sort()).to.deep.equal(${JSON.stringify(keys)}));`,
    ...(c.errors
      ? [
          `pm.test('field errors', () => pm.expect(pm.response.json().errors).to.deep.equal(${JSON.stringify(c.errors)}));`,
        ]
      : []),
  );
  return lines;
}

function scriptLines(dir: string, name: string): string[] {
  const file = resolve(dir, 'tests', `${name}.js`);
  if (!existsSync(file)) throw new Error(`Missing test script ${file}`);
  return readFileSync(file, 'utf8').trimEnd().split(/\r?\n/);
}

/** Values captured by earlier cases; if one is missing the request is skipped and the runner fails the run. */
function chainedVariables(c: ApiCase): string[] {
  const text = JSON.stringify([c.params, c.query, c.headers, c.body]);
  const names = [...text.matchAll(/{{(\w+)}}/g)].map((m) => m[1]!);
  return [...new Set([...names, ...(c.sameAs ? [c.sameAs] : [])])].filter(
    (n) => !RUNNER_VARIABLES.has(n) && !n.startsWith('token_'),
  );
}

function headers(request: PmRequest, c: ApiCase): PmPair[] {
  const merged = new Map<string, PmPair | null>();
  const put = (key: string, value: string | null) =>
    merged.set(key.toLowerCase(), value === null ? null : { key, value });
  for (const h of request.header ?? []) put(h.key, h.value);
  merged.delete('x-csrf-protection');
  if (UNSAFE_METHODS.has(request.method)) {
    put('Origin', '{{origin}}');
    put('X-CSRF-Protection', '1');
  }
  for (const [key, value] of Object.entries(c.headers ?? {})) put(key, value);
  return [...merged.values()].filter((h): h is PmPair => h !== null);
}

function caseItem(
  dir: string,
  spec: OpenApi,
  operation: OpenApiOperation,
  base: PmRequest,
  c: ApiCase,
  captured: Set<string>,
): PmItem {
  const name = `${c.operation} — ${c.name}`;
  const variable = (base.url.variable ?? []).map((v) => {
    if (v.key === 'origin') return v;
    const value = c.params?.[v.key];
    if (value === undefined)
      throw new Error(`${name}: path param ${v.key} missing`);
    return { ...v, value };
  });
  if (UNSAFE_METHODS.has(base.method) && c.body === undefined)
    throw new Error(`${name}: unsafe request needs a body`);
  const request: PmRequest = {
    ...base,
    name,
    url: {
      ...base.url,
      query: Object.entries(c.query ?? {}).flatMap(([key, value]) =>
        [value].flat().map((v) => ({ key, value: v })),
      ),
      variable,
    },
    header: headers(base, c),
    auth: c.as
      ? {
          type: 'bearer',
          bearer: [
            { key: 'token', value: `{{token_${c.as}}}`, type: 'string' },
          ],
        }
      : { type: 'noauth' },
  };
  if (c.body !== undefined)
    request.body = {
      mode: 'raw',
      raw: typeof c.body === 'string' ? c.body : JSON.stringify(c.body),
      options: { raw: { language: 'json' } },
    };
  else delete request.body;
  const exec = [
    ...assertions(c, responseSchema(spec, operation, c.status)),
    ...(c.sameAs
      ? [
          `pm.test(${JSON.stringify(`body identical to ${c.sameAs}`)}, () => pm.expect(pm.response.json()).to.deep.equal(JSON.parse(pm.collectionVariables.get('${c.sameAs}'))));`,
        ]
      : []),
    ...(c.script ? scriptLines(dir, c.script) : []),
    ...(c.snapshot
      ? [
          `pm.collectionVariables.set('${c.snapshot}', JSON.stringify(pm.response.json()));`,
        ]
      : []),
  ];
  const chained = chainedVariables(c);
  const missing = chained.filter((key) => !captured.has(key));
  if (missing.length)
    throw new Error(`${name}: no earlier case captures ${missing.join(', ')}`);
  for (const [, key] of exec.join('\n').matchAll(CAPTURE)) captured.add(key!);
  return {
    name,
    request,
    event: [
      ...(chained.length
        ? [
            {
              listen: 'prerequest',
              script: {
                type: 'text/javascript',
                exec: [
                  `if (${JSON.stringify(chained)}.some((key) => !pm.collectionVariables.get(key))) pm.execution.skipRequest();`,
                ],
              },
            },
          ]
        : []),
      { listen: 'test', script: { type: 'text/javascript', exec } },
    ],
  };
}

const operationKey = (method: string, path: string[]) =>
  `${method.toUpperCase()} /${path.map((p) => (p.startsWith(':') ? `{${p.slice(1)}}` : p)).join('/')}`;

const caseFile = (dir: string, folder: string) =>
  resolve(dir, 'cases', `${folder.toLowerCase()}.json`);

/** Folders whose requests carry generated tests; the runner executes exactly these. */
export function testedFolders(collection: PmCollection): string[] {
  return collection.item
    .filter((folder) => folder.item?.some((item) => item.event?.length))
    .map((folder) => folder.name);
}

/**
 * Replaces every operation of a folder that has `cases/<folder>.json` with its ordered case clones
 * (ADR-006 §Generation); a tested folder must cover all of its operations.
 */
export function mergeCases(
  collection: PmCollection,
  spec: OpenApi,
  dir: string,
) {
  const operations = new Map<string, OpenApiOperation>();
  for (const [path, methods] of Object.entries(spec.paths))
    for (const [method, operation] of Object.entries(methods))
      operations.set(`${method.toUpperCase()} ${path}`, operation);

  const files = new Set(collection.item.map((f) => caseFile(dir, f.name)));
  for (const file of readdirSync(resolve(dir, 'cases')))
    if (!files.has(resolve(dir, 'cases', file)))
      throw new Error(`cases/${file} matches no collection folder`);

  for (const folder of collection.item) {
    const file = caseFile(dir, folder.name);
    if (!existsSync(file)) continue;
    const cases = z
      .array(caseSchema)
      .parse(JSON.parse(readFileSync(file, 'utf8')));
    const bases = new Map<
      string,
      { operation: OpenApiOperation; request: PmRequest }
    >();
    for (const item of folder.item ?? []) {
      if (!item.request) continue;
      const operation = operations.get(
        operationKey(item.request.method, item.request.url.path),
      );
      if (!operation) throw new Error(`No OpenAPI operation for ${item.name}`);
      bases.set(operation.operationId, { operation, request: item.request });
    }
    const uncovered = [...bases.keys()].filter(
      (id) => !cases.some((c) => c.operation === id),
    );
    if (uncovered.length)
      throw new Error(`${folder.name}: no cases for ${uncovered.join(', ')}`);
    const names = cases.map((c) => `${c.operation} — ${c.name}`);
    const duplicate = names.find((n, i) => names.indexOf(n) !== i);
    if (duplicate)
      throw new Error(`${folder.name}: duplicate case ${duplicate}`);
    const captured = new Set<string>();
    folder.item = cases.map((c) => {
      const base = bases.get(c.operation);
      if (!base)
        throw new Error(`${folder.name}: unknown operation ${c.operation}`);
      return caseItem(dir, spec, base.operation, base.request, c, captured);
    });
  }
}
