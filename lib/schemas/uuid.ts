import { z } from 'zod';

/** Ids are compared and cached in lower case, whichever form the client sent. */
export const uuid = z.uuid().transform((value) => value.toLowerCase());
