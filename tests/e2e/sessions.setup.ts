import { test as setup } from '@playwright/test';
import {
  E2E_ORIGIN,
  E2E_USERS,
  MFA_PENDING_USER,
  mfaPendingSessionFile,
  sessionFile,
  signIn,
  signInWithTotp,
  type E2EUser,
} from '../support/e2e-session';

for (const [email, method] of Object.entries(E2E_USERS) as [
  E2EUser,
  'totp' | 'link',
][]) {
  setup(`sign in ${email}`, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: E2E_ORIGIN });
    try {
      if (method === 'totp') await signInWithTotp(context.request, email);
      else await signIn(context.request, email);
      await context.storageState({ path: sessionFile(email) });
    } finally {
      await context.close();
    }
  });
}

setup(
  `sign in ${MFA_PENDING_USER} without the TOTP step`,
  async ({ browser }) => {
    const context = await browser.newContext({ baseURL: E2E_ORIGIN });
    try {
      await signIn(context.request, MFA_PENDING_USER);
      await context.storageState({ path: mfaPendingSessionFile });
    } finally {
      await context.close();
    }
  },
);
