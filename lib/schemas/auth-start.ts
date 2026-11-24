import { z } from 'zod';

/** The two answers the sign-in form reads; kept out of `auth.ts` so the login page does not ship the cursor, profile and email schemas that file pulls in (PERF-04). */
export const magicLinkResponseSchema = z
  .object({ accepted: z.literal(true) })
  .strict();
export const oauthStartResponseSchema = z
  .object({ url: z.url() })
  .strict()
  .meta({ id: 'OAuthStart' });
