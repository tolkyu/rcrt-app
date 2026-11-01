import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { createAuthCookieStore, type AuthCookieStore } from '../auth/cookies';
import {
  requestMeta,
  resolveRequestContext,
  type ContextDependencies,
  type RequestContext,
  type SystemContext,
} from '../context/request-context';
import { isTrustedMutation } from '../security/http';
import type { RouteHandler, RouteLogEntry } from './define-route';
import { ForbiddenError, ValidationError } from './errors';
import { mapError } from './map-error';
import { problemResponse } from './problem';
import { readJsonBody } from './read-json';
import {
  problemResponses,
  zodFieldErrors,
  type ErrorStatus,
} from './route-shared';

export interface PublicAuthRouteDependencies extends ContextDependencies {
  appUrl: () => string;
  registry: OpenAPIRegistry;
  onComplete?: (entry: RouteLogEntry) => void;
}
interface AuthRouteSpec<B extends z.ZodType, R extends z.ZodType> {
  path: string;
  operationId: string;
  summary: string;
  tags: readonly string[];
  body: B;
  response: R;
  errors: readonly ErrorStatus[];
}

function authRouteFactory<C extends SystemContext | RequestContext>(
  deps: PublicAuthRouteDependencies,
  context: (
    request: Request,
    meta: ReturnType<typeof requestMeta>,
  ) => Promise<C>,
  authenticated: boolean,
) {
  return function defineAuthRoute<B extends z.ZodType, R extends z.ZodType>(
    spec: AuthRouteSpec<B, R>,
    handler: (
      ctx: C,
      body: z.output<B>,
      cookies: AuthCookieStore,
    ) => Promise<z.input<R>>,
  ): RouteHandler {
    deps.registry.registerPath({
      method: 'post',
      path: spec.path,
      operationId: spec.operationId,
      summary: spec.summary,
      tags: [...spec.tags],
      security: authenticated ? [{ bearerAuth: [] }] : [],
      request: {
        headers: z.object({ 'X-CSRF-Protection': z.literal('1') }),
        body: {
          required: true,
          content: { 'application/json': { schema: spec.body } },
        },
      },
      responses: {
        200: {
          description: 'Success',
          content: { 'application/json': { schema: spec.response } },
        },
        ...problemResponses([
          ...spec.errors,
          ...(authenticated ? [401 as const] : []),
          400,
          403,
          413,
          500,
        ]),
      },
    });
    return async (request) => {
      const started = performance.now();
      const meta = requestMeta(request.headers);
      let cookies: AuthCookieStore | undefined;
      let response: Response;
      let failure: unknown;
      let userId: string | null = null;
      try {
        if (
          request.method !== 'POST' ||
          !isTrustedMutation(request, deps.appUrl())
        )
          throw new ForbiddenError('CSRF_FORBIDDEN');
        // Authenticated auth routes answer 401 before revealing anything about the body (SEC-T4-10).
        const ctx = await context(request, meta);
        userId = ctx.auth?.userId ?? null;
        const parsed = spec.body.safeParse(await readJsonBody(request));
        if (!parsed.success)
          throw new ValidationError(zodFieldErrors(parsed.error, 'body'));
        cookies = createAuthCookieStore(request.headers, deps.appUrl());
        const output = spec.response.parse(
          await handler(ctx, parsed.data, cookies),
        );
        response = Response.json(output, {
          headers: { 'Cache-Control': 'private, no-store' },
        });
      } catch (error) {
        const mapped = mapError(error, meta.requestId);
        if (!mapped) failure = error;
        response = mapped ?? problemResponse(500, 'INTERNAL', meta.requestId);
      }
      response.headers.set('X-Request-Id', meta.requestId);
      cookies?.apply(response);
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

export function createPublicAuthRouteFactory(
  deps: PublicAuthRouteDependencies,
) {
  return authRouteFactory<SystemContext>(
    deps,
    async (_request, meta) => ({
      ...meta,
      db: deps.db(),
      clock: deps.clock,
      auth: null,
    }),
    false,
  );
}

export function createAuthenticatedAuthRouteFactory(
  deps: PublicAuthRouteDependencies,
) {
  return authRouteFactory<RequestContext>(
    deps,
    (request, meta) => resolveRequestContext(deps, request.headers, meta),
    true,
  );
}
