/** Actions currently emitted by the app, grouped for the audit filter. */
export const AUDIT_ACTION_GROUPS = {
  users: [
    'user.invited',
    'user.invite_resent',
    'user.invite_revoked',
    'user.reinvited',
    'user.email_changed',
    'user.roles_changed',
    'user.deactivated',
    'user.reactivated',
    'user.invite_accepted',
    'user.profile_updated',
    'user.mfa_enrolled',
    'user.mfa_reset',
  ],
  security: [
    'auth.login_succeeded',
    'auth.login_failed',
    'auth.logged_out',
    'auth.session_revoked',
    'auth.mfa_challenge_failed',
    'auth.mfa_locked',
  ],
  verticals: [
    'vertical.created',
    'vertical.renamed',
    'vertical.tl_priority_changed',
  ],
} as const;
export type AuditActionGroup = keyof typeof AUDIT_ACTION_GROUPS;
export const AUDIT_ENTITY_TYPES = ['user', 'vertical'] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];
export const AUDIT_PERIOD_MAX_DAYS = 366;
export const AUDIT_PAGE = 50;
/** URL/API value of the «Хто» filter for «Система»: system rows except unknown-user sign-in failures. */
export const AUDIT_SYSTEM_ACTOR = 'system';
/** Without an entity this action has no known user and is labelled «Невідомий користувач», not «Система» (T4-K02). */
export const AUDIT_UNKNOWN_ACTOR_ACTION = 'auth.login_failed';
export const AUDIT_ACTORS_PAGE = 20;
