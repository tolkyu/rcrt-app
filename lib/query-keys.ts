/** TanStack Query key factory (ADR-007); the RSC prefetch and the client hooks use the same keys. */
export const queryKeys = {
  me: () => ['me'] as const,
  mySessions: () => ['me', 'sessions'] as const,
  myMfa: () => ['me', 'mfa'] as const,
  myLoginHistory: () => ['me', 'login-history'] as const,
};

/** First page size of «Історія входів» on «Профіль». */
export const LOGIN_HISTORY_PAGE = 10;
