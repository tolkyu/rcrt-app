import 'server-only';
import { createAuthAdmin, type AuthAdmin } from '@/server/auth/admin';
import { createAuthClient } from '@/server/auth/client';
import { googleSignInEnabled } from '@/server/auth/config';
import { verifySupabaseIdentity } from '@/server/auth/supabase-identity';
import { runtimeEnv } from '@/server/config/runtime';
import { appContextDependencies } from '@/server/context/app';
import type { RouteLogEntry } from '@/server/http/define-route';
import { apiRegistry } from '@/server/http/openapi';
import {
  createAuthenticatedAuthRouteFactory,
  createPublicAuthRouteFactory,
} from '@/server/http/public-route';
import { sendEmail } from '@/server/integrations/email/transport';
import { describeError, logger } from '@/server/observability/logger';
import type { AuthDependencies } from './deps';

const routeDependencies = {
  ...appContextDependencies,
  appUrl: () => process.env.APP_URL ?? '',
  registry: apiRegistry,
  onComplete: ({ error, ...entry }: RouteLogEntry) => {
    if (error === undefined) logger.info(entry, 'api request');
    else
      logger.error(
        { ...entry, err: describeError(error) },
        'api request failed',
      );
  },
};

export const definePublicAuthRoute =
  createPublicAuthRouteFactory(routeDependencies);
export const defineAuthenticatedAuthRoute =
  createAuthenticatedAuthRouteFactory(routeDependencies);

let admin: AuthAdmin | undefined;

export const authDependencies: AuthDependencies = {
  createClient: createAuthClient,
  admin: () => (admin ??= createAuthAdmin()),
  verifyIdentity: verifySupabaseIdentity,
  sendEmail,
  appUrl: () => runtimeEnv().APP_URL,
  rateLimitSecret: () => runtimeEnv().AUTH_RATE_LIMIT_SECRET,
  googleEnabled: googleSignInEnabled,
};
