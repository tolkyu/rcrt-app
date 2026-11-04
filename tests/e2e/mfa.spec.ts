import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { FIXED_CLOCK_ISO } from '../../lib/fixed-clock';
import messages from '../../messages/uk.json' with { type: 'json' };
import { mfaPendingSessionFile, sessionFile } from '../support/e2e-session';
import { problemFulfill } from '../support/problem';
import { captureScreen, forEachTheme, viewportOf } from './screens';

const t = messages.auth.mfa;

/**
 * Enrolment is answered by the browser, so no factor is ever created for a seeded user; the QR codes are
 * pre-rendered fixtures of `otpauth://totp/Hiring:<email>?…&secret=<secret>` with the secrets below.
 */
const ENROLMENTS = {
  'vasyl.tl@demo': {
    factorId: '1692ead0-7054-4a51-8809-4e9a126e4800',
    secret: 'ELXSNOPLXIKFDJTNLZ4FWH46TDF7EJIN',
    qr: 'tests/support/fixtures/mfa-qr-vasyl-tl.svg',
  },
  'admin@demo': {
    factorId: '343ef37d-7b10-4621-ae8a-f94e46691b52',
    secret: 'UKJA6XXZHKD73CWODO2F3QG7JCBNFXKZ',
    qr: 'tests/support/fixtures/mfa-qr-admin.svg',
  },
} as const;

/** Every code check is answered here and counted, so a wrong code never reaches the shared Admin's real attempt limit. */
async function answerCodeChecks(page: Page) {
  const checks = { count: 0 };
  const invalid = await problemFulfill(400, 'MFA_CODE_INVALID', [
    { path: 'body.code', code: 'MFA_CODE_INVALID' },
  ]);
  await page.route('**/api/v1/auth/mfa/verify', (route) => {
    checks.count += 1;
    return route.fulfill(invalid);
  });
  await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return checks;
}

for (const [email, mode] of [
  ['vasyl.tl@demo', 'optional'],
  ['admin@demo', 'backup'],
] as const) {
  test.describe(email, () => {
    test.use({ storageState: sessionFile(email) });

    test(`captures «/mfa/setup» (${mode}) with a browser-answered enrolment [SHOT-01..03, SEC-AUTH-3]`, async ({
      page,
    }, testInfo) => {
      const enrolment = ENROLMENTS[email];
      const qrCode = `data:image/svg+xml;utf8,${encodeURIComponent(readFileSync(enrolment.qr, 'utf8'))}`;
      let enrolments = 0;
      await page.route('**/api/v1/auth/mfa/enroll', (route) => {
        enrolments += 1;
        return route.fulfill({
          json: {
            factorId: enrolment.factorId,
            qrCode,
            secret: enrolment.secret,
          },
        });
      });
      const checks = await answerCodeChecks(page);
      const title = mode === 'optional' ? t.optionalTitle : t.secondTitle;
      const role = email === 'admin@demo' ? 'admin' : 'team-lead';
      await forEachTheme(page, async (theme) => {
        await page.goto('/mfa/setup');
        await expect(
          page.getByRole('heading', { level: 1, name: title }),
        ).toBeVisible();
        await expect(page.getByRole('img', { name: t.qrAlt })).toHaveJSProperty(
          'complete',
          true,
        );
        await expect(page.getByText(enrolment.secret)).toBeVisible();
        await expect(page.getByText(t.skip)).toHaveCount(0);
        const exit = page.getByRole('link', {
          name: mode === 'optional' ? t.later : messages.common.cancel,
          exact: true,
        });
        await expect(exit).toHaveAttribute('href', '/profile');
        expect((await exit.boundingBox())!.height).toBeGreaterThanOrEqual(48);
        await captureScreen(
          page,
          testInfo,
          `19-${role}-mfa-setup-${mode}-${viewportOf(testInfo)}-${theme}.png`,
        );
        await exit.click();
        await expect(page).toHaveURL(/\/profile$/);
      });
      expect(enrolments).toBe(2);
      expect(checks.count).toBe(0);
    });
  });
}

test.describe('admin@demo before the TOTP step', () => {
  test.use({ storageState: mfaPendingSessionFile });

  test('captures «/mfa/verify» and its wrong-code state; the code check is answered by the browser [SHOT-01..03, SEC-AUTH-R02]', async ({
    page,
  }, testInfo) => {
    const checks = await answerCodeChecks(page);
    const name = (state: string, theme: string) =>
      `20-admin-mfa-verify-${state}-${viewportOf(testInfo)}-${theme}.png`;
    await forEachTheme(page, async (theme) => {
      await page.goto('/mfa/verify');
      await expect(
        page.getByRole('heading', { level: 1, name: t.verifyTitle }),
      ).toBeVisible();
      const code = page.getByLabel(t.codeLabel);
      await expect(page.getByText(t.lostDevice)).toBeVisible();
      await expect(page.getByText(t.skip)).toHaveCount(0);
      await captureScreen(page, testInfo, name('form', theme));
      await code.fill('480215');
      await page.getByRole('button', { name: t.submit }).click();
      await expect(
        page.getByRole('alert').filter({ hasText: t.invalidCode }),
      ).toBeVisible();
      await expect(code).toHaveValue('');
      await expect(code).toBeFocused();
      await captureScreen(page, testInfo, name('wrong-code', theme));
    });
    expect(checks.count).toBe(2);
  });
});
