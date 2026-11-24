import { expect, type Page } from '@playwright/test';
import {
  RICH_TEXT_MAX_JSON,
  richTextDocSchema,
  type RichTextDoc,
} from '../../lib/schemas/rich-text';
import messages from '../../messages/uk.json' with { type: 'json' };
import { sessionFile } from '../support/e2e-session';
import { openHydrated } from '../support/hydration';
import { problemFulfill } from '../support/problem';
import { removeSeededDraft, seedDraft } from '../support/vacancy-draft-db';
import { withOwner } from '../support/vacancy-request-db';
import {
  contentPath,
  contentUrl,
  contentWrites,
  editor,
  editorRuntimePath,
  openContent,
  RECRUITER,
  replaceText,
  saved,
  saveContent,
  setContentStatus,
  tc,
  test,
  textDoc,
  tr,
  type ContentFixture,
} from './support/vacancy-content';
import { OWN_DRAFT_PREFIX } from './support/vacancy-create';
import { withVisitor } from './support/vacancy-team';

type Field = 'description' | 'requirements';

const editLink = (page: Page) =>
  page.getByRole('link', {
    name: messages.vacancies.contentCard.editAction,
    exact: true,
  });
const panel = (page: Page) =>
  page.locator('section[aria-labelledby="vacancy-content-detail"]');
const footer = (page: Page) =>
  page.locator('[data-slot="form-page-footer"]').filter({ visible: true });
/** Keyed by the label: the control's own id does not exist while its chunk has failed. */
const section = (page: Page, field: Field) =>
  page
    .locator('[data-slot="form-field"]')
    .filter({ has: page.locator(`#vacancy-content-${field}-label`) })
    .locator('..');
const clearOf = (page: Page, field: Field) =>
  section(page, field).getByRole('button', { name: tc.clear, exact: true });

const setDocuments = (
  vacancy: ContentFixture,
  description: RichTextDoc | null,
  requirements: RichTextDoc | null,
) =>
  withOwner(
    (sql) => sql`
      update app.vacancy
      set description_doc = ${description ? sql.json(description) : null},
        requirements_doc = ${requirements ? sql.json(requirements) : null}
      where id = ${vacancy.id} and title = ${vacancy.title}`,
  );

const contentRead = (page: Page, id: string) =>
  page.waitForResponse(
    (answer) =>
      answer.request().method() === 'GET' && contentUrl(id).test(answer.url()),
  );

/** Valid when stored, but Tiptap adds `attrs.start` to each ordered list, which pushes the editor's own JSON over the size cap. */
function validOnlyUntilEdited(): RichTextDoc {
  const list = (text: string) => ({
    type: 'orderedList' as const,
    content: [
      {
        type: 'listItem' as const,
        content: [
          {
            type: 'paragraph' as const,
            content: [{ type: 'text' as const, text }],
          },
        ],
      },
    ],
  });
  const lists = 200;
  const frame = JSON.stringify({
    type: 'doc',
    content: Array.from({ length: lists }, () => list('')),
  }).length;
  const letters = Math.floor((RICH_TEXT_MAX_JSON - frame - 100) / lists);
  return richTextDocSchema.parse({
    type: 'doc',
    content: Array.from({ length: lists }, () => list('а'.repeat(letters))),
  });
}

