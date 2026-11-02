import { z } from 'zod';
import { timeIdCursorSchema } from './cursor';
import { emailAddressSchema } from './email';
import { fullNameSchema } from './profile';

const nextPath = z.string().max(512).optional().meta({
  description: 'Same-origin path to return to; anything else is ignored.',
});
/** GoTrue email token hash: hex SHA-224 (verified against local Supabase, SEC-T4-01). */
const tokenHash = z.string().regex(/^(pkce_)?[a-f0-9]{56}$/);
const inviteToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const redirect = z.object({ redirectTo: z.string() }).strict();

export const magicLinkRequestSchema = z
  .object({ email: emailAddressSchema })
  .strict();
export const magicLinkResponseSchema = z
  .object({ accepted: z.literal(true) })
  .strict();
export const magicLinkConfirmSchema = z
  .object({ token_hash: tokenHash, next: nextPath })
  .strict();
export const redirectResponseSchema = redirect.meta({ id: 'AuthRedirect' });
export const emptyRequestSchema = z.object({}).strict();
export const oauthStartResponseSchema = z
  .object({ url: z.url() })
  .strict()
  .meta({ id: 'OAuthStart' });

export const inviteTokenSchema = z.object({ token: inviteToken }).strict();
export const inviteInspectResponseSchema = z
  .discriminatedUnion('state', [
    z
      .object({
        state: z.literal('VALID'),
        fullName: z.string(),
        email: z.string(),
        roles: z.array(
          z.object({ role: z.string(), vertical: z.string().nullable() }),
        ),
      })
      .strict(),
    z.object({ state: z.literal('INVALID') }).strict(),
  ])
  .meta({ id: 'InviteInspection' });

export const roleAssignmentInputSchema = z
  .object({ role: z.string().min(1).max(64), verticalId: z.uuid().nullable() })
  .strict();
export const createInviteSchema = z
  .object({
    email: emailAddressSchema,
    fullName: fullNameSchema,
    roles: z.array(roleAssignmentInputSchema).min(1).max(20),
  })
  .strict();
export const createInviteResponseSchema = z
  .object({
    userId: z.uuid(),
    inviteId: z.uuid(),
    expiresAt: z.iso.datetime(),
    delivered: z.boolean(),
  })
  .strict()
  .meta({ id: 'InviteCreated' });

export const mfaStatusResponseSchema = z
  .object({
    aal: z.enum(['aal1', 'aal2']),
    required: z.boolean(),
    hasOtherGrants: z.boolean(),
    canAddFactor: z.boolean(),
    factors: z.array(z.object({ id: z.uuid(), name: z.string().nullable() })),
  })
  .strict()
  .meta({ id: 'MfaStatus' });
export const mfaEnrollResponseSchema = z
  .object({ factorId: z.uuid(), qrCode: z.string(), secret: z.string() })
  .strict()
  .meta({ id: 'MfaEnrollment' });
export const mfaVerifySchema = z
  .object({
    factorId: z.uuid(),
    code: z.string().regex(/^\d{6}$/),
    next: nextPath,
  })
  .strict();
export const mfaResetSchema = z
  .object({ reason: z.string().trim().min(10).max(500) })
  .strict();
export const mfaResetResponseSchema = z
  .object({ removedFactors: z.number().int().min(0) })
  .strict();
export const userIdParamsSchema = z.object({ userId: z.uuid() }).strict();

export const sessionMethodSchema = z.enum([
  'MAGIC_LINK',
  'GOOGLE',
  'INVITE',
  'DEV',
]);
export const sessionListSchema = z
  .object({
    items: z.array(
      z
        .object({
          id: z.uuid(),
          method: sessionMethodSchema,
          startedAt: z.iso.datetime(),
          lastSeenAt: z.iso.datetime(),
          userAgent: z.string().nullable(),
          current: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict()
  .meta({ id: 'SessionList' });
export const endOtherSessionsResponseSchema = z
  .object({ count: z.number().int().min(0) })
  .strict();
export const loginHistoryQuerySchema = z
  .object({
    cursor: timeIdCursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export const loginHistorySchema = z
  .object({
    items: z.array(
      z
        .object({
          id: z.string(),
          occurredAt: z.iso.datetime(),
          action: z.enum([
            'login_succeeded',
            'login_failed',
            'logged_out',
            'session_revoked',
            'mfa_challenge_failed',
          ]),
          result: z.enum(['SUCCESS', 'DENIED']),
          method: z.string().nullable(),
          reason: z.string().nullable(),
          ip: z.string().nullable(),
          userAgent: z.string().nullable(),
        })
        .strict(),
    ),
    nextCursor: z.string().nullable(),
  })
  .strict()
  .meta({ id: 'LoginHistory' });

export type InviteInspection = z.infer<typeof inviteInspectResponseSchema>;
export type MfaStatus = z.infer<typeof mfaStatusResponseSchema>;
export type MfaEnrollment = z.infer<typeof mfaEnrollResponseSchema>;
export type SessionList = z.infer<typeof sessionListSchema>;
export type LoginHistory = z.infer<typeof loginHistorySchema>;
