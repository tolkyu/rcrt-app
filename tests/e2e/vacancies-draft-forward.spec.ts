import { expect, test, type Page } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { sessionFile } from '../support/e2e-session';
import { openHydrated } from '../support/hydration';
import { removeSeededDraft } from '../support/vacancy-draft-db';
import { confirmDelete, tc } from './support/vacancy-close';
import {
  cardMenuButton,
  createOwnDraft,
  draftListPath,
  menuButton,
  menuItem,
  rowLink,
  ta,
} from './support/vacancy-draft-actions';
import { toastWith } from './support/vacancy-edit';
import { openMenu } from './support/vacancy-gallery';

const v = messages.vacancies;
const WATCH_KEY = 'e2e-forward-old-card';
const UNAVAILABLE = new RegExp(
  `${v.detail.notFoundTitle}|${messages.errors.notFoundTitle}`,
);

/** Checks every committed DOM state of `main`, across a reload; the toast legitimately names the deleted draft outside it. */
const watchOldCard = (page: Page, markers: readonly string[]) =>
  page.addInitScript(
    ({ key, values }) => {
      const inspect = () => {
        if (sessionStorage.getItem(key) !== 'armed') return;
        const text = document.querySelector('main')?.textContent ?? '';
        if (values.some((value) => text.includes(value)))
          sessionStorage.setItem(key, 'seen');
      };
      new MutationObserver(inspect).observe(document, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    },
    { key: WATCH_KEY, values: [...markers] },
  );

test.use({ storageState: sessionFile('recruiter2.gambling@demo') });

test('Forward to the card of a draft deleted from its list row shows not-found, without old data or repeating requests [VAC-01, VAC-08, ADR-020]', async ({
  page,
  isMobile,
}) => {
  const draft = await createOwnDraft(page.request, 'forward', true);
  const cardPath = `/vacancies/${draft.id}`;
  try {
    await page.clock.install();
    await watchOldCard(page, [draft.title, draft.number]);

    if (isMobile) {
      await openHydrated(page, draftListPath());
      await rowLink(page, draft.title).click();
    } else {
      await openHydrated(page, draftListPath(draft.id));
      const preview = page.getByRole('complementary', { name: v.previewLabel });
      const openCard = menuItem(page, v.openCard);
      await openMenu(
        preview.getByRole('button', {
          name: ta.menuLabel.replace('{title}', draft.title),
        }),
        openCard,
      );
      await openCard.click();
    }
    await expect(page).toHaveURL(new RegExp(`${cardPath}$`));
    await expect(
      page.getByRole('heading', { level: 1, name: draft.title }),
    ).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/vacancies\?/);
    const remove = menuItem(page, ta.delete);
    await openMenu(menuButton(page, draft.title), remove);
    await remove.click();
    await confirmDelete(page).click();
    await expect(toastWith(page, tc.toast.deletedDraft)).toBeVisible();
    await expect(rowLink(page, draft.title)).toHaveCount(0);
    const preview = page.getByRole('complementary', { name: v.previewLabel });
    await expect(
      preview.getByRole('heading', { level: 2, name: draft.title }),
    ).toHaveCount(0);

    await page.evaluate(
      (key) => sessionStorage.setItem(key, 'armed'),
      WATCH_KEY,
    );
    const reads: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.includes(draft.id))
        reads.push(request.url());
    });

    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`${cardPath}$`));
    const main = page.locator('main');
    await expect(
      main.getByRole('heading', { name: UNAVAILABLE }),
    ).toBeVisible();
    await expect(main).not.toContainText(draft.title);
    await expect(main).not.toContainText(draft.number);
    await expect(cardMenuButton(page, draft.title)).toHaveCount(0);
    for (const name of [ta.edit, ta.publish, ta.cancel, ta.delete])
      await expect(main.getByRole('button', { name, exact: true })).toHaveCount(
        0,
      );
    await expect(
      main.getByRole('link', { name: ta.edit, exact: true }),
    ).toHaveCount(0);

    const settled = reads.length;
    await page.clock.runFor(60_000);
    await page.evaluate(() =>
      fetch('/api/health').then((answer) => answer.text()),
    );
    expect(reads).toHaveLength(settled);
    expect(
      await page.evaluate((key) => sessionStorage.getItem(key), WATCH_KEY),
    ).toBe('armed');
  } finally {
    await removeSeededDraft(draft.id, draft.title);
  }
});

test('a retried delete that meets its own 404 says the draft is gone, shows no success and reloads once on the next read 404 [VAC-01, VAC-08, ADR-020]', async ({
  page,
}) => {
  const draft = await createOwnDraft(page.request, 'retry-gone', true);
  const cardPath = `/vacancies/${draft.id}`;
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  let holding = false;
  let deletes = 0;
  try {
    await page.clock.install();
    await openHydrated(page, cardPath);
    const documents: string[] = [];
    page.on('request', (request) => {
      if (
        request.isNavigationRequest() &&
        request.frame() === page.mainFrame() &&
        new URL(request.url()).pathname === cardPath
      )
        documents.push(request.url());
    });
    // The first DELETE really commits and only its answer is lost; reads wait so the toast is observed before the reload.
    await page.route(
      new RegExp(`/api/v1/vacancies/${draft.id}(/content)?$`),
      async (route) => {
        const method = route.request().method();
        if (method === 'DELETE') {
          deletes += 1;
          if (deletes > 1) return route.fallback();
          holding = true;
          expect((await route.fetch()).status()).toBe(200);
          return route.abort('failed');
        }
        if (method === 'GET' && holding) await held;
        return route.fallback();
      },
    );

    const remove = menuItem(page, ta.delete);
    await openMenu(cardMenuButton(page, draft.title), remove);
    await remove.click();
    await confirmDelete(page).click();
    await expect(
      page.getByRole('alertdialog').getByRole('alert'),
    ).toContainText(tc.error.network);
    await confirmDelete(page).click();

    await expect(toastWith(page, ta.toast.gone)).toBeVisible();
    await expect(toastWith(page, tc.toast.deletedDraft)).toHaveCount(0);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(deletes).toBe(2);
    expect(documents).toHaveLength(0);

    release();
    await expect.poll(() => documents.length).toBe(1);
    const main = page.locator('main');
    await expect(
      main.getByRole('heading', { name: UNAVAILABLE }),
    ).toBeVisible();
    await expect(main).not.toContainText(draft.title);
    await expect(async () => {
      await page.clock.runFor(60_000);
      await page.evaluate(() =>
        fetch('/api/health').then((answer) => answer.text()),
      );
    }).toPass();
    expect(documents).toHaveLength(1);
    await expect(toastWith(page, tc.toast.deletedDraft)).toHaveCount(0);
  } finally {
    release();
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await removeSeededDraft(draft.id, draft.title);
  }
});
