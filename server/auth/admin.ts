import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { supabaseAuthConfig, supabaseSecretKey } from './config';
import { emailsMatch } from './email';

/** Privileged Supabase Auth operations; callers authorize first and pass only verified ids. */
export interface AuthAdmin {
  /** A supplied auth id must match before and after token issue; Supabase sends no email here. */
  magicLinkTokenHash(
    email: string,
    expectedAuthUserId?: string,
  ): Promise<string | null>;
  /** Creates the confirmed auth user for an accepted invite, or returns the existing one. */
  ensureUser(email: string): Promise<string | null>;
  setBanned(authUserId: string, banned: boolean): Promise<boolean>;
  listTotpFactorIds(
    authUserId: string,
  ): Promise<{ id: string; name: string | null; verified: boolean }[] | null>;
  deleteFactor(authUserId: string, factorId: string): Promise<boolean>;
}

const BAN_FOREVER = '876000h';

export function createAuthAdmin(): AuthAdmin {
  const { url } = supabaseAuthConfig();
  const client = createClient(url, supabaseSecretKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const admin = client.auth.admin;
  return {
    async magicLinkTokenHash(email, expectedAuthUserId) {
      if (expectedAuthUserId) {
        const existing = await admin.getUserById(expectedAuthUserId);
        if (
          existing.error ||
          existing.data.user?.id !== expectedAuthUserId ||
          !emailsMatch(existing.data.user.email, email)
        )
          return null;
      }
      const { data, error } = await admin.generateLink({
        type: 'magiclink',
        email,
      });
      return !error &&
        emailsMatch(data.user?.email, email) &&
        (!expectedAuthUserId || data.user?.id === expectedAuthUserId) &&
        data.properties?.hashed_token
        ? data.properties.hashed_token
        : null;
    },
    async ensureUser(email) {
      const created = await admin.createUser({ email, email_confirm: true });
      if (!created.error && created.data.user) return created.data.user.id;
      if (created.error?.code !== 'email_exists') return null;
      // generateLink returns the existing user record; the unused token is replaced by the next sign-in.
      const { data, error } = await admin.generateLink({
        type: 'magiclink',
        email,
      });
      return !error && data.user ? data.user.id : null;
    },
    async setBanned(authUserId, banned) {
      const { error } = await admin.updateUserById(authUserId, {
        ban_duration: banned ? BAN_FOREVER : 'none',
      });
      return error === null;
    },
    async listTotpFactorIds(authUserId) {
      const { data, error } = await admin.mfa.listFactors({
        userId: authUserId,
      });
      if (error) return null;
      return data.factors
        .filter((factor) => factor.factor_type === 'totp')
        .map((factor) => ({
          id: factor.id,
          name: factor.friendly_name ?? null,
          verified: factor.status === 'verified',
        }));
    },
    async deleteFactor(authUserId, factorId) {
      const { error } = await admin.mfa.deleteFactor({
        id: factorId,
        userId: authUserId,
      });
      return error === null;
    },
  };
}
