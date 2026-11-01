import { createHash, randomBytes } from 'node:crypto';

export const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** 256-bit random token; only its SHA-256 is stored (DG-07, P1-04). */
export function generateInviteToken(): { token: string; hash: Buffer } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

export function isInviteTokenFormat(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

export type InviteState = 'VALID' | 'EXPIRED' | 'INVALID';

/** Expiry is decided at acceptance time, never when the page was opened (ROLE-05-2). */
export function inviteState(
  invite: {
    readonly status: 'PENDING' | 'ACCEPTED' | 'REVOKED';
    readonly expiresAt: Date;
  } | null,
  now: Date,
): InviteState {
  if (!invite || invite.status !== 'PENDING') return 'INVALID';
  return invite.expiresAt.getTime() > now.getTime() ? 'VALID' : 'EXPIRED';
}
