export const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000;
/** Activity is written at most once a minute per session, so reads stay single-query. */
export const SESSION_TOUCH_INTERVAL_MS = 60 * 1000;

export type SessionEndReason =
  'LOGOUT' | 'IDLE' | 'ABSOLUTE' | 'DEACTIVATED' | 'USER' | 'MFA_RESET';

export type SessionVerdict =
  | { readonly state: 'ACTIVE' }
  | { readonly state: 'EXPIRED'; readonly reason: 'IDLE' | 'ABSOLUTE' };

/** Absolute hours on UTC instants, so DST changes in Kyiv never shorten or extend a session (SEC-AUTH-4). */
export function evaluateSession(
  session: { readonly startedAt: Date; readonly lastSeenAt: Date },
  now: Date,
): SessionVerdict {
  const at = now.getTime();
  if (at - session.startedAt.getTime() >= SESSION_ABSOLUTE_MS)
    return { state: 'EXPIRED', reason: 'ABSOLUTE' };
  if (at - session.lastSeenAt.getTime() >= SESSION_IDLE_MS)
    return { state: 'EXPIRED', reason: 'IDLE' };
  return { state: 'ACTIVE' };
}
