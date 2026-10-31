import { z } from 'zod';

export const verticalSchema = z
  .object({ id: z.uuid(), name: z.string() })
  .meta({ id: 'Vertical' });
export type Vertical = z.infer<typeof verticalSchema>;

export const verticalListSchema = z
  .object({ items: z.array(verticalSchema) })
  .meta({ id: 'VerticalList' });
export type VerticalList = z.infer<typeof verticalListSchema>;
