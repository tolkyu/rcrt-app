/** TanStack Query key factory (ADR-007); the RSC prefetch and the client hooks use the same keys. */
export const queryKeys = {
  me: () => ['me'] as const,
  mySessions: () => ['me', 'sessions'] as const,
  myMfa: () => ['me', 'mfa'] as const,
  myLoginHistory: () => ['me', 'login-history'] as const,
  verticals: () => ['verticals'] as const,
  /** Prefix of every position list. */
  positionsAll: () => ['positions'] as const,
  positions: (filters: Readonly<{ status: string; verticalId?: string }>) =>
    ['positions', filters] as const,
  /** Prefix of every vacancy list and count: one invalidation refreshes them all. */
  vacanciesAll: () => ['vacancies'] as const,
  vacancies: (filters: Readonly<Record<string, unknown>>) =>
    ['vacancies', filters] as const,
  /** Under `['vacancies']` so every list invalidation (create, publish, cancel, delete) refreshes the chip count too. */
  vacancyDraftCount: () => ['vacancies', 'draft-count'] as const,
  vacancy: (id: string) => ['vacancy', id.toLowerCase()] as const,
  vacancyContent: (id: string) =>
    ['vacancy', id.toLowerCase(), 'content'] as const,
  /** Under `['vacancy', id]` so a write that refreshes the card refreshes the picker too. */
  vacancyAssignableRecruiters: (id: string) =>
    ['vacancy', id.toLowerCase(), 'assignable-recruiters'] as const,
  settingsVerticals: () => ['settings', 'verticals'] as const,
  settingsAudit: (filters: Readonly<Record<string, string | undefined>>) =>
    ['settings', 'audit', filters] as const,
  settingsUsers: (
    filters: Readonly<Record<string, string | string[] | undefined>>,
  ) => ['settings', 'users', filters] as const,
  settingsAuditActors: (q: string) => ['settings', 'audit-actors', q] as const,
  settingsAuditRecord: (id: string) =>
    ['settings', 'audit-record', id] as const,
  settingsUser: (id: string) => ['settings', 'user', id] as const,
  settingsUserEvents: (id: string) =>
    ['settings', 'user', id, 'events'] as const,
};

/** First page size of «Історія входів» on «Профіль». */
export const LOGIN_HISTORY_PAGE = 10;
