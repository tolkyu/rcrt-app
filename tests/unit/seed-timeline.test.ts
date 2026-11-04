import { describe, expect, it } from 'vitest';
import { FIXED_CLOCK_ISO } from '@/lib/fixed-clock';
import { DEMO_USERS } from '@/server/db/seed/index';
import { SHOT_SIGN_INS } from '../support/shot-timeline';

describe('screenshot sign-ins match the seed history [UX-G-03, STORY-SEED-1]', () => {
  it.each(Object.entries(SHOT_SIGN_INS))(
    '%s signs in after accepting, before any deactivation and before the fixed clock',
    (email, signIn) => {
      const user = DEMO_USERS.find((entry) => entry.email === email);
      expect(user?.acceptedAt).toBeInstanceOf(Date);
      const at = Date.parse(signIn);
      expect(at).toBeGreaterThan(user!.acceptedAt!.getTime());
      if (user!.deactivatedAt)
        expect(at).toBeLessThan(user!.deactivatedAt.getTime());
      expect(at).toBeLessThan(Date.parse(FIXED_CLOCK_ISO));
    },
  );

  it('never invents a sign-in for the invitee who never accepted', () => {
    for (const user of DEMO_USERS.filter((entry) => !entry.acceptedAt))
      expect(SHOT_SIGN_INS[user.email]).toBeUndefined();
  });
});
