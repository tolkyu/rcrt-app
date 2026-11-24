import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { DEMO_VERTICALS } from '../../server/db/seed';
import type { VacancyDetail } from '../../lib/schemas/vacancy';
import messages from '../../messages/uk.json' with { type: 'json' };
import { checkAccessibility } from '../support/accessibility';
import { E2E_ORIGIN, sessionFile } from '../support/e2e-session';
import { openHydrated } from '../support/hydration';
import { DRAFT_VACANCY, demoVacancy } from '../support/vacancy-demo';
import {
  IDEMPOTENCY_KEY,
  sweepDrafts,
  t as tForm,
} from './support/vacancy-create';
import {
  createOwnDraft,
  delayEditNavigation,
  editPrefetched,
  draftCount,
  draftCountOffset,
  draftListPath,
  menuButton,
  menuItem,
  removeStubs,
  rowLink,
  stubPublish,
  ta,
  visibleTitles,
} from './support/vacancy-draft-actions';
import { detailUrl, editPath, te, toastWith } from './support/vacancy-edit';

const AUTHOR = 'recruiter2.gambling@demo';
const v = messages.vacancies;
const REASON = v.draftErrors.positionRequired;

test.describe('draft actions in the list, preview and card [STORY-VAC-01-1, VAC-01, D92, D98]', () => {
  test.use({ storageState: sessionFile(AUTHOR) });
  test.describe.configure({ mode: 'serial' });
  // No real API write: drafts are seeded and swept in the database, every publish is stubbed (an open vacancy cannot be deleted).
  let api: APIRequestContext;
  let second: VacancyDetail;
  let bare: VacancyDetail;

  test.beforeAll(async ({ playwright }) => {
    api = await playwright.request.newContext({
      baseURL: E2E_ORIGIN,
      storageState: sessionFile(AUTHOR),
    });
    second = await createOwnDraft(api, 'B', true);
    bare = await createOwnDraft(api, 'N', false);
  });
  test.afterEach(({ page }) => removeStubs(page));
  test.afterAll(async () => {
    await sweepDrafts(api);
    await api.dispose();
  });

  /** The row after `title` in the list's order, else the one before it: the spec's rule for where selection and focus go. */
  const neighbour = (titles: string[], title: string) => {
    const at = titles.indexOf(title);
    return titles[at + 1] ?? titles[at - 1]!;
  };

  test('the menu of a draft row offers edit, publish, then cancel and delete (destructive, after a separator), and passes axe [ux §6.1]', async ({
    page,
    isMobile,
  }, testInfo) => {
    await openHydrated(page, draftListPath());
    const trigger = menuButton(page, second.title);
    await expect(trigger).toBeVisible();
    if (isMobile) {
      const box = (await trigger.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    // The audit needs the preview's actions loaded: a scrollable region without focusable content fails it.
    if (!isMobile)
      await expect(
        page
          .getByRole('complementary', { name: v.previewLabel })
          .getByRole('button', { name: ta.publish, exact: true }),
      ).toBeVisible();
    await checkAccessibility(page, testInfo);
    await trigger.click();
    await expect(page.getByRole('menuitem')).toHaveText([
      ta.edit,
      ta.publish,
      ta.cancel,
      ta.delete,
    ]);
    await expect(menuItem(page, ta.edit)).toBeEnabled();
    await expect(menuItem(page, ta.publish)).toBeEnabled();
    await expect(page.getByRole('separator')).toHaveCount(1);
    // The open modal menu hides the whole app root from assistive tech, so (as in the dev-ui gallery) the audit covers the menu and the list, not the hidden shell.
    const audit = await new AxeBuilder({ page })
      .include('[role="menu"]')
      .include('main')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      audit.violations.filter(({ impact }) =>
        ['serious', 'critical'].includes(impact ?? ''),
      ),
    ).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  });

  test('«Редагувати» in the menu opens the edit page with the saved draft', async ({
    page,
  }) => {
    await openHydrated(page, draftListPath());
    await menuButton(page, second.title).click();
    await menuItem(page, ta.edit).click();
    await expect(page).toHaveURL(new RegExp(`/vacancies/${second.id}/edit$`));
    await expect(
      page.getByRole('textbox', {
        name: new RegExp(`^${tForm.titleField.label}`),
      }),
    ).toHaveValue(second.title);
  });

  for (const surface of ['card', 'preview'] as const) {
    test(`the ${surface} link «Редагувати» shows the edit page's loading heading, then the form [BUG-S3-6]`, async ({
      page,
      isMobile,
    }) => {
      test.skip(
        surface === 'preview' && isMobile,
        'the preview panel starts at 1280 px',
      );
      const prefetched = editPrefetched(page, second.id);
      await openHydrated(
        page,
        surface === 'card'
          ? `/vacancies/${second.id}`
          : draftListPath(second.id),
      );
      await prefetched;
      await delayEditNavigation(page, 1500);
      const scope =
        surface === 'card'
          ? page
          : page.getByRole('complementary', { name: v.previewLabel });
      await scope.getByRole('link', { name: ta.edit, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/vacancies/${second.id}/edit$`));
      await expect(
        page.getByRole('heading', { level: 1, name: te.title, exact: true }),
      ).toBeVisible();
      const titleField = page.getByRole('textbox', {
        name: new RegExp(`^${tForm.titleField.label}`),
      });
      await expect(titleField).toHaveCount(0);
      await expect(titleField).toHaveValue(second.title, { timeout: 15_000 });
    });
  }

  test('publish from the row: the row and the count leave at once, focus goes to the next row, one request with the version and a key; the toast opens the card [ux §6.4]', async ({
    page,
  }) => {
    const stub = await stubPublish(page, api, second.id);
    await openHydrated(page, draftListPath());
    const titles = await visibleTitles(page);
    const next = neighbour(titles, second.title);
    const before = await draftCount(page);
    await menuButton(page, second.title).click();
    await menuItem(page, ta.publish).click();

    await expect(rowLink(page, second.title)).toHaveCount(0);
    await expect(rowLink(page, next)).toBeFocused();
    expect(await draftCount(page)).toBe(before - 1);
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]!.body).toEqual({ expectedVersion: second.version });
    expect(stub.requests[0]!.key).toMatch(IDEMPOTENCY_KEY);

    stub.release();
    const done = toastWith(page, ta.toast.published);
    await expect(done).toContainText(`${second.number} · ${second.title}`);
    await done.getByRole('button', { name: ta.toast.open }).click();
    await expect(page).toHaveURL(new RegExp(`/vacancies/${second.id}$`));
    expect(stub.requests).toHaveLength(1);
  });

  test('a refusal puts the row, the count and the focus back and offers «Редагувати» [409 STALE_STATE]', async ({
    page,
  }) => {
    const stub = await stubPublish(page, api, second.id, {
      status: 409,
      code: 'STALE_STATE',
    });
    await openHydrated(page, draftListPath());
    const before = await draftCount(page);
    await menuButton(page, second.title).click();
    await menuItem(page, ta.publish).click();
    await expect(rowLink(page, second.title)).toHaveCount(0);
    expect(await draftCount(page)).toBe(before - 1);

    stub.release();
    await expect(rowLink(page, second.title)).toBeVisible();
    await expect(rowLink(page, second.title)).toBeFocused();
    await draftCountOffset(page, api).toBe(0);
    const warning = toastWith(page, ta.toast.stale);
    await expect(warning).toContainText(ta.toast.staleDescription);
    await warning.getByRole('button', { name: ta.edit, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/vacancies/${second.id}/edit$`));
  });

  test('a position that was deactivated: rollback and an error toast whose button opens the edit page [POSITION_INACTIVE]', async ({
    page,
  }) => {
    const stub = await stubPublish(
      page,
      api,
      second.id,
      { status: 409, code: 'POSITION_INACTIVE' },
      { gated: false },
    );
    await openHydrated(page, draftListPath());
    await menuButton(page, second.title).click();
    await menuItem(page, ta.publish).click();
    const refusal = toastWith(page, ta.toast.failed);
    await expect(refusal).toContainText(ta.toast.refusedDescription);
    await expect(rowLink(page, second.title)).toBeVisible();
    expect(stub.requests).toHaveLength(1);
    await refusal.getByRole('button', { name: ta.edit, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/vacancies/${second.id}/edit$`));
  });

  test('a lost answer: the toast button repeats this publish under the same key and it succeeds [network failure]', async ({
    page,
  }) => {
    const stub = await stubPublish(page, api, second.id, 'abort', {
      gated: false,
    });
    await openHydrated(page, draftListPath());
    await menuButton(page, second.title).click();
    await menuItem(page, ta.publish).click();
    const lost = toastWith(page, ta.toast.noConnection);
    await expect(lost).toBeVisible();
    await expect(rowLink(page, second.title)).toBeVisible();
    await lost.getByRole('button', { name: ta.toast.retry }).click();
    await expect(toastWith(page, ta.toast.published)).toBeVisible();
    expect(stub.requests).toHaveLength(2);
    expect(stub.requests[1]!.key).toBe(stub.requests[0]!.key);
    expect(stub.requests[1]!.body).toEqual(stub.requests[0]!.body);
  });

  test('a draft without a position: the menu item is disabled and explains why, and nothing is sent [ux §6.2]', async ({
    page,
  }) => {
    const sent: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/publish')) sent.push(request.url());
    });
    await openHydrated(page, draftListPath());
    await menuButton(page, bare.title).click();
    const item = menuItem(page, ta.publish);
    await expect(item).toHaveAttribute('aria-disabled', 'true');
    await expect(item).toContainText(REASON);
    await item.click({ force: true });
    await expect(page.getByRole('menu')).toBeVisible();
    expect(sent).toEqual([]);
  });

  test('the card of a draft: «Опублікувати» and «Редагувати»; without a position the button is disabled with its reason', async ({
    page,
    isMobile,
  }, testInfo) => {
    const sent: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/publish')) sent.push(request.url());
    });
    await openHydrated(page, `/vacancies/${bare.id}`);
    const publish = page.getByRole('button', { name: ta.publish, exact: true });
    await expect(publish).toHaveAttribute('aria-disabled', 'true');
    await expect(publish).toHaveAccessibleDescription(REASON);
    if (isMobile)
      await expect(page.getByText(REASON, { exact: true })).toBeVisible();
    // aria-disabled counts as not actionable, so the press is forced: it must still do nothing.
    await publish.click({ force: true });
    await expect(
      page.getByRole('link', { name: ta.edit, exact: true }),
    ).toHaveAttribute('href', `/vacancies/${bare.id}/edit`);
    await checkAccessibility(page, testInfo);
    expect(sent).toEqual([]);
  });

  test('publish from the card: the status turns «Відкрита», the actions go, focus stays in the header, one request [ux §6.2]', async ({
    page,
  }) => {
    const stub = await stubPublish(page, api, second.id);
    await openHydrated(page, `/vacancies/${second.id}`);
    const publish = page.getByRole('button', { name: ta.publish, exact: true });
    await publish.dblclick();
    await expect(publish).toHaveCount(0);
    await expect(page.getByText(v.status.OPEN, { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: v.share, exact: true }),
    ).toBeFocused();
    expect(stub.requests).toHaveLength(1);
    stub.release();
    await expect(toastWith(page, ta.toast.published)).toBeVisible();
    expect(stub.requests).toHaveLength(1);
  });

  test('a refused publish on the card brings the actions back', async ({
    page,
  }) => {
    const stub = await stubPublish(page, api, second.id, {
      status: 409,
      code: 'POSITION_INACTIVE',
    });
    await openHydrated(page, `/vacancies/${second.id}`);
    await page.getByRole('button', { name: ta.publish, exact: true }).click();
    await expect(
      page.getByRole('button', { name: ta.publish, exact: true }),
    ).toHaveCount(0);
    stub.release();
    await expect(toastWith(page, ta.toast.failed)).toBeVisible();
    const back = page.getByRole('button', { name: ta.publish, exact: true });
    await expect(back).toBeVisible();
    await expect(back).toBeFocused();
    await expect(page.getByText(v.status.DRAFT, { exact: true })).toBeVisible();
    await expect(
      page.getByText(v.draft.privateNote, { exact: true }),
    ).toBeVisible();
  });

  test('a draft card says it is private and has no «Поділитися»; an open one has it [ux §6.2 2a, 2b, BUG-S3-7]', async ({
    page,
  }) => {
    await openHydrated(page, `/vacancies/${second.id}`);
    await expect(
      page.getByText(v.draft.privateNote, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: v.share, exact: true }),
    ).toHaveCount(0);
    await openHydrated(page, `/vacancies/${demoVacancy(1).id}`);
    await expect(
      page.getByRole('button', { name: v.share, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(v.draft.privateNote, { exact: true }),
    ).toHaveCount(0);
  });

  test('on a phone the card puts «Опублікувати» on a full row, «Редагувати» and `⋯` (44 px) on the next [ux §6.2 2d]', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'a phone layout');
    await openHydrated(page, `/vacancies/${second.id}`);
    const row = (await page
      .locator('[data-slot="detail-header-actions"]')
      .boundingBox())!;
    const publish = (await page
      .getByRole('button', { name: ta.publish, exact: true })
      .boundingBox())!;
    const edit = (await page
      .getByRole('link', { name: ta.edit, exact: true })
      .boundingBox())!;
    const more = (await page
      .getByRole('button', {
        name: ta.menuLabel.replace('{title}', second.title),
      })
      .boundingBox())!;
    expect(publish.width).toBeGreaterThanOrEqual(row.width - 1);
    expect(publish.height).toBeGreaterThanOrEqual(44);
    expect(edit.y).toBeGreaterThanOrEqual(publish.y + publish.height);
    expect(more.width).toBeGreaterThanOrEqual(44);
    expect(more.height).toBeGreaterThanOrEqual(44);
    expect(more.y).toBeGreaterThanOrEqual(publish.y + publish.height);
    expect(more.x).toBeGreaterThanOrEqual(edit.x + edit.width);
    expect(edit.width + more.width).toBeGreaterThanOrEqual(row.width - 16);
  });

  test('worst case on a 320 px phone: a draft without a position keeps the reason, the button and «Редагувати» apart [break-ui]', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'a phone layout');
    await page.setViewportSize({ width: 320, height: 800 });
    await openHydrated(page, `/vacancies/${bare.id}`);
    const publish = (await page
      .getByRole('button', { name: ta.publish, exact: true })
      .boundingBox())!;
    const reason = page.getByText(REASON, { exact: true });
    await expect(reason).toBeVisible();
    const hint = (await reason.boundingBox())!;
    const edit = (await page
      .getByRole('link', { name: ta.edit, exact: true })
      .boundingBox())!;
    expect(hint.y).toBeGreaterThanOrEqual(publish.y + publish.height - 1);
    expect(edit.y).toBeGreaterThanOrEqual(hint.y + hint.height - 1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });

  test('a chunk that cannot load stops the publish before the server is called, and the toast button tries again [lazy chunk]', async ({
    page,
  }) => {
    const stub = await stubPublish(page, api, second.id, 'ok', {
      gated: false,
    });
    let blocked = true;
    await page.route('**/_next/static/chunks/**', async (route) => {
      const response = await route.fetch();
      if (blocked && (await response.text()).includes('stale:vacancy:'))
        return route.abort('failed');
      return route.fulfill({ response });
    });
    await openHydrated(page, draftListPath());
    await menuButton(page, second.title).click();
    await menuItem(page, ta.publish).click();
    const failed = toastWith(page, ta.toast.noConnection);
    await expect(failed).toBeVisible();
    await expect(rowLink(page, second.title)).toBeVisible();
    expect(stub.requests).toHaveLength(0);
    blocked = false;
    await failed.getByRole('button', { name: ta.toast.retry }).click();
    await expect(toastWith(page, ta.toast.published)).toBeVisible();
    expect(stub.requests).toHaveLength(1);
  });

  test('worst case: a 200-character urgent title is clamped in the preview and the actions stay inside it [break-ui]', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'the preview panel starts at 1280 px');
    const long = 'Ш'.repeat(200);
    await page.route(detailUrl(second.id), async (route) => {
      const response = await route.fetch();
      if (route.request().method() !== 'GET' || !response.ok())
        return route.fulfill({ response });
      const body = (await response.json()) as Record<string, unknown>;
      return route.fulfill({
        response,
        json: { ...body, title: long, priority: 'URGENT' },
      });
    });
    // The server ships the first row's card with the page; another row is read on the client, where the route can answer.
    await openHydrated(page, draftListPath());
    await page
      .getByRole('button', {
        name: v.previewSelect.replace('{title}', second.title),
      })
      .click();
    const preview = page.getByRole('complementary', { name: v.previewLabel });
    const heading = preview.getByRole('heading', { level: 2, name: long });
    await expect(heading).toBeVisible();
    await expect(heading).toHaveAttribute('title', long);
    const lines = await heading.evaluate(
      (node) =>
        node.getBoundingClientRect().height /
        parseFloat(getComputedStyle(node).lineHeight),
    );
    expect(lines).toBeLessThanOrEqual(3.05);
    await expect(preview.getByText(v.urgent, { exact: true })).toBeVisible();
    await expect(
      preview.getByRole('button', { name: ta.publish, exact: true }),
    ).toBeVisible();
    expect(
      await preview.evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
  });

  test('wide screens: publish from the preview moves the selection and the focus to the next row', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'the preview panel starts at 1280 px');
    const stub = await stubPublish(page, api, second.id);
    await openHydrated(page, draftListPath(second.id));
    const titles = await visibleTitles(page);
    const next = neighbour(titles, second.title);
    const preview = page.getByRole('complementary', { name: v.previewLabel });
    await expect(
      preview.getByRole('heading', { level: 2, name: second.title }),
    ).toBeVisible();
    await expect(
      preview.getByRole('link', { name: ta.edit, exact: true }),
    ).toHaveAttribute('href', `/vacancies/${second.id}/edit`);
    await preview
      .getByRole('button', { name: ta.publish, exact: true })
      .click();

    await expect(rowLink(page, second.title)).toHaveCount(0);
    await expect(rowLink(page, next)).toBeFocused();
    await expect(page).not.toHaveURL(new RegExp(`vacancy=${second.id}`));
    await expect(
      preview.getByRole('heading', { level: 2, name: next }),
    ).toBeVisible();
    stub.release();
    await expect(toastWith(page, ta.toast.published)).toBeVisible();
    expect(stub.requests).toHaveLength(1);
  });

  test('the only row of a search leaves: the results region takes the focus [ux §6.4]', async ({
    page,
  }) => {
    const stub = await stubPublish(page, api, second.id, 'ok', {
      gated: false,
    });
    await openHydrated(
      page,
      `/vacancies?status=DRAFT&vertical=${DEMO_VERTICALS.gambling}&q=${encodeURIComponent(second.title)}`,
    );
    await expect(rowLink(page, second.title)).toBeVisible();
    await menuButton(page, second.title).click();
    await menuItem(page, ta.publish).click();
    await expect(toastWith(page, ta.toast.published)).toBeVisible();
    await expect(rowLink(page, second.title)).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: v.resultsLabel }),
    ).toBeFocused();
    expect(stub.requests).toHaveLength(1);
  });
});

test.describe('who sees the draft actions [D92, D98]', () => {
  test('a viewer who cannot author sees no menu on any row, and no actions on a card', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: sessionFile('head.hr@demo'),
      baseURL: E2E_ORIGIN,
    });
    try {
      const page = await context.newPage();
      await openHydrated(page, '/vacancies');
      await expect(
        page.locator('a[data-vacancy-link]').filter({ visible: true }).first(),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /^Дії: / })).toHaveCount(0);
      await page.goto(`/vacancies/${demoVacancy(1).id}`);
      await expect(
        page.getByRole('link', { name: ta.edit, exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: ta.publish, exact: true }),
      ).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('an author sees no menu on rows that are not drafts, and no actions on an open card', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: sessionFile(AUTHOR),
      baseURL: E2E_ORIGIN,
    });
    try {
      const page = await context.newPage();
      await openHydrated(page, '/vacancies');
      await expect(
        page.locator('a[data-vacancy-link]').filter({ visible: true }).first(),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /^Дії: / })).toHaveCount(0);
      await page.goto(`/vacancies/${demoVacancy(1).id}`);
      await expect(
        page.getByRole('link', { name: ta.edit, exact: true }),
      ).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("the Admin sees the menu on their own seeded draft, and on nobody else's [D92]", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: sessionFile('admin@demo'),
      baseURL: E2E_ORIGIN,
    });
    try {
      const page = await context.newPage();
      await openHydrated(
        page,
        `/vacancies?status=DRAFT&vertical=${DEMO_VERTICALS.gambling}`,
      );
      const seeded = demoVacancy(DRAFT_VACANCY);
      await expect(menuButton(page, seeded.title)).toBeVisible();
      const rowMenus = page
        .getByRole('region', { name: messages.vacancies.resultsLabel })
        .getByRole('button', { name: /^Дії: / });
      await expect
        .poll(
          async () =>
            (await rowMenus.count()) - (await visibleTitles(page)).length,
        )
        .toBe(0);
    } finally {
      await context.close();
    }
  });

  test('another author cannot reach the edit page of a draft that is not theirs', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: sessionFile('recruiter1.gambling@demo'),
      baseURL: E2E_ORIGIN,
    });
    try {
      const page = await context.newPage();
      const response = await page.goto(editPath(demoVacancy(DRAFT_VACANCY).id));
      expect(response?.status()).toBe(404);
    } finally {
      await context.close();
    }
  });
});
