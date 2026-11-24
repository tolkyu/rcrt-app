import {
  expect,
  type APIRequestContext,
  type Page,
  type Route,
  type TestInfo,
} from '@playwright/test';
import type { RichTextDoc } from '../../lib/schemas/rich-text';
import messages from '../../messages/uk.json' with { type: 'json' };
import { sessionFile, type E2EUser } from '../support/e2e-session';
import { openHydrated } from '../support/hydration';
import { problemFulfill } from '../support/problem';
import { withOwner } from '../support/vacancy-request-db';
import {
  captureScreen,
  forEachTheme,
  installFixedClock,
  viewportOf,
} from './screens';
import { scanState } from './support/vacancy-gallery';
import { apiAs } from './support/vacancy-team';
import {
  changeContent,
  contentPath,
  contentUrl,
  editor,
  editorRuntimePath,
  fieldSection,
  replaceText,
  saveContent,
  saved,
  setContentStatus,
  tc,
  test,
  textDoc,
  tr,
  type ContentFixture,
} from './support/vacancy-content';

const TITLE = 'Медіабаєр — Facebook';
const LONG_TITLE =
  'Старший медіабаєр Facebook, Google і TikTok Ads для міжнародної команди Надзвичайновідповідальнийкерівникнапрямумедіазакупівель';
const NUMBER = 'V-0510';
const HEAD = 'head.recruiter.gambling@demo';
const INTRO = 'Шукаємо медіабаєра для запуску кампаній у Facebook.';
const EDITED = 'Шукаємо медіабаєра для міжнародної команди.';
const DESCRIPTION: RichTextDoc = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Про роль' }],
    },
    { type: 'paragraph', content: [{ type: 'text', text: INTRO }] },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Детальніше про команду',
          marks: [
            { type: 'link', attrs: { href: 'https://example.com/careers' } },
          ],
        },
      ],
    },
    {
      type: 'bulletList',
      content: ['Планування бюджету', 'Аналіз результатів кампаній'].map(
        (text) => ({
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
        }),
      ),
    },
  ],
};
const REQUIREMENTS = textDoc('Досвід роботи з Facebook Ads від двох років.');

type Stage = {
  page: Page;
  vacancy: ContentFixture;
  head: APIRequestContext;
};
type Scenario = (stage: Stage) => Promise<void>;

const reset = (
  vacancy: ContentFixture,
  description: RichTextDoc | null = DESCRIPTION,
  requirements: RichTextDoc | null = REQUIREMENTS,
) =>
  withOwner(
    (sql) => sql`
      update app.vacancy
      set description_doc = ${description ? sql.json(description) : null},
        requirements_doc = ${requirements ? sql.json(requirements) : null},
        status = 'OPEN', cancelled_at = null, closed_at = null
      where id = ${vacancy.id} and title = ${vacancy.title} and status <> 'CANCELLED'`,
  );

const contentRead = (page: Page, id: string) =>
  page.waitForResponse(
    (answer) =>
      answer.request().method() === 'GET' && contentUrl(id).test(answer.url()),
  );

const stubContent = (
  page: Page,
  id: string,
  method: 'GET' | 'PATCH',
  answer: (route: Route) => Promise<void>,
) =>
  page.route(contentUrl(id), (route) =>
    route.request().method() === method ? answer(route) : route.fallback(),
  );

async function openCard(page: Page, id: string) {
  const read = contentRead(page, id);
  await openHydrated(page, `/vacancies/${id}`);
  await read;
}

async function openEditor(page: Page, vacancy: ContentFixture) {
  await openHydrated(page, contentPath(vacancy.id));
  await expect(editor(page, 'description')).toHaveAttribute(
    'contenteditable',
    'true',
  );
  await expect(editor(page, 'requirements')).toHaveAttribute(
    'contenteditable',
    'true',
  );
  await expect(editor(page, 'description')).toContainText(INTRO);
}

async function openDirty(page: Page, vacancy: ContentFixture) {
  await openEditor(page, vacancy);
  await replaceText(editor(page, 'description'), EDITED);
}

const alertWith = (page: Page, text: string) =>
  expect(page.getByRole('alert').filter({ hasText: text })).toBeVisible();

const editLink = (page: Page) =>
  page.getByRole('link', {
    name: messages.vacancies.contentCard.editAction,
    exact: true,
  });

/** CANCELLED is terminal in the database, so the second theme reuses the row the first one closed. */
const cancelledOnce = new Set<string>();

