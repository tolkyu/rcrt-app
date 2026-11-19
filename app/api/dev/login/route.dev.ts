import { z } from 'zod';
import { createAuthCookieStore } from '@/server/auth/cookies';
import { requestMeta } from '@/server/context/request-context';
import { devLoginAvailable, devSignIn } from '@/server/dev/dev-login';
import { mapError } from '@/server/http/map-error';
import { describeError, logger } from '@/server/observability/logger';
import { problemResponse } from '@/server/http/problem';
import { readJsonBody } from '@/server/http/read-json';
import { isTrustedMutation } from '@/server/security/http';
import { authDependencies } from '@/server/services/auth/app';
import { publicAuthContext } from '@/server/services/auth/public-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ email: z.string().max(254) }).strict();

/** Development-only sign-in (DEV-1); compiled only by `next dev` through the `.dev.ts` page extension. */
export async function POST(request: Request) {
  const meta = requestMeta(request.headers);
  if (!devLoginAvailable())
    return problemResponse(404, 'NOT_FOUND', meta.requestId);
  if (!isTrustedMutation(request, authDependencies.appUrl()))
    return problemResponse(403, 'CSRF_FORBIDDEN', meta.requestId);
  const cookies = createAuthCookieStore(
    request.headers,
    authDependencies.appUrl(),
  );
  let response: Response;
  try {
    const body = bodySchema.parse(await readJsonBody(request));
    response = Response.json(
      await devSignIn(publicAuthContext(meta), body.email, cookies),
      {
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
  } catch (error) {
    const mapped = mapError(error, meta.requestId);
    // Unexpected failures still answer 404, but are logged by error class only (never the email).
    if (!mapped)
      logger.error(
        {
          requestId: meta.requestId,
          operationId: 'devLogin',
          err: describeError(error),
        },
        'dev login failed',
      );
    response = mapped ?? problemResponse(404, 'NOT_FOUND', meta.requestId);
  }
  cookies.apply(response);
  return response;
}
