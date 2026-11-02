/** Actions currently emitted by the app, grouped for the audit filter. */
export const AUDIT_ACTION_GROUPS = {
  users: [
    'user.invited',
    'user.invite_resent',
    'user.invite_revoked',
    'user.reinvited',
    'user.email_changed',
    'user.roles_changed',
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
  verticals: ['vertical.created', 'vertical.renamed'],
} as const;
export type AuditActionGroup = keyof typeof AUDIT_ACTION_GROUPS;
export const AUDIT_ENTITY_TYPES = ['user', 'vertical'] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];
export const AUDIT_PERIOD_MAX_DAYS = 366;
export const AUDIT_PAGE = 50;