const card = {
  editable: async ({ page, vacancy }) => {
    await openCard(page, vacancy.id);
    await expect(page.getByText(INTRO)).toBeVisible();
    await expect(editLink(page)).toBeVisible();
  },
  readonly: async ({ page, vacancy }) => {
    await openCard(page, vacancy.id);
    await expect(page.getByText(INTRO)).toBeVisible();
    await expect(editLink(page)).toHaveCount(0);
  },
  empty: async ({ page, vacancy }) => {
    await reset(vacancy, null, null);
    await openCard(page, vacancy.id);
    await expect(page.getByText(tc.emptyDescription)).toBeVisible();
    await expect(page.getByText(tc.emptyRequirements)).toBeVisible();
  },
  loading: async ({ page, vacancy }) => {
    await stubContent(page, vacancy.id, 'GET', () => new Promise(() => {}));
    await openHydrated(page, `/vacancies/${vacancy.id}`);
    await expect(
      page
        .locator('section[aria-labelledby="vacancy-content-detail"]')
        .getByRole('status'),
    ).toBeAttached();
  },
  error: async ({ page, vacancy }) => {
    await stubContent(page, vacancy.id, 'GET', async (route) =>
      route.fulfill(await problemFulfill(500, 'INTERNAL')),
    );
    await openHydrated(page, `/vacancies/${vacancy.id}`);
    await expect(
      page
        .locator('section[aria-labelledby="vacancy-content-detail"]')
        .getByRole('button', { name: messages.common.retry }),
    ).toBeEnabled({ timeout: 30_000 });
  },
  filled: async ({ page, vacancy }) => {
    await setContentStatus(vacancy, 'FILLED');
    await openCard(page, vacancy.id);
    await expect(page.getByText(INTRO)).toBeVisible();
    await expect(editLink(page)).toHaveCount(0);
  },
} satisfies Record<string, Scenario>;

