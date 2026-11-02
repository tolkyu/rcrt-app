import { z } from 'zod';

const uuid = z.uuid();

/** Lower-case uuid or null: subject ids are stored lower-case text, and malformed ids must look unknown (404). */
export function userIdOf(value: string): string | null {
  return uuid.safeParse(value).success ? value.toLowerCase() : null;
}