test.describe('content editor recovery [VAC-08, ADR-020]', () => {
  test.use({ storageState: sessionFile(RECRUITER) });

  test('Clear stays blocked after a failed editor chunk and returns only after that field retries', async ({
    page,
    vacancy,
  }) => {
    await setDocuments(
      vacancy,
      textDoc(vacancy.description),
      textDoc('Наявні вимоги'),
    );
    const runtime = await editorRuntimePath();
    let blocked = true;
    await page.route(
      (url) => url.pathname === runtime,
      (route) => (blocked ? route.abort('failed') : route.continue()),
    );
    await openHydrated(page, contentPath(vacancy.id));
    await expect(section(page, 'description').getByRole('alert')).toContainText(
      tr.loadFailed,
    );
    await expect(
      section(page, 'requirements').getByRole('alert'),
    ).toContainText(tr.loadFailed);
    for (const field of ['description', 'requirements'] as const)
      await expect(clearOf(page, field)).toHaveAttribute(
        'aria-disabled',
        'true',
      );
    await clearOf(page, 'description').click({ force: true });
    await expect(page.getByText(tc.cleared)).toHaveCount(0);

    blocked = false;
    await section(page, 'description')
      .getByRole('button', { name: tr.retry, exact: true })
      .click();
    await expect(editor(page, 'description')).toHaveAttribute(
      'contenteditable',
      'true',
    );
    await expect(clearOf(page, 'description')).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(clearOf(page, 'requirements')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await clearOf(page, 'description').click();
    await expect(page.getByText(tc.cleared)).toBeVisible();
  });

  test('an invalid stored document can be cleared, blocks Save until valid and undo restores it', async ({
    page,
    vacancy,
  }) => {
    await setDocuments(vacancy, validOnlyUntilEdited(), null);
    const sent = contentWrites(page, vacancy.id);
    await openHydrated(page, contentPath(vacancy.id));
    await expect(editor(page, 'description')).toContainText('а');
    await expect(saveContent(page)).toHaveAttribute('aria-disabled', 'true');
    await clearOf(page, 'description').click();
    await expect(page.getByText(tc.cleared)).toBeVisible();
    await expect(saveContent(page)).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await section(page, 'description')
      .getByRole('button', { name: tc.undoClear, exact: true })
      .click();
    await expect(editor(page, 'description')).toContainText('а');
    await expect(saveContent(page)).toHaveAttribute('aria-disabled', 'true');
    expect(sent).toHaveLength(0);
  });

  test('a failed save offers a Retry that a press reaches, and the retry saves', async ({
    page,
    vacancy,
    isMobile,
  }) => {
    await openContent(page, vacancy);
    await replaceText(editor(page, 'description'), 'Опис після повтору');
    let attempts = 0;
    await page.route(contentUrl(vacancy.id), async (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback();
      attempts += 1;
      return attempts === 1
        ? route.fulfill(await problemFulfill(500, 'INTERNAL'))
        : route.fallback();
    });
    await saveContent(page).click();
    const retry = page
      .getByRole('alert')
      .filter({ hasText: tc.feedback.server })
      .getByRole('button', { name: messages.common.retry, exact: true });
    await expect(retry).toBeVisible();
    await (isMobile ? retry.tap() : retry.click());
    await expect(saved(page)).toBeVisible();
    expect(attempts).toBe(2);
  });

  test('a read error keeps the title and way back without the number or title; a 404 stays the unavailable state', async ({
    page,
    vacancy,
  }) => {
    let status = 500;
    await page.route(contentUrl(vacancy.id), async (route) =>
      route.fulfill(
        await problemFulfill(status, status === 500 ? 'INTERNAL' : 'NOT_FOUND'),
      ),
    );
    await openHydrated(page, contentPath(vacancy.id));
    const retry = page.getByRole('button', { name: messages.common.retry });
    await expect(retry).toBeEnabled({ timeout: 30_000 });
    await expect(
      page.getByRole('heading', { level: 1, name: tc.title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: tc.back, exact: true }),
    ).toHaveAttribute('href', `/vacancies/${vacancy.id}`);
    const main = page.locator('main');
    await expect(main).not.toContainText(vacancy.number);
    await expect(main).not.toContainText(vacancy.title);

    status = 404;
    await retry.click();
    await expect(
      page.getByText(tc.unavailableTitle, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 1, name: tc.title, exact: true }),
    ).toHaveCount(0);
    await expect(main).not.toContainText(vacancy.title);
  });
});

test.describe('card edit link [VAC-08, P2, ADR-020]', () => {
  test.use({ storageState: sessionFile(RECRUITER) });

  test('the heading row does not move when the link arrives and the link is 44 px', async ({
    page,
    vacancy,
    isMobile,
  }) => {
    for (const width of isMobile ? [320, 360, 390] : [1440]) {
      await page.setViewportSize({ width, height: 844 });
      let release = () => {};
      const held = new Promise<void>((resolve) => (release = resolve));
      const hold = contentUrl(vacancy.id);
      await page.route(hold, async (route) => {
        await held;
        await route.fallback();
      });
      await openHydrated(page, `/vacancies/${vacancy.id}`);
      const row = panel(page).locator('> div').first();
      await expect(panel(page).getByRole('status')).toBeAttached();
      await expect(editLink(page)).toHaveCount(0);
      const before = await row.boundingBox();
      release();
      await expect(editLink(page)).toBeVisible();
      expect(await row.boundingBox()).toEqual(before);
      expect(
        (await editLink(page).boundingBox())!.height,
      ).toBeGreaterThanOrEqual(44);
      await page.unroute(hold);
    }
  });

  for (const status of ['FILLED', 'CANCELLED'] as const)
    test(`a ${status} vacancy has no edit link`, async ({ page, vacancy }) => {
      await setContentStatus(vacancy, status);
      const read = contentRead(page, vacancy.id);
      await page.goto(`/vacancies/${vacancy.id}`);
      await read;
      await expect(panel(page)).toContainText(vacancy.description);
      await expect(editLink(page)).toHaveCount(0);
    });

  test('HR reads the content without an edit link', async ({
    browser,
    vacancy,
  }) => {
    await withVisitor(browser, 'hr@demo', async (page) => {
      const read = contentRead(page, vacancy.id);
      await page.goto(`/vacancies/${vacancy.id}`);
      await read;
      await expect(panel(page)).toContainText(vacancy.description);
      await expect(editLink(page)).toHaveCount(0);
    });
  });

  test('an own draft has neither the panel nor the link', async ({
    browser,
  }) => {
    const title = `${OWN_DRAFT_PREFIX} P2`;
    const id = await seedDraft({ author: RECRUITER, title });
    try {
      await withVisitor(browser, RECRUITER, async (page) => {
        const read = contentRead(page, id);
        await page.goto(`/vacancies/${id}`);
        expect((await read).status()).toBe(200);
        await expect(
          page.getByRole('heading', { level: 1, name: title }),
        ).toBeVisible();
        await expect(panel(page)).toHaveCount(0);
        await expect(editLink(page)).toHaveCount(0);
      });
    } finally {
      await removeSeededDraft(id, title);
    }
  });
});

