import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { DEMO_VERTICALS, demoId } from '../../server/db/seed';
import { sessionFile, signIn } from '../support/e2e-session';
import { openHydrated } from '../support/hydration';
import {
  withIsolatedActor,
  type IsolatedActor,
} from '../support/isolated-actor';
import { problemFulfill } from '../support/problem';
import { removeSeededDraft } from '../support/vacancy-draft-db';
import { withOwner } from '../support/vacancy-request-db';
import { addTeamFixture, TEAM_MARKER } from '../support/vacancy-team-db';
import { confirmDelete, tc as closeText } from './support/vacancy-close';
import {
  cardMenuButton,
  createOwnDraft,
  draftListPath,
  menuItem,
  ta,
} from './support/vacancy-draft-actions';
import { toastWith } from './support/vacancy-edit';
import { openMenu } from './support/vacancy-gallery';
import {
  contentPath,
  editor,
  RECRUITER,
  replaceText,
  test,
  type ContentFixture,
} from './support/vacancy-content';

const tv = messages.vacancies;
const UNAVAILABLE = new RegExp(
  `${tv.detail.notFoundTitle}|${messages.errors.notFoundTitle}`,
);
const SIGNED_OUT = /\/(login|session-expired)(?:\?|$)/;
const OLD_DOCUMENT = 'e2eDocumentBeforeDenial';

/** A second assigned recruiter removes the pool read, so the viewer gets a real 404 from every vacancy route. */
const revokeAccess = (vacancy: ContentFixture) =>
  withOwner(async (sql) => {
    await sql`
      delete from app.vacancy_recruiter
      where vacancy_id = ${vacancy.id} and user_id = ${demoId(`user:${RECRUITER}`)}`;
    await sql`
      insert into app.vacancy_recruiter (vacancy_id, user_id, assigned_by)
      values (
        ${vacancy.id},
        ${demoId('user:recruiter2.gambling@demo')},
        ${demoId('user:head.recruiter.gambling@demo')}
      )`;
  });

/** Markup without inline flight scripts, which keep their bytes after the UI has dropped the data. */
const renderedMarkup = (page: Page) =>
  page.evaluate(() => {
    const body = document.body.cloneNode(true) as HTMLElement;
    body.querySelectorAll('script, style').forEach((node) => node.remove());
    return body.outerHTML;
  });

async function expectNoVacancyData(page: Page, vacancy: ContentFixture) {
  await expect
    .poll(async () => {
      // A navigation can destroy the context mid-read; the next poll reads the new document.
      const markup = await renderedMarkup(page).catch(() => null);
      return (
        markup === null ||
        [vacancy.title, vacancy.number, vacancy.description].some((text) =>
          markup.includes(text),
        )
      );
    })
    .toBe(false);
}

/** Main-frame document requests for `path`, counted from the moment of the call. */
function documentLoads(page: Page, path: string) {
  const seen: string[] = [];
  page.on('request', (request) => {
    if (
      request.isNavigationRequest() &&
      request.frame() === page.mainFrame() &&
      new URL(request.url()).pathname === path
    )
      seen.push(request.url());
  });
  return seen;
}

const markDocument = (page: Page) =>
  page.evaluate((name) => Reflect.set(window, name, true), OLD_DOCUMENT);

/** Survives the navigation, so later assertions cannot pass on the document that is about to be replaced. */
async function waitForNewDocument(page: Page) {
  await page.waitForFunction(
    (name) => !Reflect.get(window, name),
    OLD_DOCUMENT,
  );
  await page.waitForLoadState('domcontentloaded');
}

/** Every timer a retry or reload loop could use has fired, and a finished round trip proves what it started was sent. */
async function expectNoRepeats(page: Page, seen: readonly string[]) {
  const settled = seen.length;
  await page.clock.runFor(60_000);
  await page.evaluate(() =>
    fetch('/api/health').then((answer) => answer.text()),
  );
  expect(seen).toHaveLength(settled);
}

/** Ages every cached read past its stale time, then fires the focus refetch. */
async function refetchOnFocus(page: Page) {
  await page.clock.fastForward(61_000);
  await page.evaluate(() =>
    window.dispatchEvent(new Event('visibilitychange')),
  );
}

