import { z } from 'zod';
import {
  FULL_NAME_MAX,
  fullNameIssue,
  normalizeFullName,
} from '@/lib/profile-name';
export { FULL_NAME_MAX } from '@/lib/profile-name';

/** Display name: trimmed, inner whitespace collapsed; the DB rejects blank names too (app_user_name_chk). */
export const fullNameSchema = z
  .string()
  .transform(normalizeFullName)
  .superRefine((value, ctx) => {
    const code = fullNameIssue(value);
    if (code === 'too_small')
      ctx.addIssue({ code, origin: 'string', minimum: 1, inclusive: true });
    if (code === 'too_big')
      ctx.addIssue({
        code,
        origin: 'string',
        maximum: FULL_NAME_MAX,
        inclusive: true,
      });
  });

export const updateMeSchema = z
  .object({ fullName: fullNameSchema })
  .strict()
  .meta({ id: 'UpdateMe' });
export type UpdateMeInput = z.input<typeof updateMeSchema>;
