import type { Page } from '@playwright/test';

/**
 * Which demo users have signed in depends on the database's history, so every screenshot uses this one
 * table (UX-G-03): before the fixed clock, after the seeded invitations; the deactivated recruiter signed
 * in before she was deactivated, the never-accepted invitee never did.
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
  'inactive.recruiter@demo': '2026-11-06T14:09:51.000Z',
};

export const shotSignIn = (email: string) => SHOT_SIGN_INS[email] ?? null;

/** The seed writes its history at the fixed clock; shots move invitations to onboarding day, before every sign-in. */
export const SHOT_INVITED_AT = '2026-11-02T07:14:36.000Z';

/** The seed creates both verticals at the fixed clock; shots date them just before the first invitations. */
export const SHOT_VERTICALS_CREATED_AT: Record<string, string> = {
  Гемблінг: '2026-11-02T06:58:12.000Z',
  Крипто: '2026-11-02T07:03:40.000Z',
};

/** «Вертикалі» with the shot creation dates; names and user counts stay the live seed. */
export function routeShotVerticals(page: Page) {
  return page.route('**/api/v1/settings/verticals', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as {
      items: { name: string; createdAt: string }[];
    };
    for (const item of body.items)
      item.createdAt = SHOT_VERTICALS_CREATED_AT[item.name] ?? item.createdAt;
    await route.fulfill({ response, json: body });
  });
}
