import { z } from 'zod';

const uuid = z.uuid();

/** Lower-case uuid or null: ids are stored lower-case, and malformed ids must look unknown (404). */
export function uuidOf(value: string): string | null {
  return uuid.safeParse(value).success ? value.toLowerCase() : null;
}
