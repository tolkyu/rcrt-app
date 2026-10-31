import { z } from 'zod';

/**
 * Output of credential verification (T4: Supabase JWT checked locally against JWKS, DG-02).
 * Roles never come from here — only from `user_role` in the context query.
 */
export const verifiedIdentitySchema = z
  .object({
    authUserId: z.uuid(),
    sessionId: z.uuid(),
    aal: z.enum(['aal1', 'aal2']),
  })
  .strict();
export type VerifiedIdentity = z.infer<typeof verifiedIdentitySchema>;

/** Resolves the caller from request headers (cookie or Bearer); `null` means no valid credential. */
export type IdentityVerifier = (
  headers: Headers,
) => Promise<VerifiedIdentity | null>;
