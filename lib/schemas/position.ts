import { z } from 'zod';
import {
  hasOnlyVisibleChars,
  normalizePositionName,
  POSITION_NAME_MAX,
  POSITION_NAME_MIN,
} from '../position-name';
import { uuid } from './uuid';

export { POSITION_NAME_MAX, POSITION_NAME_MIN };
/** Above verticals x POSITION_PER_VERTICAL_LIMIT for any realistic number of verticals, so the unfiltered Admin list cannot overflow before a cap does. */
export const POSITION_LIST_LIMIT = 1000;
export const POSITION_PER_VERTICAL_LIMIT = 300;
export const POSITION_WRITE_RATE_LIMIT = {
  perUser: 30,
  windowSeconds: 60,
} as const;
export const POSITION_STATUS_FILTERS = ['active', 'all'] as const;

/** Rejects NUL (PostgreSQL 22021 would be a 500), bidi/zero-width spoofing and lone surrogates before normalising; length is measured on the stored form. */
export const positionNameSchema = z
  .string()
  .refine(hasOnlyVisibleChars, 'invalid_chars')
  .overwrite(normalizePositionName)
  .min(POSITION_NAME_MIN)
  .max(POSITION_NAME_MAX)
  .meta({
    description:
      'Stored in NFC with runs of whitespace collapsed to one space; 2..80 UTF-16 code units after that. Control, zero-width/bidi format, line and paragraph separator and private-use code points and lone surrogates are rejected. Unique per vertical ignoring case and apostrophe variants (409 POSITION_NAME_TAKEN); inactive positions keep their name reserved.',
  });

export const positionIdParamsSchema = z.object({ positionId: uuid });

export const positionListQuerySchema = z.object({
  verticalId: uuid.optional(),
  status: z.enum(POSITION_STATUS_FILTERS).default('active'),
});
export type PositionListQuery = z.input<typeof positionListQuerySchema>;

export const positionSchema = z
  .object({
    id: z.uuid(),
    verticalId: z.uuid(),
    name: z.string(),
    isActive: z.boolean(),
    version: z.number().int().positive(),
    createdAt: z.iso.datetime(),
    openVacanciesCount: z.number().int().nonnegative().nullable().meta({
      description:
        'Live vacancies of the position with status OPEN (drafts and vacancies on hold are not counted). Present only in the manager list (`status=all`); null everywhere else.',
    }),
  })
  .meta({ id: 'Position' });
export type Position = z.infer<typeof positionSchema>;

export const positionListSchema = z
  .object({ items: z.array(positionSchema).max(POSITION_LIST_LIMIT) })
  .meta({ id: 'PositionList' });
export type PositionList = z.infer<typeof positionListSchema>;

export const createPositionSchema = z
  .object({ verticalId: uuid, name: positionNameSchema })
  .strict()
  .meta({ id: 'CreatePosition' });
export type CreatePositionInput = z.input<typeof createPositionSchema>;

export const patchPositionSchema = z
  .object({
    expectedVersion: z.number().int().positive().meta({
      description:
        'Version the client last read; a different current version answers 409 STALE_STATE.',
    }),
    name: positionNameSchema.optional(),
    isActive: z.boolean().optional().meta({
      description: 'false deactivates, true reactivates the position.',
    }),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.isActive !== undefined, {
    path: ['name'],
    message: 'nothing_to_change',
  })
  .meta({
    id: 'PatchPosition',
    description:
      'At least one of `name` or `isActive` is required. A request that changes nothing is a no-op: 200, no version bump, no audit row. A combined rename and status change writes two audit rows and two events.',
  });
export type PatchPositionInput = z.input<typeof patchPositionSchema>;
