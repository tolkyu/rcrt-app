export const USER_STATUSES = [
  'ACTIVE',
  'INVITED',
  'INVITE_EXPIRED',
  'REVOKED',
  'DEACTIVATED',
] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const USER_MFA_STATES = [
  'ENABLED',
  'OFF',
  'REQUIRED_MISSING',
  'LOCKED',
  'NONE',
] as const;

/** `GLOBAL` selects roles held without a vertical (Адміністратор, Фінансист). */
export const GLOBAL_VERTICAL = 'GLOBAL';
export const USERS_PAGE = 50;
export const USER_SEARCH_MIN = 2;
export const USER_SEARCH_MAX = 100;
export const USER_EVENTS_PAGE = 20;
/** Profile fields a `user.profile_updated` event may name (allowlist, server/events). */
export const USER_PROFILE_FIELDS = ['fullName', 'email', 'timezone'] as const;