async function denyAndReload(
  page: Page,
  loads: readonly string[],
  deny: () => Promise<unknown>,
) {
  await markDocument(page);
  await deny();
  await refetchOnFocus(page);
  await waitForNewDocument(page);
  expect(loads).toHaveLength(1);
}

const cardHeading = (page: Page, vacancy: ContentFixture) =>
  page.getByRole('heading', { level: 1, name: vacancy.title });
const cardPath = (vacancy: ContentFixture) => `/vacancies/${vacancy.id}`;
const cardUrl = (vacancy: ContentFixture) =>
  new RegExp(`/vacancies/${vacancy.id}$`);
const unavailable = (page: Page) => page.getByText(UNAVAILABLE).first();
const visibleSkeletons = (page: Page) =>
  page.locator('main [data-slot="skeleton"]').filter({ visible: true });

/** A client navigation, so the list stays in the history as it does after a real click. */
async function pushFromList(page: Page, target: string) {
  await page.clock.install();
  await openHydrated(page, '/vacancies');
  await page.evaluate((path) => {
    const runtime = Reflect.get(window, 'next') as {
      router: { push: (href: string) => void };
    };
    runtime.router.push(path);
  }, target);
}

async function openCardFromList(page: Page, vacancy: ContentFixture) {
  await pushFromList(page, cardPath(vacancy));
  await expect(cardHeading(page, vacancy)).toBeVisible();
}

const assign = (vacancy: ContentFixture, actor: IsolatedActor) =>
  withOwner(
    (sql) => sql`
      insert into app.vacancy_recruiter (vacancy_id, user_id, assigned_by)
      values (${vacancy.id}, ${actor.id}, ${demoId('user:head.recruiter.gambling@demo')})`,
  );

async function openOwnList(page: Page, vacancy: ContentFixture) {
  await page.clock.install();
  await openHydrated(page, `/vacancies?q=${encodeURIComponent(vacancy.title)}`);
  await expect(
    page.getByText(vacancy.title).filter({ visible: true }).first(),
  ).toBeVisible();
}

