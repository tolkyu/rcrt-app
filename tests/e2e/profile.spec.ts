import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { FIXED_CLOCK_ISO } from '../../lib/fixed-clock';
import messages from '../../messages/uk.json' with { type: 'json' };
import { sessionFile, type E2EUser } from '../support/e2e-session';
import {
  PROFILE_SHOTS,
  type ProfileShotUser,
} from '../support/profile-shot-fixture';
import { captureScreen, forEachTheme, viewportOf } from './screens';

const t = {
  shell: messages.shell,
  nav: messages.nav,
  profile: messages.profile,
};
const SETTINGS_PATHS = [
  '/settings',
  '/settings/users',
  '/settings/verticals',
  '/settings/priorities',
  '/settings/audit',
];

/** Phase 1 builds only «Профіль» and Admin «Налаштування» (D28), so every other role lands on «Профіль». */
const NON_ADMIN_ROLES: readonly {
  email: E2EUser;
  verticalSwitcher: boolean;
}[] = [
  { email: 'head.recruiter.gambling@demo', verticalSwitcher: false },
  { email: 'recruiter1.gambling@demo', verticalSwitcher: false },
  { email: 'head.hr@demo', verticalSwitcher: false },
  { email: 'hr@demo', verticalSwitcher: false },
  { email: 'vasyl.tl@demo', verticalSwitcher: false },
  { email: 'finance@demo', verticalSwitcher: false },
];

const kyivDateTime = (iso: string) =>
  new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Kyiv',
  }).format(new Date(iso));

const notFound = (page: Page) =>
  page.getByRole('heading', { level: 1, name: messages.errors.notFoundTitle });
const userMenu = (page: Page) =>
  page.getByRole('button', { name: new RegExp(`^${t.shell.userMenu}:`) });

for (const role of NON_ADMIN_ROLES) {
  test.describe(role.email, () => {
    test.use({ storageState: sessionFile(role.email) });

    test(`${role.email} lands on «Профіль», has no other section, and «Налаштування» is a 404 inside the shell [UI-04-1, VIS-02, ROLE-05-6]`, async ({
      page,
      isMobile,
    }) => {
      await page.goto('/');
      await expect(page).toHaveURL(/\/profile$/);
      await expect(
        page.getByRole('heading', { level: 1, name: t.profile.title }),
      ).toBeVisible();
      await expect(page.getByText(role.email).first()).toBeVisible();
      if (isMobile) {
        await expect(
          page.getByRole('navigation', { name: t.shell.mobileNav }),
        ).toHaveCount(0);
      } else {
        await expect(
          page
            .getByRole('navigation', { name: t.shell.mainNav })
            .getByRole('link'),
        ).toHaveText([t.nav.profile]);
        await expect(
          page.getByRole('button', {
            name: t.shell.verticalFilter.replace(
              '{name}',
              t.shell.allVerticals,
            ),
          }),
        ).toHaveCount(role.verticalSwitcher ? 1 : 0);
      }
      for (const path of SETTINGS_PATHS) {
        const response = await page.goto(path);
        expect(response?.status(), path).toBe(404);
        await expect(notFound(page), path).toBeVisible();
        await expect(userMenu(page)).toBeVisible();
      }
    });
  });
}

/** Sessions and sign-in history come from the fixture, the rest (name, roles, 2FA) is the live seed. */
async function captureProfiles(
  page: Page,
  testInfo: TestInfo,
  user: ProfileShotUser,
  name: string,
) {
  const shot = PROFILE_SHOTS[user];
  await page.route('**/api/v1/auth/sessions', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: { items: shot.sessions } })
      : route.abort(),
  );
  await page.route('**/api/v1/auth/login-history?*', (route) =>
    route.fulfill({ json: { items: shot.history, nextCursor: null } }),
  );
  await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const viewport = viewportOf(testInfo);
  await forEachTheme(page, async (theme) => {
    await page.goto(user === 'admin@demo' ? '/profile' : '/');
    await expect(page).toHaveURL(/\/profile$/);
    await expect(
      page.getByText(
        t.profile.sessionStarted.replace(
          '{at}',
          kyivDateTime(shot.sessions[0]!.startedAt),
        ),
        { exact: true },
      ),
    ).toBeVisible();
    const history = page.getByRole('main').locator('time');
    await expect(history).toHaveCount(shot.history.length);
    await expect(history.first()).toHaveAttribute(
      'datetime',
      shot.history[0]!.occurredAt,
    );
    await captureScreen(page, testInfo, `${name}-${viewport}-${theme}.png`);
  });
}

const PROFILE_SHOT_ROLES: readonly {
  user: ProfileShotUser;
  name: string;
  check: (page: Page) => Promise<void>;
}[] = [
  {
    user: 'vasyl.tl@demo',
    name: '15-team-lead-profile',
    check: async (page) =>
      expect(
        page.getByRole('link', { name: t.profile.mfaSetup }),
      ).toBeVisible(),
  },
  {
    user: 'head.hr@demo',
    name: '15-head-hr-profile',
    check: async (page) =>
      expect(page.getByText('Крипто', { exact: true }).first()).toBeVisible(),
  },
  {
    user: 'finance@demo',
    name: '15-finance-profile',
    check: async (page) =>
      expect(
        page.getByText(t.profile.mfaVerified, { exact: true }),
      ).toBeVisible(),
  },
  {
    user: 'admin@demo',
    name: '18-admin-profile',
    check: async (page) =>
      expect(
        page.getByRole('link', { name: t.profile.mfaAddBackup }),
      ).toBeVisible(),
  },
];

for (const { user, name, check } of PROFILE_SHOT_ROLES) {
  test.describe(user, () => {
    test.use({ storageState: sessionFile(user) });

    test(`captures «Профіль» as ${user} with fixed sessions and sign-in history [SHOT-01..03, ROLE-05-6]`, async ({
      page,
    }, testInfo) => {
      await captureProfiles(page, testInfo, user, name);
      await check(page);
    });
  });
}

test.describe('head.recruiter.gambling@demo', () => {
  test.use({ storageState: sessionFile('head.recruiter.gambling@demo') });

  test('captures the in-shell 404 a Head Recruiter gets for «Налаштування» [SHOT-01..03, VIS-02]', async ({
    page,
  }, testInfo) => {
    await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await forEachTheme(page, async (theme) => {
      await page.goto('/settings/users');
      await expect(notFound(page)).toBeVisible();
      await expect(userMenu(page)).toBeVisible();
      await captureScreen(
        page,
        testInfo,
        `16-head-recruiter-settings-denied-${viewportOf(testInfo)}-${theme}.png`,
      );
    });
  });
});
