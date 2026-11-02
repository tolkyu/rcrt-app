import { z } from 'zod';

/** RFC 5321 path limit; inputs and the schema share it. */
export const EMAIL_MAX_LENGTH = 254;

/** Trimmed + lower-cased before validation, so uniqueness and «same address» checks compare normalised values (SEC-AUTH-2). */
export const emailAddressSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(EMAIL_MAX_LENGTH));