test.describe('a confirmed read denial reloads the page once [VAC-08, VIS-02, ADR-020]', () => {
  test.use({ storageState: sessionFile(RECRUITER) });

  test('a card reloads exactly once and stays denied without a loop', async ({
    page,
    vacancy,
  }) => {
    await page.clock.install();
    await openHydrated(page, cardPath(vacancy));
    await expect(cardHeading(page, vacancy)).toBeVisible();
    const loads = documentLoads(page, cardPath(vacancy));

    await denyAndReload(page, loads, () => revokeAccess(vacancy));
    await expect(page).toHaveURL(cardUrl(vacancy));
    await expect(unavailable(page)).toBeVisible();
    await expectNoVacancyData(page, vacancy);
    await refetchOnFocus(page);
    await expectNoRepeats(page, loads);
    expect(loads).toHaveLength(1);
  });

  test('a list preview reloads exactly once and shows no old data', async ({
    page,
    vacancy,
    isMobile,
  }) => {
    test.skip(isMobile, 'the side preview exists only on a wide screen');
    await page.clock.install();
    // No `q`: a search box echoing the title would be the user's own input, not leaked data.
    await openHydrated(page, `/vacancies?vacancy=${vacancy.id}`);
    const preview = page.getByRole('complementary', { name: tv.previewLabel });
    await expect(
      preview.getByRole('heading', { level: 2, name: vacancy.title }),
    ).toBeVisible();
    const loads = documentLoads(page, '/vacancies');

    await denyAndReload(page, loads, () => revokeAccess(vacancy));
    await expect(page).toHaveURL(new RegExp(`vacancy=${vacancy.id}`));
    await expectNoVacancyData(page, vacancy);
    await expectNoRepeats(page, loads);
    expect(loads).toHaveLength(1);
  });

  test('Back after the reload shows no old title, number or content', async ({
    page,
    vacancy,
  }) => {
    await openCardFromList(page, vacancy);
    const loads = documentLoads(page, cardPath(vacancy));
    await denyAndReload(page, loads, () => revokeAccess(vacancy));
    await expect(unavailable(page)).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/vacancies$/);
    await expectNoVacancyData(page, vacancy);
    await page.goForward();
    await expect(page).toHaveURL(cardUrl(vacancy));
    await expect(unavailable(page)).toBeVisible();
    await expectNoVacancyData(page, vacancy);
  });

  test('unsaved editor text raises no browser dialog on the reload, and Back past the guard entry shows no data', async ({
    page,
    vacancy,
  }) => {
    const dialogs: string[] = [];
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.type());
      await dialog.accept();
    });
    await pushFromList(page, contentPath(vacancy.id));
    await expect(editor(page, 'description')).toHaveAttribute(
      'contenteditable',
      'true',
    );
    const typed = 'Незбережений текст перед втратою доступу';
    await replaceText(editor(page, 'description'), typed);
    const loads = documentLoads(page, contentPath(vacancy.id));

    await denyAndReload(page, loads, () => revokeAccess(vacancy));
    await expect(unavailable(page)).toBeVisible();
    await expect(page.locator('[contenteditable]')).toHaveCount(0);
    await expect(page.getByText(typed)).toHaveCount(0);
    expect(dialogs).toEqual([]);

    // The leave guard pushed a duplicate of the editor entry before the reload replaced the top one.
    await page.goBack();
    if (new URL(page.url()).pathname === contentPath(vacancy.id)) {
      await expect(unavailable(page)).toBeVisible();
      await expectNoVacancyData(page, vacancy);
      await page.goBack();
    }
    await expect(page).toHaveURL(/\/vacancies$/);
    await expectNoVacancyData(page, vacancy);
    await expect(page.getByText(typed)).toHaveCount(0);
    expect(dialogs).toEqual([]);
  });

  test('without sessionStorage nothing reloads, the data is purged and the denied state shows', async ({
    page,
    vacancy,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'sessionStorage', {
        configurable: true,
        get() {
          throw new DOMException('Storage is blocked', 'SecurityError');
        },
      });
    });
    await page.clock.install();
    await openHydrated(page, cardPath(vacancy));
    await expect(cardHeading(page, vacancy)).toBeVisible();
    const loads = documentLoads(page, cardPath(vacancy));

    await revokeAccess(vacancy);
    const denied = page.waitForResponse(
      (answer) =>
        answer.url().includes(`/api/v1/vacancies/${vacancy.id}`) &&
        answer.status() === 404,
    );
    await refetchOnFocus(page);
    await denied;
    await expect(unavailable(page)).toBeVisible();
    await expectNoVacancyData(page, vacancy);
    await expect(visibleSkeletons(page)).toHaveCount(0);
    await expectNoRepeats(page, loads);
    expect(loads).toHaveLength(0);
  });

  test('an expired session leads to sign-in and Back shows no card', async ({
    page,
    context,
    vacancy,
  }) => {
    await openCardFromList(page, vacancy);
    await markDocument(page);
    await context.clearCookies();
    await refetchOnFocus(page);
    await waitForNewDocument(page);
    await expect(page).toHaveURL(SIGNED_OUT);
    await expectNoVacancyData(page, vacancy);

    await page.goBack();
    await expect(page).toHaveURL(SIGNED_OUT);
    await expectNoVacancyData(page, vacancy);
  });
});

