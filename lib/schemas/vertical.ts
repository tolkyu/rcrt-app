import { z } from 'zod';

export const verticalSchema = z
  .object({ id: z.uuid(), name: z.string() })
  .meta({ id: 'Vertical' });
export type Vertical = z.infer<typeof verticalSchema>;

export const verticalListSchema = z
  .object({ items: z.array(verticalSchema) })
  .meta({ id: 'VerticalList' });
export type VerticalList = z.infer<typeof verticalListSchema>;

export const VERTICAL_NAME_MIN = 2;
export const VERTICAL_NAME_MAX = 50;

export const verticalNameSchema = z
  .string()
  .trim()
  .min(VERTICAL_NAME_MIN)
  .max(VERTICAL_NAME_MAX);

export const verticalIdParamsSchema = z.object({ verticalId: z.uuid() });

export const createVerticalSchema = z
  .object({ name: verticalNameSchema })
  .strict()
  .meta({ id: 'CreateVertical' });
export type CreateVerticalInput = z.input<typeof createVerticalSchema>;

export const renameVerticalSchema = z
  .object({
    name: verticalNameSchema,
    expectedVersion: z.number().int().positive(),
  })
  .strict()
  .meta({ id: 'RenameVertical' });
export type RenameVerticalInput = z.input<typeof renameVerticalSchema>;

/** «Налаштування → Вертикалі» row: users with status «Активний» holding ≥ 1 role in the vertical (wireframe §2.1). */
export const settingsVerticalSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    usersCount: z.number().int().nonnegative(),
    createdAt: z.iso.datetime(),
    version: z.number().int().positive(),
  })
  .meta({ id: 'SettingsVertical' });
export type SettingsVertical = z.infer<typeof settingsVerticalSchema>;

export const settingsVerticalListSchema = z
  .object({ items: z.array(settingsVerticalSchema) })
  .meta({ id: 'SettingsVerticalList' });
export type SettingsVerticalList = z.infer<typeof settingsVerticalListSchema>;
