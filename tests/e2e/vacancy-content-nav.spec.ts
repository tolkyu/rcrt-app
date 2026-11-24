import { expect, type Locator, type Page } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { sessionFile } from '../support/e2e-session';
import { openHydrated } from '../support/hydration';
import { problemFulfill } from '../support/problem';
import {
  contentPath,
  contentUrl,
  editor,
  RECRUITER,
  saveContent as saveContentForm,
  tc,
  test,
  type ContentFixture,
} from './support/vacancy-content';

const READY_WITHIN_MS = 2_000;
const WATCH_KEY = 'e2e-content-text-watch';
const PANEL = 'section[aria-labelledby="vacancy-content-detail"]';

const panel = (page: Page) => page.locator(PANEL);
const editLink = (page: Page) =>
  panel(page).getByRole('link', {
    name: messages.vacancies.contentCard.editAction,
    exact: true,
  });
const press = (link: Locator, isMobile: boolean) =>
  isMobile ? link.tap() : link.click();

async function openCardAtContent(page: Page, vacancy: ContentFixture) {
  await openHydrated(page, `/vacancies/${vacancy.id}`);
  await expect(panel(page)).toContainText(vacancy.description);
  await expect(editLink(page)).toBeVisible();
  await panel(page).scrollIntoViewIfNeeded();
}

/** Checks every committed DOM state, across a reload; the card's own panel may show the text until the route swaps. */
const watchDocumentText = (page: Page, text: string) =>
  page.addInitScript(
    ({ key, panelSelector, marker }) => {
      const inspect = () => {
        if (sessionStorage.getItem(key) !== 'armed') return;
        const inEditor = [
          ...document.querySelectorAll('[contenteditable]'),
        ].some((node) => node.textContent?.includes(marker));
        const outsideCard =
          !document.querySelector(panelSelector) &&
          document.querySelector('main')?.textContent?.includes(marker);
        if (inEditor || outsideCard) sessionStorage.setItem(key, 'seen');
      };
      new MutationObserver(inspect).observe(document, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    },
    { key: WATCH_KEY, panelSelector: PANEL, marker: text },
  );
const armWatch = (page: Page) =>
  page.evaluate((key) => sessionStorage.setItem(key, 'armed'), WATCH_KEY);
const watchState = (page: Page) =>
  page.evaluate((key) => sessionStorage.getItem(key), WATCH_KEY);
const settle = (page: Page) =>
  expect(async () => {
    await page.clock.runFor(60_000);
    await page.evaluate(() =>
      fetch('/api/health').then((answer) => answer.text()),
    );
  }).toPass();

test.use({ storageState: sessionFile(RECRUITER) });

test.describe('card to content editor navigation [VAC-08, ADR-020]', () => {
  test('one press on the edit link opens both editors, and Back restores the card', async ({
    page,
    vacancy,
    isMobile,
  }) => {
    await page.clock.install();
    await watchDocumentText(page, vacancy.description);
    await openCardAtContent(page, vacancy);
    await armWatch(page);
    const reads: string[] = [];
    page.on('request', (request) => {
      if (
        request.method() === 'GET' &&
        contentUrl(vacancy.id).test(request.url())
      )
        reads.push(request.url());
    });
    const read = page.waitForResponse(
      (answer) =>
        answer.request().method() === 'GET' &&
        contentUrl(vacancy.id).test(answer.url()),
    );
    await press(editLink(page), isMobile);
    expect((await read).status()).toBe(200);
    for (const field of ['description', 'requirements'] as const)
      await expect(editor(page, field)).toHaveAttribute(
        'contenteditable',
        'true',
        { timeout: READY_WITHIN_MS },
      );
    await expect(
      page.locator('[data-slot="form-skeleton"]').filter({ visible: true }),
    ).toHaveCount(0);
    await expect(editor(page, 'description')).toContainText(
      vacancy.description,
    );
    expect(await watchState(page)).toBe('seen');
    await settle(page);
    expect(reads).toHaveLength(1);

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/vacancies/${vacancy.id}$`));
    await expect(panel(page)).toContainText(vacancy.description);
    await expect(editLink(page)).toBeVisible();
  });

  test('a content 500 during the navigation shows retry without a form, and retry opens the editors', async ({
    page,
    vacancy,
    isMobile,
  }) => {
    await openCardAtContent(page, vacancy);
    let failing = true;
    await page.route(contentUrl(vacancy.id), async (route) => {
      if (route.request().method() !== 'GET' || !failing)
        return route.fallback();
      return route.fulfill(await problemFulfill(500, 'INTERNAL'));
    });
    await press(editLink(page), isMobile);
    const retry = page.getByRole('button', {
      name: messages.common.retry,
      exact: true,
    });
    await expect(retry).toBeEnabled({ timeout: 30_000 });
    await expect(page.locator('[contenteditable]')).toHaveCount(0);
    await expect(saveContentForm(page)).toHaveCount(0);

    failing = false;
    await press(retry, isMobile);
    for (const field of ['description', 'requirements'] as const)
      await expect(editor(page, field)).toHaveAttribute(
        'contenteditable',
        'true',
      );
    await expect(editor(page, 'description')).toContainText(
      vacancy.description,
    );
    await expect(retry).toHaveCount(0);
  });

  test('a content 404 during the navigation shows the unavailable state with at most one reload', async ({
    page,
    vacancy,
    isMobile,
  }) => {
    await page.clock.install();
    await watchDocumentText(page, vacancy.description);
    await openCardAtContent(page, vacancy);
    await armWatch(page);
    const documents: string[] = [];
    page.on('request', (request) => {
      if (
        request.isNavigationRequest() &&
        request.frame() === page.mainFrame() &&
        new URL(request.url()).pathname === contentPath(vacancy.id)
      )
        documents.push(request.url());
    });
    await page.route(contentUrl(vacancy.id), async (route) =>
      route.request().method() === 'GET'
        ? route.fulfill(await problemFulfill(404, 'NOT_FOUND'))
        : route.fallback(),
    );
    await press(editLink(page), isMobile);
    const state = page.getByText(tc.unavailableTitle, { exact: true });
    await expect(state).toBeVisible();
    // A reload may destroy the context mid-step; the retry runs in the new document.
    await settle(page);
    await expect(state).toBeVisible();
    await expect(page.locator('main')).not.toContainText(vacancy.description);
    await expect(page.locator('[contenteditable]')).toHaveCount(0);
    expect(documents.length).toBeLessThanOrEqual(1);
    expect(await watchState(page)).toBe('armed');
  });
});