test.describe('reload target and scope [VAC-08, ADR-020, D1, D2]', () => {
  test.describe('recruiter', () => {
    test.use({ storageState: sessionFile(RECRUITER) });

    test('a URL with #main reloads once as a new document without the fragment', async ({
      page,
      vacancy,
    }) => {
      await page.clock.install();
      await openHydrated(page, cardPath(vacancy));
      await expect(cardHeading(page, vacancy)).toBeVisible();
      const skip = page.getByRole('link', {
        name: messages.shell.skipToContent,
      });
      await skip.focus();
      await skip.press('Enter');
      await expect(page).toHaveURL(/#main$/);
      const loads = documentLoads(page, cardPath(vacancy));

      await denyAndReload(page, loads, () => revokeAccess(vacancy));
      expect(new URL(loads[0]!).hash).toBe('');
      await expect(page).toHaveURL(cardUrl(vacancy));
      await expect(unavailable(page)).toBeVisible();
      await expectNoVacancyData(page, vacancy);
      await expectNoRepeats(page, loads);
      expect(loads).toHaveLength(1);
    });

    test('A then B denied on the list each reload once and Back shows neither', async ({
      page,
      vacancy,
      isMobile,
    }) => {
      test.skip(isMobile, 'the side preview exists only on a wide screen');
      const title = `E2E-CONTENT-${randomUUID()}`;
      const created = await addTeamFixture({
        title,
        status: 'OPEN',
        teamLead: 'vasyl.tl@demo',
        recruiters: [RECRUITER],
      });
      const second: ContentFixture = { ...created, description: TEAM_MARKER };
      try {
        await page.clock.install();
        await openHydrated(page, '/profile');
        await page.goto(`/vacancies?vacancy=${vacancy.id}`);
        const preview = page.getByRole('complementary', {
          name: tv.previewLabel,
        });
        await expect(
          preview.getByRole('heading', { level: 2, name: vacancy.title }),
        ).toBeVisible();
        const loads = documentLoads(page, '/vacancies');

        await denyAndReload(page, loads, () => revokeAccess(vacancy));
        await expect(preview.getByText(tv.previewNotFound)).toBeVisible();
        await page.evaluate(
          (next) => window.history.replaceState(null, '', next),
          `/vacancies?vacancy=${second.id}`,
        );
        await expect(
          preview.getByRole('heading', { level: 2, name: second.title }),
        ).toBeVisible();

        await markDocument(page);
        await revokeAccess(second);
        await refetchOnFocus(page);
        await waitForNewDocument(page);
        expect(loads).toHaveLength(2);
        await expect(preview.getByText(tv.previewNotFound)).toBeVisible();
        await expectNoVacancyData(page, vacancy);
        await expectNoVacancyData(page, second);

        await page.goBack();
        await expect(page).toHaveURL(/\/profile$/);
        await expectNoVacancyData(page, vacancy);
        await expectNoVacancyData(page, second);
      } finally {
        await removeSeededDraft(second.id, second.title);
      }
    });
  });

  test.describe('own draft', () => {
    test.use({ storageState: sessionFile('recruiter2.gambling@demo') });

    const expectDeletedWithoutReload = async (
      page: Page,
      documents: readonly string[],
    ) => {
      await confirmDelete(page).click();
      const toast = toastWith(page, closeText.toast.deletedDraft);
      await expect(toast).toBeVisible();
      await page.evaluate(() =>
        fetch('/api/health').then((answer) => answer.text()),
      );
      await expect(toast).toBeVisible();
      expect(documents).toEqual([]);
    };
    const mainDocuments = (page: Page) => {
      const seen: string[] = [];
      page.on('request', (request) => {
        if (
          request.isNavigationRequest() &&
          request.frame() === page.mainFrame()
        )
          seen.push(request.url());
      });
      return seen;
    };

    test('deleting it from the card is no denial: no reload and the toast stays', async ({
      page,
    }) => {
      const draft = await createOwnDraft(page.request, 'denial-card', true);
      try {
        await openHydrated(page, `/vacancies/${draft.id}`);
        const documents = mainDocuments(page);
        const remove = menuItem(page, ta.delete);
        await openMenu(cardMenuButton(page, draft.title), remove);
        await remove.click();
        await expectDeletedWithoutReload(page, documents);
      } finally {
        await removeSeededDraft(draft.id, draft.title);
      }
    });

    test('deleting it from the preview is no denial: no reload and the toast stays', async ({
      page,
      isMobile,
    }) => {
      test.skip(isMobile, 'the side preview exists only on a wide screen');
      const draft = await createOwnDraft(page.request, 'denial-preview', true);
      try {
        await openHydrated(page, draftListPath(draft.id));
        const preview = page.getByRole('complementary', {
          name: tv.previewLabel,
        });
        await expect(
          preview.getByRole('heading', { level: 2, name: draft.title }),
        ).toBeVisible();
        const documents = mainDocuments(page);
        const remove = menuItem(page, ta.delete);
        await openMenu(
          preview.getByRole('button', {
            name: ta.menuLabel.replace('{title}', draft.title),
          }),
          remove,
        );
        await remove.click();
        await expectDeletedWithoutReload(page, documents);
      } finally {
        await removeSeededDraft(draft.id, draft.title);
      }
    });
  });
});

test.describe('list and identity changes with isolated users [VAC-08, D63, ADR-020]', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  const gambling = {
    role: 'RECRUITER',
    verticalId: DEMO_VERTICALS.gambling,
  } as const;

  test('removing the last vertical role reloads once and leaves no row', async ({
    page,
    vacancy,
  }) => {
    await withIsolatedActor([gambling], async (actor) => {
      await assign(vacancy, actor);
      await signIn(page.request, actor.email);
      await openOwnList(page, vacancy);
      const loads = documentLoads(page, '/vacancies');
      await denyAndReload(page, loads, () =>
        withOwner(
          (sql) => sql`delete from app.user_role where user_id = ${actor.id}`,
        ),
      );
      await expectNoVacancyData(page, vacancy);
      await expect(visibleSkeletons(page)).toHaveCount(0);
      await expectNoRepeats(page, loads);
      expect(loads).toHaveLength(1);
    });
  });

  test('a mixed-role aal1 user whose read becomes withheld reaches the 2FA step-up with no row left', async ({
    page,
    vacancy,
  }) => {
    await withIsolatedActor(
      [{ role: 'FINANCE', verticalId: null }, gambling],
      async (actor) => {
        await assign(vacancy, actor);
        await signIn(page.request, actor.email);
        await openOwnList(page, vacancy);
        const documents: string[] = [];
        page.on('request', (request) => {
          if (
            request.isNavigationRequest() &&
            request.frame() === page.mainFrame()
          )
            documents.push(request.url());
        });
        await markDocument(page);
        await withOwner(
          (sql) => sql`
            update app.user_role set role = 'ADMIN', vertical_id = null
            where user_id = ${actor.id} and role = 'RECRUITER'`,
        );
        await refetchOnFocus(page);
        await waitForNewDocument(page);
        await expect
          .poll(() =>
            documents.some((url) => {
              const parsed = new URL(url);
              return (
                parsed.pathname === '/mfa/verify' &&
                parsed.searchParams.get('next')?.startsWith('/vacancies')
              );
            }),
          )
          .toBe(true);
        // An actor without an enrolled factor continues from verify to setup, keeping `next`.
        await expect(page).toHaveURL(/\/mfa\/(verify|setup)\?next=/);
        await expectNoVacancyData(page, vacancy);
        await expect(visibleSkeletons(page)).toHaveCount(0);
      },
    );
  });

  test('logout and sign-in as another user in the same tab carries no vacancy data', async ({
    page,
    vacancy,
  }) => {
    await withIsolatedActor([gambling], async (first) => {
      await withIsolatedActor(
        [{ role: 'RECRUITER', verticalId: DEMO_VERTICALS.crypto }],
        async (second) => {
          await assign(vacancy, first);
          await signIn(page.request, first.email);
          await openCardFromList(page, vacancy);
          await page
            .getByRole('button', { name: messages.shell.userMenu })
            .click();
          await page
            .getByRole('menuitem', {
              name: messages.shell.logout,
              exact: true,
            })
            .click();
          await expect(page).toHaveURL(SIGNED_OUT);
          await expectNoVacancyData(page, vacancy);

          await signIn(page.request, second.email);
          await page.goBack();
          await expectNoVacancyData(page, vacancy);
          await page.goto(cardPath(vacancy));
          await expect(unavailable(page)).toBeVisible();
          await expectNoVacancyData(page, vacancy);
        },
      );
    });
  });
});

