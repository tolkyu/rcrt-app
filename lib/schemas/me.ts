import { z } from 'zod';

export const scopeKindSchema = z.enum([
  'GLOBAL',
  'VERTICAL',
  'VERTICAL_FROM_STAGE',
  'OWN',
  'OWN_INITIATED_NEW',
  'ASSIGNED',
  'UNASSIGNED_OPEN',
  'SUBMITTED_TO_ME',
]);

export const effectiveGrantSchema = z
  .object({
    permission: z
      .string()
      .meta({ description: 'Permission code, e.g. `vacancy.read`.' }),
    scope: scopeKindSchema,
    stage: z.string().nullable(),
    verticalIds: z
      .array(z.uuid())
      .nullable()
      .meta({ description: '`null` = all verticals (global grant).' }),
  })
  .meta({ id: 'EffectiveGrant' });

export const meSchema = z
  .object({
    user: z.object({
      id: z.uuid(),
      email: z.string(),
      fullName: z.string(),
      timezone: z.string(),
    }),
    roles: z.array(
      z.object({
        role: z.string(),
        vertical: z.object({ id: z.uuid(), name: z.string() }).nullable(),
      }),
    ),
    mfaRequired: z.boolean().meta({
      description:
        'ADMIN/FINANCE grants are withheld until the session is aal2.',
    }),
    grants: z.array(effectiveGrantSchema),
  })
  .meta({ id: 'Me' });
export type Me = z.infer<typeof meSchema>;