const edit = {
  loaded: ({ page, vacancy }) => openEditor(page, vacancy),
  loading: async ({ page, vacancy }) => {
    await stubContent(page, vacancy.id, 'GET', () => new Promise(() => {}));
    await page.goto(contentPath(vacancy.id));
    await expect(
      page.locator('[data-slot="form-skeleton"]').filter({ visible: true }),
    ).toHaveCount(1);
    await expect(page.locator('[contenteditable]')).toHaveCount(0);
  },
  cleared: async ({ page, vacancy }) => {
    await openEditor(page, vacancy);
    await fieldSection(page, 'description')
      .getByRole('button', { name: tc.clear, exact: true })
      .click();
    await expect(page.getByText(tc.cleared)).toBeVisible();
  },
  saving: async ({ page, vacancy }) => {
    await openDirty(page, vacancy);
    await stubContent(page, vacancy.id, 'PATCH', () => new Promise(() => {}));
    await saveContent(page).click();
    await expect(
      page.getByRole('button', { name: tc.saving, exact: true }),
    ).toBeVisible();
  },
  saved: async ({ page, vacancy }) => {
    await openDirty(page, vacancy);
    await saveContent(page).click();
    await expect(saved(page)).toBeVisible();
  },
  validation: async ({ page, vacancy }) => {
    await openDirty(page, vacancy);
    await stubContent(page, vacancy.id, 'PATCH', async (route) =>
      route.fulfill(
        await problemFulfill(400, 'VALIDATION_FAILED', [
          { path: 'body.descriptionDoc', code: 'too_large' },
        ]),
      ),
    );
    await saveContent(page).click();
    await expect(page.getByText(tc.errors.too_large)).toBeVisible();
  },
  stale: async (stage) => {
    await staleEdit(stage);
  },
  'stale-dialog': async (stage) => {
    await staleEdit(stage);
    await stage.page
      .getByRole('button', { name: tc.reload, exact: true })
      .click();
    await expect(
      stage.page.getByRole('alertdialog', { name: tc.reloadTitle }),
    ).toBeVisible();
  },
  'closed-while-editing': async ({ page, vacancy }) => {
    await openDirty(page, vacancy);
    await setContentStatus(vacancy, 'FILLED');
    await saveContent(page).click();
    await alertWith(page, tc.filled);
  },
  'permission-retained': async ({ page, vacancy }) => {
    await openDirty(page, vacancy);
    await stubContent(page, vacancy.id, 'PATCH', async (route) =>
      route.fulfill(await problemFulfill(403, 'FORBIDDEN')),
    );
    await saveContent(page).click();
    await alertWith(page, tc.permissionLost);
    await expect(editor(page, 'description')).toHaveAttribute(
      'contenteditable',
      'true',
    );
  },
  'permission-lost': async ({ page, vacancy }) => {
    await openDirty(page, vacancy);
    let writes = 0;
    await page.route(contentUrl(vacancy.id), async (route) => {
      if (route.request().method() === 'PATCH') {
        writes += 1;
        return route.fulfill(await problemFulfill(403, 'FORBIDDEN'));
      }
      const response = await route.fetch();
      await route.fulfill({
        response,
        json: { ...(await response.json()), canEditContent: false },
      });
    });
    await saveContent(page).click();
    await alertWith(page, tc.permissionLost);
    for (const field of ['description', 'requirements'] as const)
      await expect(editor(page, field)).toHaveAttribute(
        'contenteditable',
        'false',
      );
    await expect(saveContent(page)).toHaveAttribute('aria-disabled', 'true');
    await saveContent(page).click({ force: true });
    await editor(page, 'description').press('ControlOrMeta+Enter');
    expect(writes).toBe(1);
  },
  'save-failed': async ({ page, vacancy }) => {
    await openDirty(page, vacancy);
    await stubContent(page, vacancy.id, 'PATCH', async (route) =>
      route.fulfill(await problemFulfill(500, 'INTERNAL')),
    );
    await saveContent(page).click();
    await alertWith(page, tc.feedback.server);
  },
  'chunk-failed': async ({ page, vacancy }) => {
    const runtime = await editorRuntimePath();
    await page.route(
      (url) => url.pathname === runtime,
      (route) => route.abort('failed'),
    );
    await openHydrated(page, contentPath(vacancy.id));
    await expect(
      page.getByRole('alert').filter({ hasText: tr.loadFailed }),
    ).toHaveCount(2);
    await expect(saveContent(page)).toHaveAttribute('aria-disabled', 'true');
  },
  'leave-guard': async ({ page, vacancy }) => {
    await openDirty(page, vacancy);
    await page.getByRole('link', { name: tc.cancel, exact: true }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
  },
  readonly: async ({ page, vacancy }) => {
    await page.goto(contentPath(vacancy.id));
    await alertWith(page, tc.noPermission);
    await expect(page.getByText(INTRO)).toBeVisible();
    await expect(page.locator('[contenteditable]')).toHaveCount(0);
  },
  filled: async ({ page, vacancy }) => {
    await setContentStatus(vacancy, 'FILLED');
    await page.goto(contentPath(vacancy.id));
    await alertWith(page, tc.filled);
    await expect(page.locator('[contenteditable]')).toHaveCount(0);
  },
  cancelled: async ({ page, vacancy }) => {
    if (!cancelledOnce.has(vacancy.id)) {
      cancelledOnce.add(vacancy.id);
      await setContentStatus(vacancy, 'CANCELLED');
    }
    await page.goto(contentPath(vacancy.id));
    await alertWith(page, tc.cancelled);
    await expect(page.locator('[contenteditable]')).toHaveCount(0);
  },
  unavailable: async ({ page, vacancy }) => {
    await stubContent(page, vacancy.id, 'GET', async (route) =>
      route.fulfill(await problemFulfill(404, 'NOT_FOUND')),
    );
    await page.goto(contentPath(vacancy.id));
    await expect(
      page.getByText(tc.unavailableTitle, { exact: true }),
    ).toBeVisible();
    await expect(page.locator('[contenteditable]')).toHaveCount(0);
  },
  'read-error': async ({ page, vacancy }) => {
    await stubContent(page, vacancy.id, 'GET', async (route) =>
      route.fulfill(await problemFulfill(500, 'INTERNAL')),
    );
    await openHydrated(page, contentPath(vacancy.id));
    await expect(
      page.getByRole('button', { name: messages.common.retry }),
    ).toBeVisible();
    await expect(page.locator('[contenteditable]')).toHaveCount(0);
  },
} satisfies Record<string, Scenario>;

/** A real competing save by the Head Recruiter makes the recruiter's next PATCH a real 409. */
async function staleEdit({ page, vacancy, head }: Stage) {
  await openDirty(page, vacancy);
  await changeContent(head, vacancy.id, {
    requirementsDoc: textDoc('Досвід роботи з Facebook Ads від трьох років.'),
  });
  await saveContent(page).click();
  await alertWith(page, tc.stale);
}

const ROLES: readonly {
  user: E2EUser;
  role: string;
  card: readonly (keyof typeof card)[];
  edit: readonly (keyof typeof edit)[];
}[] = [
  {
    user: 'recruiter1.gambling@demo',
    role: 'recruiter',
    card: ['editable', 'empty', 'loading', 'error', 'filled'],
    edit: [
      'loaded',
      'loading',
      'cleared',
      'saving',
      'saved',
      'validation',
      'stale',
      'stale-dialog',
      'closed-while-editing',
      'permission-lost',
      'permission-retained',
      'save-failed',
      'chunk-failed',
      'leave-guard',
      'filled',
      'cancelled',
      'unavailable',
      'read-error',
    ],
  },
  {
    user: 'vasyl.tl@demo',
    role: 'team-lead',
    card: ['editable'],
    edit: ['loaded'],
  },
  { user: HEAD, role: 'head-recruiter', card: ['editable'], edit: ['loaded'] },
  { user: 'admin@demo', role: 'admin', card: ['editable'], edit: ['loaded'] },
  { user: 'hr@demo', role: 'hr', card: ['readonly'], edit: ['readonly'] },
];

async function capture(
  { page, vacancy, head }: Stage,
  info: TestInfo,
  scenario: Scenario,
  file: string,
  title = TITLE,
) {
  test.setTimeout(120_000);
  page.on('dialog', (dialog) => dialog.accept());
  await installFixedClock(page, [
    [vacancy.title, title],
    [vacancy.number, NUMBER],
  ]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await forEachTheme(page, async (theme) => {
    await reset(vacancy);
    await scenario({ page, vacancy, head });
    await scanState(page, info);
    await captureScreen(
      page,
      info,
      `${file}-${viewportOf(info)}-${theme}.png`,
      'phase-2',
    );
    await page.unroute(contentUrl(vacancy.id));
  });
}

for (const { user, role, card: cardStates, edit: editStates } of ROLES)
  test.describe(`content captures ${role} [VAC-08, SHOT-01..03, D125]`, () => {
    test.use({ storageState: sessionFile(user) });

    const shots = [
      ...cardStates.map((state) => ({
        scenario: card[state] as Scenario,
        file: `51-${role}-vacancy-content-card-${state}`,
      })),
      ...editStates.map((state) => ({
        scenario: edit[state] as Scenario,
        file: `52-${role}-vacancy-content-edit-${state}`,
      })),
    ];
    for (const { scenario, file } of shots)
      test(`captures ${file}`, async ({ page, vacancy, playwright }, info) => {
        const head = await apiAs(playwright, HEAD);
        try {
          await capture({ page, vacancy, head }, info, scenario, file);
        } finally {
          await head.dispose();
        }
      });
  });

test.describe('content captures open More menu on a phone [VAC-08, SHOT-01..03, D125]', () => {
  test.use({ storageState: sessionFile('recruiter1.gambling@demo') });

  const moreOpen: Scenario = async ({ page, vacancy }) => {
    await openEditor(page, vacancy);
    const more = fieldSection(page, 'description').getByRole('button', {
      name: tr.more,
      exact: true,
    });
    await more.tap();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await expect(
      fieldSection(page, 'description').getByRole('button', {
        name: tr.heading1,
        exact: true,
      }),
    ).toBeVisible();
  };

  test('captures 52-recruiter-vacancy-content-edit-more-open', async ({
    page,
    vacancy,
    playwright,
    isMobile,
  }, info) => {
    test.skip(!isMobile, 'the More menu exists only on a phone');
    const head = await apiAs(playwright, HEAD);
    try {
      await capture(
        { page, vacancy, head },
        info,
        moreOpen,
        '52-recruiter-vacancy-content-edit-more-open',
      );
    } finally {
      await head.dispose();
    }
  });
});

test.describe('content captures long title at 390 px [VAC-08, SHOT-01..03, D125]', () => {
  test.use({ storageState: sessionFile('recruiter1.gambling@demo') });

  for (const { scenario, file } of [
    {
      scenario: card.editable as Scenario,
      file: '51-recruiter-vacancy-content-card-long-title',
    },
    {
      scenario: edit.loaded as Scenario,
      file: '52-recruiter-vacancy-content-edit-long-title',
    },
  ])
    test(`captures ${file}`, async ({
      page,
      vacancy,
      playwright,
      isMobile,
    }, info) => {
      test.skip(!isMobile, 'the long title is a phone layout case');
      const head = await apiAs(playwright, HEAD);
      try {
        await capture(
          { page, vacancy, head },
          info,
          scenario,
          file,
          LONG_TITLE,
        );
      } finally {
        await head.dispose();
      }
    });
});
