import type { AuthAdmin } from '@/server/auth/admin';
import type { AuthClient } from '@/server/auth/client';
import type { AuthCookieStore } from '@/server/auth/cookies';
import type { IdentityVerifier } from '@/server/context/identity';
import type { SendEmail } from '@/server/integrations/email/transport';

/** Everything the auth services need from the outside world; integration tests substitute the Supabase/email edges. */
export interface AuthDependencies {
  readonly createClient: (cookies: AuthCookieStore) => AuthClient;
  readonly admin: () => AuthAdmin;
  readonly verifyIdentity: IdentityVerifier;
  readonly sendEmail: SendEmail;
  readonly appUrl: () => string;
  readonly rateLimitSecret: () => string;
  readonly googleEnabled: () => boolean;
}
