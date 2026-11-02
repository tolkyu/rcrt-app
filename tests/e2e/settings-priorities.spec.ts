import { copyFileSync, mkdirSync } from 'node:fs';
import {
  devices,
  expect,
  test,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { FIXED_CLOCK_ISO } from '../../lib/fixed-clock';
import messages from '../../messages/uk.json' with { type: 'json' };
import {
  E2E_ORIGIN,
  MUTATION_HEADERS,
  sessionFile,
} from '../support/e2e-session';

const t = messages.settings.priorities;
const nav = messages.settings.nav;

/** Admin-only screen with real saves on the shared seed; runs in `e2e-admin-desktop`, mobile by resizing. */
test.use({ storageState: sessionFile('admin@demo') });
test.describe.configure({ mode: 'default' });
test.afterEach(({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }));

type Vertical = { id: string; name: string };
type Item = {
  userId: string;
  fullName: string;
  priority: number | null;
  version: number | null;
};

const VASYL = 'Василь Мороз';
const TARAS = 'Тарас Лисенко';
const SEEDED: Record<string, number> = { [VASYL]: 0, [TARAS]: 1 };

const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{${key}}`, String(value)),
    template,
  );
const field = (page: Page, name: string) =>
  page.getByLabel(fill(t.fieldLabel, { name }), { exact: true });
const up = (page: Page, name: string) =>
  page.getByRole('button', { name: fill(t.moveUp, { name }), exact: true });
const down = (page: Page, name: string) =>
  page.getByRole('button', { name: fill(t.moveDown, { name }), exact: true });
const row = (page: Page, name: string) =>
  page.getByRole('row').filter({ hasText: name });
const footer = (page: Page) =>
  page.getByText(t.unsaved.replace('{count}', ''), { exact: false });
const save = (page: Page) =>
  page.getByRole('button', { name: t.save, exact: true });
const names = (page: Page) =>
  page.getByRole('row').locator('td:nth-child(2) .font-medium');

async function verticals(page: Page): Promise<Record<string, Vertical>> {
  const response = await page.request.get(
    '/api/v1/settings/priorities/verticals',
  );
  expect(response.status()).toBe(200);
  const { items } = (await response.json()) as { items: Vertical[] };
  return Object.fromEntries(items.map((item) => [item.name, item]));
}

/** Puts the seeded Гемблінг priorities back (Vasyl 0, Taras 1) whatever a test left behind. */
async function restoreSeed(page: Page, verticalId: string) {
  const url = `/api/v1/verticals/${verticalId}/team-lead-priorities`;
  const { items } = (await (await page.request.get(url)).json()) as {
    items: Item[];
  };
  const changes = items
    .filter((item) => item.fullName in SEEDED)
    .filter((item) => item.priority !== SEEDED[item.fullName])
    .map((item) => ({
      userId: item.userId,
      priority: SEEDED[item.fullName]!,
      version: item.version,
    }));
  if (changes.length === 0) return;
  const response = await page.request.put(url, {
    headers: MUTATION_HEADERS,
    data: { changes },
  });
  expect(response.status(), await response.text()).toBe(200);
}

test('Admin sees Team Leads by priority with badges; the tab is in the URL [STORY-ROLE-01-3, D47]', async ({
  page,
}) => {
  const { Гемблінг: gambling, Крипто: crypto } = await verticals(page);
  await page.goto('/settings/priorities');
  await expect(page).toHaveURL(`/settings/priorities?vertical=${gambling!.id}`);
  await expect(
    page.getByRole('heading', { level: 1, name: t.title }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: nav.label })
      .getByRole('link', { name: nav.priorities }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByRole('navigation', { name: nav.label }).getByRole('link'),
  ).toHaveText([nav.users, nav.verticals, nav.priorities, nav.audit]);
  const tabs = page.getByRole('tablist', { name: t.tabsLabel });
  await expect(tabs.getByRole('tab')).toHaveText(['Гемблінг', 'Крипто']);
  await expect(tabs.getByRole('tab', { name: 'Гемблінг' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    page.getByRole('table', {
      name: fill(t.caption, { vertical: 'Гемблінг' }),
    }),
  ).toBeVisible();
  await expect(names(page)).toHaveText([VASYL, TARAS]);
  await expect(
    row(page, VASYL).getByText('П0', { exact: true }),
  ).toHaveAttribute('title', t.badgeHint);
  await expect(row(page, TARAS).getByText('П1', { exact: true })).toBeVisible();
  await expect(field(page, VASYL)).toHaveValue('0');
  await expect(up(page, VASYL)).toHaveAttribute('aria-disabled', 'true');
  await expect(down(page, TARAS)).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByText(t.hint)).toBeVisible();
  await expect(footer(page)).toHaveCount(0);

  await tabs.getByRole('tab', { name: 'Крипто' }).click();
  await expect(page).toHaveURL(`/settings/priorities?vertical=${crypto!.id}`);
  await expect(names(page)).toHaveText(['Дмитро Савченко']);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Крипто' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.goto('/settings/priorities?vertical=not-a-vertical');
  await expect(page).toHaveURL(`/settings/priorities?vertical=${gambling!.id}`);
});

test('typing, arrows and clearing re-sort on commit with ties, summary and Cancel [D5, D47, wireframe P1.1]', async ({
  page,
}) => {
  await page.goto('/settings/priorities');
  await field(page, VASYL).fill('1');
  await expect(names(page)).toHaveText([VASYL, TARAS]);
  await field(page, VASYL).press('Enter');
  await expect(page.getByText(t.tieHint)).toHaveCount(2);
  await expect(row(page, VASYL)).toContainText(fill(t.was, { value: 'П0' }));
  await expect(footer(page)).toHaveText(fill(t.unsaved, { count: 1 }));
  await expect(
    page.getByText(fill(t.unsavedItem, { name: VASYL, from: 'П0', to: 'П1' })),
  ).toBeVisible();

  // Tied at П1, Vasyl sorts first by name, so his «Вище» is blocked and Taras moves up instead.
  await expect(up(page, VASYL)).toHaveAttribute('aria-disabled', 'true');
  await up(page, TARAS).click();
  await expect(names(page)).toHaveText([TARAS, VASYL]);
  await expect(field(page, TARAS)).toHaveValue('0');
  await expect(field(page, VASYL)).toHaveValue('1');
  await expect(page.getByText(t.tieHint)).toHaveCount(0);
  await expect(footer(page)).toHaveText(fill(t.unsaved, { count: 2 }));

  await down(page, TARAS).click();
  await expect(names(page)).toHaveText([VASYL, TARAS]);
  // The pressed «Нижче» became disabled (last prioritised), so focus moved to «Вище» of the same row.
  await expect(up(page, TARAS)).toBeFocused();
  await expect(
    page.getByRole('status').filter({
      hasText: fill(t.moved, {
        name: TARAS,
        priority: 1,
        position: 2,
        total: 2,
      }),
    }),
  ).toHaveCount(1);
  await expect(footer(page)).toHaveCount(0);
  await field(page, TARAS).focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(names(page)).toHaveText([TARAS, VASYL]);

  await field(page, TARAS).fill('');
  await field(page, TARAS).blur();
  await expect(names(page)).toHaveText([VASYL, TARAS]);
  await expect(
    page.getByText(
      fill(t.notSetGroupLine, {
        group: t.notSetGroup,
        hint: t.notSetGroupHint,
      }),
    ),
  ).toBeVisible();
  await expect(row(page, TARAS).getByText(t.notSet)).toBeVisible();
  await expect(down(page, TARAS)).toHaveAttribute('aria-disabled', 'true');

  await field(page, VASYL).fill('abc');
  await field(page, VASYL).blur();
  await expect(field(page, VASYL)).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText(t.invalid)).toBeVisible();
  await expect(save(page)).toBeDisabled();
  await field(page, VASYL).focus();
  await page.keyboard.press('Escape');
  await expect(field(page, VASYL)).toHaveValue('1');

  await page
    .getByRole('button', { name: messages.settings.common.cancel })
    .click();
  await expect(footer(page)).toHaveCount(0);
  await expect(field(page, TARAS)).toHaveValue('1');
});

test('saves a tie for real, confirms with a toast and keeps it after reload [STORY-ROLE-01-3, D73]', async ({
  page,
}) => {
  const { Гемблінг: gambling } = await verticals(page);
  try {
    await page.goto('/settings/priorities');
    await field(page, TARAS).fill('0');
    await field(page, TARAS).press('Enter');
    await save(page).click();
    await expect(
      page.getByText(fill(t.toastSaved, { vertical: 'Гемблінг' })),
    ).toBeVisible();
    await expect(footer(page)).toHaveCount(0);
    await page.reload();
    await expect(field(page, TARAS)).toHaveValue('0');
    await expect(page.getByText(t.tieHint)).toHaveCount(2);
  } finally {
    await restoreSeed(page, gambling!.id);
  }
});

test('409 keeps the drafts behind a warning until «Оновити»; 5xx offers a retry [wireframe P1.1 #13-14]', async ({
  page,
}) => {
  await page.goto('/settings/priorities');
  let status = 409;
  await page.route('**/api/v1/verticals/*/team-lead-priorities', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({
          status,
          contentType: 'application/problem+json',
          json: {
            type: 'about:blank',
            title: 'Conflict',
            status,
            code: status === 409 ? 'STALE_STATE' : 'INTERNAL',
          },
        })
      : route.fallback(),
  );
  await field(page, TARAS).fill('5');
  await field(page, TARAS).press('Enter');
  await save(page).click();
  const conflict = page.getByRole('alert').filter({ hasText: t.conflictTitle });
  await expect(conflict).toContainText(t.conflictBody);
  await expect(field(page, TARAS)).toHaveValue('5');
  await expect(save(page)).toBeDisabled();
  await conflict.getByRole('button', { name: t.conflictAction }).click();
  await expect(conflict).toHaveCount(0);
  await expect(field(page, TARAS)).toHaveValue('1');
  await expect(footer(page)).toHaveCount(0);

  status = 500;
  await field(page, TARAS).fill('5');
  await field(page, TARAS).press('Enter');
  await save(page).click();
  const failed = page
    .getByRole('alert')
    .filter({ hasText: messages.settings.common.saveFailed });
  await expect(failed).toBeVisible();
  await expect(field(page, TARAS)).toHaveValue('5');
  await expect(
    failed.getByRole('button', { name: messages.common.retry }),
  ).toBeEnabled();
});

test('unsaved drafts ask before a tab switch or an in-app link [wireframe P1.1 #16]', async ({
  page,
}) => {
  await page.goto('/settings/priorities');
  await field(page, TARAS).fill('7');
  await field(page, TARAS).press('Enter');
  await page.getByRole('tab', { name: 'Крипто' }).click();
  const dialog = page.getByRole('alertdialog', { name: t.leaveDialog.title });
  await expect(dialog).toContainText(
    fill(t.leaveDialog.body, { vertical: 'Гемблінг' }),
  );
  await dialog.getByRole('button', { name: t.leaveDialog.stay }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Гемблінг' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(field(page, TARAS)).toHaveValue('7');

  await page
    .getByRole('navigation', { name: nav.label })
    .getByRole('link', { name: nav.audit })
    .click();
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/settings\/priorities/);
  await dialog.getByRole('button', { name: t.leaveDialog.discard }).click();
  await expect(page).toHaveURL(/\/settings\/audit/);
});

test('same-document links keep drafts silently; «Не зберігати» on a link to this page drops them and re-arms the guard [wireframe P1.1 #16]', async ({
  page,
}) => {
  await page.goto('/settings/priorities');
  await field(page, TARAS).fill('7');
  await field(page, TARAS).press('Enter');
  const dialog = page.getByRole('alertdialog', { name: t.leaveDialog.title });

  await page.getByRole('link', { name: messages.shell.skipToContent }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(field(page, TARAS)).toHaveValue('7');
  await expect(footer(page)).toBeVisible();

  await page
    .getByRole('navigation', { name: nav.label })
    .getByRole('link', { name: nav.priorities })
    .click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: t.leaveDialog.discard }).click();
  await expect(dialog).toHaveCount(0);
  await expect(field(page, TARAS)).toHaveValue('1');
  await expect(footer(page)).toHaveCount(0);

  await field(page, TARAS).fill('8');
  await field(page, TARAS).press('Enter');
  await page.getByRole('tab', { name: 'Крипто' }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: t.leaveDialog.stay }).click();
  await expect(field(page, TARAS)).toHaveValue('8');
});

test('Save and Cancel move focus to the card heading once the footer is gone', async ({
  page,
}) => {
  await page.goto('/settings/priorities');
  const heading = page.getByRole('heading', {
    level: 2,
    name: fill(t.cardTitle.replace(/\{count, plural.*\}$/, '2 тімліди'), {
      vertical: 'Гемблінг',
    }),
  });
  await field(page, TARAS).fill('4');
  await field(page, TARAS).press('Enter');
  await page
    .getByRole('button', { name: messages.settings.common.cancel })
    .click();
  await expect(heading).toBeFocused();
  // The save answers with the current list, so the shared seed stays untouched.
  await page.route(
    '**/api/v1/verticals/*/team-lead-priorities',
    async (route) =>
      route.request().method() === 'PUT'
        ? route.fulfill({
            json: await (await page.request.get(route.request().url())).json(),
          })
        : route.fallback(),
  );
  await field(page, TARAS).fill('4');
  await field(page, TARAS).press('Enter');
  await save(page).click();
  await expect(heading).toBeFocused();
});

test('a vertical without Team Leads shows the empty state with a link to users [wireframe P1.4]', async ({
  page,
}) => {
  const { Крипто: crypto } = await verticals(page);
  await page.route(
    `**/api/v1/verticals/${crypto!.id}/team-lead-priorities`,
    (route) =>
      route.fulfill({
        json: {
          vertical: crypto,
          items: [],
          pendingInvites: 2,
        },
      }),
  );
  await page.goto('/settings/priorities');
  await page.getByRole('tab', { name: 'Крипто' }).click();
  await expect(
    page.getByText(fill(t.empty.noTeamLeadsTitle, { vertical: 'Крипто' })),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: t.empty.noTeamLeadsAction }),
  ).toHaveAttribute(
    'href',
    `/settings/users?role=TEAM_LEAD&vertical=${crypto!.id}`,
  );
  await expect(
    page.getByText('Ще 2 тімліди очікують прийняття запрошення', {
      exact: false,
    }),
  ).toBeVisible();
});

test('mobile: cards with 44 px controls, no horizontal scroll, footer above the bottom nav [wireframe P1.3]', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/settings/priorities');
  await expect(page.getByRole('columnheader')).toHaveCount(0);
  const box = await up(page, TARAS).boundingBox();
  expect(box && Math.round(box.width)).toBe(44);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await up(page, TARAS).click();
  await expect(footer(page)).toBeVisible();
  const saveBox = await save(page).boundingBox();
  const bar = await page
    .getByRole('navigation', { name: messages.shell.mobileNav })
    .boundingBox();
  expect(saveBox && bar && saveBox.y + saveBox.height <= bar.y).toBe(true);
});

/** Screenshot fixture: four Гемблінг Team Leads (a П1 tie and one without priority) so every list state is visible. */
const SHOT_ITEMS: Item[] = [
  {
    userId: '00000000-0000-4000-8000-000000000141',
    fullName: VASYL,
    priority: 0,
    version: 1,
  },
  {
    userId: '00000000-0000-4000-8000-000000000142',
    fullName: TARAS,
    priority: 1,
    version: 1,
  },
  {
    userId: '00000000-0000-4000-8000-000000000143',
    fullName: 'Марина Савчук',
    priority: 1,
    version: 1,
  },
  {
    userId: '00000000-0000-4000-8000-000000000144',
    fullName: 'Ігор Литвин',
    priority: null,
    version: null,
  },
];

async function capturePriorities(page: Page, testInfo: TestInfo, file: string) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const size = page.viewportSize()!;
  const height = await page.evaluate(
    () => document.documentElement.scrollHeight,
  );
  // Full-page capture keeps fixed/sticky bars at the first viewport, over the cards; a page-tall viewport shows them where they end up.
  await page.setViewportSize({
    width: size.width,
    height: Math.max(size.height, height),
  });
  const path = `screenshots/phase-1/${file}`;
  await page.screenshot({ path, animations: 'disabled', scale: 'css' });
  await page.setViewportSize(size);
  copyFileSync(path, `screenshots/latest/${file}`);
  await testInfo.attach(file, { path, contentType: 'image/png' });
}

test('captures the priorities list, unsaved changes, conflict and empty vertical [SHOT-01..03]', async ({
  browser,
  page: adminPage,
}, testInfo) => {
  const { Гемблінг: gambling, Крипто: crypto } = await verticals(adminPage);
  mkdirSync('screenshots/phase-1', { recursive: true });
  mkdirSync('screenshots/latest', { recursive: true });
  const viewports = {
    desktop: {
      ...devices['Desktop Chrome'],
      viewport: { width: 1440, height: 900 },
    },
    mobile: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
  };
  for (const [viewport, device] of Object.entries(viewports))
    for (const theme of ['light', 'dark'] as const) {
      const context = await browser.newContext({
        ...device,
        baseURL: E2E_ORIGIN,
        storageState: sessionFile('admin@demo'),
        reducedMotion: 'reduce',
      });
      try {
        await context.addCookies([
          { name: 'theme', value: theme, url: E2E_ORIGIN },
        ]);
        const page = await context.newPage();
        await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
        await page.route(
          `**/api/v1/verticals/${gambling!.id}/team-lead-priorities`,
          (route) =>
            route.request().method() === 'PUT'
              ? route.fulfill({
                  status: 409,
                  contentType: 'application/problem+json',
                  json: {
                    type: 'about:blank',
                    title: 'Conflict',
                    status: 409,
                    code: 'STALE_STATE',
                  },
                })
              : route.fulfill({
                  json: {
                    vertical: gambling,
                    items: SHOT_ITEMS,
                    pendingInvites: 1,
                  },
                }),
        );
        await page.route(
          `**/api/v1/verticals/${crypto!.id}/team-lead-priorities`,
          (route) =>
            route.fulfill({
              json: { vertical: crypto, items: [], pendingInvites: 0 },
            }),
        );
        const name = (state: string) =>
          `14-admin-priorities-${state}-${viewport}-${theme}.png`;

        await page.goto(`/settings/priorities?vertical=${crypto!.id}`);
        await page.getByRole('tab', { name: 'Гемблінг' }).click();
        await expect(page).toHaveURL(
          `/settings/priorities?vertical=${gambling!.id}`,
        );
        await expect(field(page, 'Ігор Литвин')).toHaveValue('');
        await expect(page.getByText(t.tieHint)).toHaveCount(2);
        await expect(
          page.getByText(
            fill(t.notSetGroupLine, {
              group: t.notSetGroup,
              hint: t.notSetGroupHint,
            }),
          ),
        ).toBeVisible();
        await expect(footer(page)).toHaveCount(0);
        await capturePriorities(page, testInfo, name('list'));

        await field(page, TARAS).fill('0');
        await field(page, TARAS).blur();
        await field(page, 'Ігор Литвин').fill('2');
        await field(page, 'Ігор Литвин').blur();
        await expect(footer(page)).toHaveText(fill(t.unsaved, { count: 2 }));
        await expect(page.getByText(t.tieHint)).toHaveCount(2);
        await expect(
          page.getByText(fill(t.was, { value: 'П1' }), { exact: true }),
        ).toBeVisible();
        await capturePriorities(page, testInfo, name('edited'));

        await save(page).click();
        const conflict = page
          .getByRole('alert')
          .filter({ hasText: t.conflictTitle });
        await expect(conflict).toContainText(t.conflictBody);
        await expect(save(page)).toBeDisabled();
        await capturePriorities(page, testInfo, name('conflict'));

        await page.goto(`/settings/priorities?vertical=${gambling!.id}`);
        await page.getByRole('tab', { name: 'Крипто' }).click();
        await expect(
          page.getByText(
            fill(t.empty.noTeamLeadsTitle, { vertical: 'Крипто' }),
          ),
        ).toBeVisible();
        await capturePriorities(page, testInfo, name('empty'));
      } finally {
        await context.close();
      }
    }
});

test('Head Recruiter gets the not-found page, no nav item and 404 from the API [VIS-02]', async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: E2E_ORIGIN,
    storageState: sessionFile('head.recruiter.gambling@demo'),
  });
  try {
    const page = await context.newPage();
    await page.goto('/settings/priorities');
    await expect(
      page.getByRole('heading', { name: messages.errors.notFoundTitle }),
    ).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    for (const path of [
      '/api/v1/settings/priorities/verticals',
      '/api/v1/verticals/00000000-0000-4000-8000-000000000001/team-lead-priorities',
    ])
      expect((await page.request.get(path)).status()).toBe(404);
  } finally {
    await context.close();
  }
});