test.describe('a lost action is not a lost card [VAC-08, ADR-020]', () => {
  test.use({ storageState: sessionFile('head.recruiter.gambling@demo') });

  for (const [status, code] of [
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
  ] as const)
    test(`a write ${status} keeps the card and does not reload while reads still succeed`, async ({
      page,
      vacancy,
    }) => {
      let writes = 0;
      await page.route(
        new RegExp(`/api/v1/vacancies/${vacancy.id}/urgency$`),
        async (route) => {
          writes += 1;
          await route.fulfill(await problemFulfill(status, code));
        },
      );
      await page.clock.install();
      await openHydrated(page, cardPath(vacancy));
      const title = cardHeading(page, vacancy);
      await expect(title).toBeVisible();
      const loads = documentLoads(page, cardPath(vacancy));
      // The radio itself is visually hidden; a person presses its label.
      await page
        .getByRole('radiogroup', { name: tv.urgency.label })
        .locator('label', { hasText: tv.urgency.URGENT })
        .click();
      await expect.poll(() => writes).toBe(1);
      await expectNoRepeats(page, loads);
      expect(loads).toHaveLength(0);
      await expect(title).toBeVisible();
      await expect(page.getByText(UNAVAILABLE)).toHaveCount(0);
      const read = await page.request.get(`/api/v1/vacancies/${vacancy.id}`);
      expect(read.status()).toBe(200);
    });
});
