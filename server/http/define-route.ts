import type {
  OpenAPIRegistry,
  RouteConfig,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  IDEMPOTENCY_HEADER,
  idempotencyKeySchema,
} from '../../lib/idempotency';
import { hasAnyGrant, requirePermission } from '../authz/can';
import type { AuthContext } from '../authz/context';
import type { PermissionCode } from '../authz/permissions';
import {
  requestMeta,
  resolveRequestContext,
  type ContextDependencies,
  type RequestContext,
} from '../context/request-context';
import { isTrustedMutation } from '../security/http';
import { ForbiddenError, NotFoundError, ValidationError } from './errors';
import { mapError } from './map-error';
import { problemResponse } from './problem';
import { readJsonBody } from './read-json';
import {
  problemResponses,
  UNSAFE_METHODS,
  zodFieldErrors,
  type ErrorStatus,
  type HttpMethod,
} from './route-shared';

export type { ErrorStatus, HttpMethod } from './route-shared';
export { UNSAFE_METHODS } from './route-shared';
type AnyObject = z.ZodObject<z.ZodRawShape>;
type Output<S> = S extends z.ZodType ? z.output<S> : undefined;

export interface RouteSpec<
  P extends AnyObject | undefined,
  Q extends AnyObject | undefined,
  B extends z.ZodType | undefined,
  R extends z.ZodType,
  I extends true | undefined = undefined,
> {
  readonly method: HttpMethod;
  /** OpenAPI path below /api/v1 with `{param}` placeholders. */
  readonly path: string;
  readonly operationId: string;
  readonly permission?: PermissionCode;
  /** 403 unless the caller holds this permission in some scope; checked right after `permission`, before params, query or body are parsed. */
  readonly requireGrant?: PermissionCode;
  /** 404 of an unknown object unless this holds; checked right after `permission`/`requireGrant`, before params, `Idempotency-Key` and body are read, for routes whose objects must not be probed (D92). */
  readonly hideUnless?: (auth: AuthContext) => boolean;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly params?: P;
  readonly query?: Q;
  readonly body?: B;
  readonly response: R;
  readonly successStatus?: 200 | 201;
  /** Requires the `Idempotency-Key` header (400 when missing or malformed) and passes it to the handler as `idempotencyKey`. */
  readonly idempotent?: I;
  /** Documented error responses besides 401, 500 and the 400 every route with params/query/body returns. */
  readonly errors: readonly ErrorStatus[];
}

export interface RouteInput<P, Q, B> {
  readonly params: P;
  readonly query: Q;
  readonly body: B;
}
type IdempotentInput<I> = I extends true
  ? { readonly idempotencyKey: string }
  : unknown;

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

function parsePart<S extends AnyObject | z.ZodType | undefined>(
  schema: S,
  value: unknown,
  prefix: string,
): Output<S> {
  if (!schema) return undefined as Output<S>;
  const result = schema.safeParse(value);
  if (!result.success && prefix === 'params') throw new NotFoundError();
  if (!result.success)
    throw new ValidationError(zodFieldErrors(result.error, prefix));
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
    z.ZodType,
    true | undefined
  >,
): RouteConfig {
  return {
    method: spec.method.toLowerCase() as RouteConfig['method'],
    path: spec.path,
    operationId: spec.operationId,
    summary: spec.summary,
    tags: [...spec.tags],
    request: {
      ...(spec.params ? { params: spec.params } : {}),
      ...(spec.query ? { query: spec.query } : {}),
      ...(UNSAFE_METHODS.has(spec.method)
        ? {
            headers: z.object({
              'X-CSRF-Protection': z.literal('1'),
              ...(spec.idempotent
                ? { [IDEMPOTENCY_HEADER]: idempotencyKeySchema }
                : {}),
            }),
          }
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
      ...problemResponses([
        ...spec.errors,
        ...(spec.params || spec.query || spec.body ? [400 as const] : []),
        401,
        ...(UNSAFE_METHODS.has(spec.method)
          ? [403 as const, 413 as const]
          : []),
        500,
      ]),
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
    I extends true | undefined = undefined,
  >(
    spec: RouteSpec<P, Q, B, R, I>,
    handler: (
      ctx: RequestContext,
      input: RouteInput<Output<P>, Output<Q>, Output<B>> & IdempotentInput<I>,
    ) => Promise<z.input<R>>,
  ): RouteHandler {
    if (spec.body && !UNSAFE_METHODS.has(spec.method)) {
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
        if (spec.permission) requirePermission(ctx.auth, spec.permission);
        if (spec.requireGrant && !hasAnyGrant(ctx.auth, spec.requireGrant))
          throw spec.hideUnless ? new NotFoundError() : new ForbiddenError();
        if (spec.hideUnless && !spec.hideUnless(ctx.auth))
          throw new NotFoundError();
        const idempotency = spec.idempotent
          ? idempotencyKeySchema.safeParse(
              request.headers.get(IDEMPOTENCY_HEADER) ?? undefined,
            )
          : undefined;
        if (idempotency && !idempotency.success)
          throw new ValidationError([
            { path: `header.${IDEMPOTENCY_HEADER}`, code: 'invalid_key' },
          ]);
        const input = {
          ...(idempotency?.success ? { idempotencyKey: idempotency.data } : {}),
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
          body: UNSAFE_METHODS.has(spec.method)
            ? (parsePart(
                spec.body,
                await readJsonBody(request),
                'body',
              ) as Output<B>)
            : (undefined as Output<B>),
        };
        const output = spec.response.parse(
          await handler(ctx, input as Parameters<typeof handler>[1]),
        );
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
      const duration = Math.max(0, performance.now() - started);
      response.headers.set('Server-Timing', `app;dur=${duration.toFixed(2)}`);
      deps.onComplete?.({
        requestId: meta.requestId,
        operationId: spec.operationId,
        status: response.status,
        ms: Math.round(duration),
        userId,
        ...(failure === undefined ? {} : { error: failure }),
      });
      return response;
    };
  };
}
