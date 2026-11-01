import type {
  OpenAPIRegistry,
  RouteConfig,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  requestMeta,
  resolveRequestContext,
  type ContextDependencies,
  type RequestContext,
} from '../context/request-context';
import { isTrustedMutation } from '../security/http';
import { ForbiddenError, ValidationError, type FieldError } from './errors';
import { mapError } from './map-error';
import { problemSchema } from './openapi';
import { problemResponse } from './problem';
import { readJsonBody } from './read-json';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 429 | 503;
type AnyObject = z.ZodObject<z.ZodRawShape>;
type Output<S> = S extends z.ZodType ? z.output<S> : undefined;

export interface RouteSpec<
  P extends AnyObject | undefined,
  Q extends AnyObject | undefined,
  B extends z.ZodType | undefined,
  R extends z.ZodType,
> {
  readonly method: HttpMethod;
  /** OpenAPI path below /api/v1 with `{param}` placeholders. */
  readonly path: string;
  readonly operationId: string;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly params?: P;
  readonly query?: Q;
  readonly body?: B;
  readonly response: R;
  readonly successStatus?: 200 | 201;
  /** Documented error responses besides 401 and 500, which every user route can return. */
  readonly errors: readonly ErrorStatus[];
}

export interface RouteInput<P, Q, B> {
  readonly params: P;
  readonly query: Q;
  readonly body: B;
}

export type RouteHandler = (
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
) => Promise<Response>;

export interface RouteFactoryDependencies extends ContextDependencies {
  readonly appUrl: () => string;
  readonly registry: OpenAPIRegistry;
  readonly onComplete?: (entry: RouteLogEntry) => void;
}

export interface RouteLogEntry {
  readonly requestId: string;
  readonly operationId: string;
  readonly status: number;
  readonly ms: number;
  readonly userId: string | null;
  readonly error?: unknown;
}

const unsafe = new Set<HttpMethod>(['POST', 'PUT', 'PATCH', 'DELETE']);
const statusDescriptions: Record<ErrorStatus | 401 | 500, string> = {
  400: 'Validation failed',
  401: 'Unauthenticated, session expired, user deactivated or MFA required',
  403: 'Forbidden (object visible, action not permitted, or CSRF check failed)',
  404: 'Not found or out of scope',
  409: 'Conflict',
  413: 'Request body exceeds 1 MiB',
  429: 'Rate limited',
  500: 'Unexpected error',
  503: 'Service temporarily unavailable',
};

function fieldErrors(error: z.ZodError, prefix: string): FieldError[] {
  return error.issues.map((issue) => ({
    path: [prefix, ...issue.path.map(String)].join('.'),
    code: issue.code,
  }));
}

function parsePart<S extends AnyObject | z.ZodType | undefined>(
  schema: S,
  value: unknown,
  prefix: string,
): Output<S> {
  if (!schema) return undefined as Output<S>;
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ValidationError(fieldErrors(result.error, prefix));
  return result.data as Output<S>;
}

function searchParamsObject(url: URL): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    out[key] = values.length === 1 ? values[0]! : values;
  }
  return out;
}

function openApiRoute(
  spec: RouteSpec<
    AnyObject | undefined,
    AnyObject | undefined,
    z.ZodType | undefined,
    z.ZodType
  >,
): RouteConfig {
  const problem = {
    content: { 'application/problem+json': { schema: problemSchema } },
  };
  const statuses = [
    ...new Set<ErrorStatus | 401 | 500>([
      ...spec.errors,
      401,
      ...(unsafe.has(spec.method) ? [403 as const, 413 as const] : []),
      500,
    ]),
  ].sort();
  return {
    method: spec.method.toLowerCase() as RouteConfig['method'],
    path: spec.path,
    operationId: spec.operationId,
    summary: spec.summary,
    tags: [...spec.tags],
    request: {
      ...(spec.params ? { params: spec.params } : {}),
      ...(spec.query ? { query: spec.query } : {}),
      ...(unsafe.has(spec.method)
        ? { headers: z.object({ 'X-CSRF-Protection': z.literal('1') }) }
        : {}),
      ...(spec.body
        ? {
            body: {
              required: true,
              content: { 'application/json': { schema: spec.body } },
            },
          }
        : {}),
    },
    responses: {
      [spec.successStatus ?? 200]: {
        description: 'Success',
        content: { 'application/json': { schema: spec.response } },
      },
      ...Object.fromEntries(
        statuses.map((status) => [
          status,
          { description: statusDescriptions[status], ...problem },
        ]),
      ),
    },
  };
}

/**
 * The only way to build an /api/v1 handler (ADR-006): transport/CSRF checks repeated from middleware,
 * context loading, Zod parsing, problem+json errors and OpenAPI registration from the same schemas.
 */
export function createRouteFactory(deps: RouteFactoryDependencies) {
  return function defineRoute<
    P extends AnyObject | undefined = undefined,
    Q extends AnyObject | undefined = undefined,
    B extends z.ZodType | undefined = undefined,
    R extends z.ZodType = z.ZodType,
  >(
    spec: RouteSpec<P, Q, B, R>,
    handler: (
      ctx: RequestContext,
      input: RouteInput<Output<P>, Output<Q>, Output<B>>,
    ) => Promise<z.input<R>>,
  ): RouteHandler {
    if (spec.body && !unsafe.has(spec.method)) {
      throw new Error(
        `${spec.operationId}: ${spec.method} routes cannot declare a body`,
      );
    }
    deps.registry.registerPath(openApiRoute(spec));

    return async (request, routeContext) => {
      const started = performance.now();
      const meta = requestMeta(request.headers);
      let userId: string | null = null;
      let response: Response;
      let failure: unknown;
      try {
        if (!isTrustedMutation(request, deps.appUrl())) {
          throw new ForbiddenError('CSRF_FORBIDDEN');
        }
        const ctx = await resolveRequestContext(deps, request.headers, meta);
        userId = ctx.auth.userId;
        const input = {
          params: parsePart(
            spec.params,
            await routeContext.params,
            'params',
          ) as Output<P>,
          query: parsePart(
            spec.query,
            searchParamsObject(new URL(request.url)),
            'query',
          ) as Output<Q>,
          body: unsafe.has(spec.method)
            ? (parsePart(
                spec.body,
                await readJsonBody(request),
                'body',
              ) as Output<B>)
            : (undefined as Output<B>),
        };
        const output = spec.response.parse(await handler(ctx, input));
        response = Response.json(output, {
          status: spec.successStatus ?? 200,
          headers: {
            'Cache-Control': 'private, no-store',
            'X-Request-Id': meta.requestId,
          },
        });
      } catch (error) {
        const mapped = mapError(error, meta.requestId);
        if (!mapped) failure = error;
        response = mapped ?? problemResponse(500, 'INTERNAL', meta.requestId);
        response.headers.set('X-Request-Id', meta.requestId);
      }
      deps.onComplete?.({
        requestId: meta.requestId,
        operationId: spec.operationId,
        status: response.status,
        ms: Math.round(performance.now() - started),
        userId,
        ...(failure === undefined ? {} : { error: failure }),
      });
      return response;
    };
  };
}
