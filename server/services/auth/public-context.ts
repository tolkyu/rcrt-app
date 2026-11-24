import 'server-only';
import type {
  RequestMeta,
  SystemContext,
} from '@/server/context/request-context';
import { getDb } from '@/server/db';
import { systemClock } from '@/server/domain/clock';

/** Context for sign-in endpoints that run before any user is known. */
export function publicAuthContext(meta: RequestMeta): SystemContext {
  return { ...meta, auth: null, db: getDb(), clock: systemClock };
}