async function expectFooterFits(page: Page, isMobile: boolean) {
  await expect(footer(page)).toHaveCount(1);
  if (!isMobile) {
    const inset = await footer(page).evaluate((element) => {
      const box = element.getBoundingClientRect();
      const last = element.lastElementChild!.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        left: style.paddingLeft,
        right: style.paddingRight,
        action: box.right - last.right,
      };
    });
    expect(inset.left).toBe('16px');
    expect(inset.right).toBe('16px');
    expect(inset.action).toBeCloseTo(16, 0);
    return;
  }
  const gapAt = (position: 'middle' | 'end') =>
    page.evaluate(async (at) => {
      const range = document.documentElement.scrollHeight - innerHeight;
      scrollTo(0, at === 'end' ? range : Math.floor(range / 2));
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const bar = Array.from(
        document.querySelectorAll('[data-slot="form-page-footer"]'),
      ).find((element) => element.getClientRects().length > 0)!;
      const nav = document.querySelector('[data-bottom-nav]')!;
      return (
        nav.getBoundingClientRect().top - bar.getBoundingClientRect().bottom
      );
    }, position);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight > innerHeight,
    ),
  ).toBe(true);
  // The navigation's 1 px top border sits above the footer edge: no visible gap and no more overlap than that border.
  for (const position of ['middle', 'end'] as const) {
    await expect.poll(() => gapAt(position)).toBeLessThanOrEqual(0);
    await expect.poll(() => gapAt(position)).toBeGreaterThanOrEqual(-1);
  }
}

test.describe('form footer on every real form [P11]', () => {
  test.describe('content form', () => {
    test.use({ storageState: sessionFile(RECRUITER) });
    test('sticks to the navigation and keeps the desktop inset', async ({
      page,
      vacancy,
      isMobile,
    }) => {
      await openContent(page, vacancy);
      await expectFooterFits(page, isMobile);
    });
  });

  test.describe('create form', () => {
    test.use({ storageState: sessionFile(RECRUITER) });
    test('sticks to the navigation and keeps the desktop inset', async ({
      page,
      isMobile,
    }) => {
      await openHydrated(page, '/vacancies/new');
      await expectFooterFits(page, isMobile);
    });
  });

  test.describe('request form', () => {
    test.use({ storageState: sessionFile('vasyl.tl@demo') });
    test('sticks to the navigation and keeps the desktop inset', async ({
      page,
      isMobile,
    }) => {
      await openHydrated(page, '/vacancies/request');
      await expectFooterFits(page, isMobile);
    });
  });

  test.describe('draft form', () => {
    test.use({ storageState: sessionFile(RECRUITER) });
    test('sticks to the navigation and keeps the desktop inset', async ({
      page,
      isMobile,
    }) => {
      const title = `${OWN_DRAFT_PREFIX} P11`;
      const id = await seedDraft({ author: RECRUITER, title });
      try {
        await openHydrated(page, `/vacancies/${id}/edit`);
        await expectFooterFits(page, isMobile);
      } finally {
        await removeSeededDraft(id, title);
      }
    });
  });
});

test.describe('content form layout [P8, ADR-020]', () => {
  test.use({ storageState: sessionFile(RECRUITER) });

  test('a touch screen explains the disabled Save and the footer keeps its height', async ({
    page,
    vacancy,
    isMobile,
  }) => {
    test.skip(
      !isMobile,
      'hover exists on desktop, where a tooltip explains it',
    );
    await openContent(page, vacancy);
    const hint = footer(page).getByText(tc.saveNoChanges, { exact: true });
    await expect(hint).toBeVisible();
    const before = (await footer(page).boundingBox())!.height;
    await replaceText(editor(page, 'description'), 'Нова правка');
    await expect(hint).toHaveCount(0);
    expect((await footer(page).boundingBox())!.height).toBe(before);
  });

  test('the form column is 720 px at 1440 and nothing overflows on a phone', async ({
    page,
    vacancy,
    isMobile,
  }) => {
    await openContent(page, vacancy);
    if (!isMobile) {
      expect(
        (await page.locator('main form').boundingBox())!.width,
      ).toBeCloseTo(720, 0);
      return;
    }
    for (const width of [320, 360, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
    }
  });
});
