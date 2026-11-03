/** Seeded users whose tokens the Newman run receives as `token_<key>`; TOTP users also get `token_<key>_aal1`. */
export const API_USERS = {
  admin: { email: 'admin@demo', totp: true },
  finance: { email: 'finance@demo', totp: true },
  head_recruiter_gambling: {
    email: 'head.recruiter.gambling@demo',
    totp: false,
  },
  recruiter_crypto: { email: 'recruiter.crypto@demo', totp: false },
} as const;

export type ApiUser = keyof typeof API_USERS;

export const API_TOKENS = Object.entries(API_USERS).flatMap(([key, user]) =>
  user.totp ? [key, `${key}_aal1`] : [key],
);
