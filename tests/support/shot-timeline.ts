/**
 * Which demo users have signed in depends on the database's history, so every screenshot uses this one
 * table (UX-G-03): before the fixed clock, after each user's seeded invite acceptance (DEMO_USERS); the
 * deactivated recruiter signed in before she was deactivated, the never-accepted invitee never did.
 */
export const SHOT_SIGN_INS: Record<string, string> = {
  'admin@demo': '2026-11-16T07:41:23.000Z',
  'head.recruiter.gambling@demo': '2026-11-16T07:12:57.000Z',
  'recruiter1.gambling@demo': '2026-11-16T06:33:10.000Z',
  'recruiter2.gambling@demo': '2026-11-15T17:47:02.000Z',
  'recruiter.crypto@demo': '2026-11-16T07:26:39.000Z',
  'head.hr@demo': '2026-11-14T09:03:15.000Z',
  'hr@demo': '2026-11-16T05:58:47.000Z',
  'vasyl.tl@demo': '2026-11-16T06:52:08.000Z',
  'taras.tl@demo': '2026-11-13T15:18:44.000Z',
  'tl.crypto@demo': '2026-11-16T06:05:31.000Z',
  'finance@demo': '2026-11-12T12:20:05.000Z',
  'yuliia.petrenko@demo': '2026-11-01T14:09:51.000Z',
};

export const shotSignIn = (email: string) => SHOT_SIGN_INS[email] ?? null;
