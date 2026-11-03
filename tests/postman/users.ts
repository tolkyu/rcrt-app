/**
 * Seeded users whose tokens the Newman run receives as `token_<key>`; TOTP users also get `token_<key>_aal1`.
 * `cookie` users also get `cookie_<key>` and may appear only in the Auth folder, which ends their sessions;
 * they must belong to a user no other suite signs in. Sessions of the same email are signed in one after another.
 */
export const API_USERS: Record<
  string,
  { email: string; totp: boolean; cookie?: true }
> = {
  admin: { email: 'admin@demo', totp: true },
  finance: { email: 'finance@demo', totp: true },
  head_recruiter_gambling: {
    email: 'head.recruiter.gambling@demo',
    totp: false,
  },
  recruiter_crypto: { email: 'recruiter.crypto@demo', totp: false },
  tl_crypto: { email: 'tl.crypto@demo', totp: false, cookie: true },
  /** Second session of the same user: «end other sessions» from `tl_crypto` must end exactly this one. */
  tl_crypto_other: { email: 'tl.crypto@demo', totp: false, cookie: true },
};

export const API_TOKENS = Object.entries(API_USERS).flatMap(([key, user]) =>
  user.totp ? [key, `${key}_aal1`] : [key],
);
