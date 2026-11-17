import { randomUUID } from 'node:crypto';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type Request,
} from '@playwright/test';
import {
  E2E_ORIGIN,
  MUTATION_HEADERS,
  sessionFile,
} from '../support/e2e-session';
import { checkAccessibility } from '../support/accessibility';
import { openHydrated } from '../support/hydration';
import { problemFulfill } from '../support/problem';
import { DRAFT_VACANCY, demoVacancy } from '../support/vacancy-demo';
import messages from '../../messages/uk.json' with { type: 'json' };
import type { VacancyDetail } from '../../lib/schemas/vacancy';
import {
  IDEMPOTENCY_KEY,
  NBSP,
  POSITION,
  OWN_DRAFT_PREFIX,
  currency,
  field,
  level,
  notFound,
  position,
  probation,
  probationReadOnly,
  salaryFrom,
  salaryTo,
  sweepDrafts,
  teamLead,
  t,
  vertical,
} from './support/vacancy-create';
import {
  changeBehindThePage,
  createDraft,
  detailUrl,
  draftListUrl,
  editPath,
  opened,
  patched,
  publishEdit,
  publishUrl,
  readDraft,
  saveEdit,
  te,
  toastWith,
  toasts,
} from './support/vacancy-edit';

const AUTHOR = 'recruiter2.gambling@demo';
const draftsOf = messages.vacancies;

/** Only the writes a stub or a test could add to the shared draft; reads of the list are not counted. */
const writes = (page: Page) => {
  const seen: Request[] = [];
  page.on('request', (request) => {
    if (
      ['PATCH', 'POST'].includes(request.method()) &&
      request.url().includes('/api/v1/vacancies/')
    )
      seen.push(request);
  });
  return seen;
};
const publishRequests = (seen: Request[]) =>
  seen.filter((request) => request.url().endsWith('/publish'));

/** Fails every script chunk whose source holds `marker`, the way a dropped connection or a deploy skew would; `allow()` lets them through again. */
async function blockChunksWith(page: Page, marker: string) {
  let blocked = true;
  await page.route('**/_next/static/chunks/**', async (route) => {
    const response = await route.fetch();
    if (blocked && (await response.text()).includes(marker))
      await route.abort('failed');
    else await route.fulfill({ response });
  });
  return {
    allow: () => {
      blocked = false;
    },
  };
}

const staleAlert = (page: Page) =>
  page.getByRole('alert').filter({ hasText: te.toast.staleDescription });

test.describe('editing an own draft [STORY-VAC-01-1, VAC-01, D92]', () => {
  test.use({ storageState: sessionFile(AUTHOR) });
  // One real draft per project, changed step by step: the shared write bucket of the user stays small.
  test.describe.configure({ mode: 'serial' });
  let api: APIRequestContext;
  let draft: VacancyDetail;

  test.beforeAll(async ({ playwright }) => {
    api = await playwright.request.newContext({
      baseURL: E2E_ORIGIN,
      storageState: sessionFile(AUTHOR),
    });
    draft = await createDraft(api);
  });
  // A chunk request still in flight when a test ends would fail its route callback with «Test ended».
  test.afterEach(({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }));
  test.afterAll(async () => {
    await sweepDrafts(api);
    await api.dispose();
  });

  const open = (page: Page) => openHydrated(page, editPath(draft.id));

  test('opens the saved draft: heading, subtitle, locked vertical, every group filled, the three footer actions [ux §5]', async ({
    page,
  }) => {
    const current = await readDraft(api, draft.id);
    const response = await open(page);
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { level: 1, name: te.title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        new RegExp(
          `^${current.number} · Гемблінг · ${draftsOf.status.DRAFT} · Збережено \\d{2}\\.\\d{2}\\.\\d{4}, \\d{2}:\\d{2}$`,
        ),
      ),
    ).toBeVisible();
    await expect(vertical(page)).toBeDisabled();
    await expect(
      page.getByText(te.verticalLocked, { exact: true }),
    ).toBeVisible();
    await expect(position(page)).toHaveValue(POSITION);
    await expect(field(page, t.titleField.label)).toHaveValue(current.title);
    await expect(field(page, t.headcount.label)).toHaveValue('3');
    await expect(
      page.getByRole('radio', { name: t.priority.URGENT }),
    ).toBeChecked();
    await expect(level(page)).toHaveText('Мідл');
    await expect(field(page, t.location.label)).toHaveValue('Київ');
    await expect(salaryFrom(page)).toHaveValue(`2${NBSP}500`);
    await expect(salaryTo(page)).toHaveValue(`4${NBSP}000,5`);
    await expect(currency(page)).toHaveText(t.salary.currencies.USD);
    // A Recruiter sets neither a Team Lead nor the probation length.
    await expect(teamLead(page)).toHaveCount(0);
    await expect(page.getByText(probationReadOnly)).toBeVisible();
    await expect(
      page.getByRole('link', { name: messages.common.cancel, exact: true }),
    ).toBeVisible();
    await expect(saveEdit(page)).toBeVisible();
    await expect(publishEdit(page)).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });

  test('«Зберегти» without a change sends nothing, says nothing and returns to «Чернетки» [ux §5]', async ({
    page,
  }) => {
    const sent = writes(page);
    await open(page);
    await saveEdit(page).click();
    await expect(page).toHaveURL(draftListUrl(draft.id));
    expect(sent).toHaveLength(0);
    await expect(toasts(page)).toHaveCount(0);
  });

  test('«Зберегти» sends only the changed field with the version, once, and lands on «Чернетки» with a toast [ux §5]', async ({
    page,
  }) => {
    const before = await readDraft(api, draft.id);
    const title = `${OWN_DRAFT_PREFIX} ${Date.now()} змінено`;
    const sent = writes(page);
    await page.goto('/vacancies');
    await open(page);
    await field(page, t.titleField.label).fill(title);
    await saveEdit(page).dblclick();
    await expect(page).toHaveURL(draftListUrl(draft.id));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.method()).toBe('PATCH');
    expect(sent[0]!.postDataJSON()).toEqual({
      title,
      expectedVersion: before.version,
    });
    await expect(
      page.getByText(t.toast.draftSaved, { exact: true }),
    ).toBeVisible();
    const after = await readDraft(api, draft.id);
    expect(after).toMatchObject({ title, version: before.version + 1 });
    // The leave guard was released before the replace: Back reaches the form without the leave question, and one more Back the list, with no ghost entry between.
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${draft.id}/edit$`));
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/vacancies$/);
  });

  test('a stale version keeps what was typed, warns inline and once as a toast, and «Завантажити актуальну» asks before dropping the edits [ux §5.1]', async ({
    page,
  }) => {
    await open(page);
    const behind = await changeBehindThePage(api, draft.id, {
      location: 'Одеса',
    });
    const typed = field(page, t.location.label);
    await typed.fill('Харків');
    await saveEdit(page).click();

    await expect(staleAlert(page)).toBeVisible();
    await expect(staleAlert(page)).toContainText(te.toast.stale);
    await expect(toastWith(page, te.toast.stale)).toHaveCount(1);
    await expect(page).toHaveURL(new RegExp(`${draft.id}/edit$`));
    await expect(typed).toHaveValue('Харків');
    // A rejected save is still editable and sends again on demand.
    await expect(saveEdit(page)).not.toHaveAttribute('aria-disabled', 'true');

    const reload = staleAlert(page).getByRole('button', {
      name: te.stale.reload,
    });
    await reload.click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText(te.stale.confirmDescription);
    await dialog.getByRole('button', { name: te.stale.confirmStay }).click();
    await expect(dialog).toHaveCount(0);
    await expect(typed).toHaveValue('Харків');
    await expect(staleAlert(page)).toBeVisible();

    await reload.click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: te.stale.confirmAction })
      .click();
    await expect(typed).toHaveValue('Одеса');
    await expect(staleAlert(page)).toHaveCount(0);
    // The stored version is now the page's: a change saves again (stubbed, so the draft keeps its version for the next test).
    await page.route(detailUrl(draft.id), async (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(
              patched(
                behind,
                route.request().postDataJSON() as {
                  expectedVersion: number;
                },
              ),
            ),
          })
        : route.fallback(),
    );
    const sent = writes(page);
    await typed.fill('Дніпро');
    await saveEdit(page).click();
    await expect(page).toHaveURL(draftListUrl(draft.id));
    expect(sent[0]!.postDataJSON()).toEqual({
      location: 'Дніпро',
      expectedVersion: behind.version,
    });
  });

  test('«Опублікувати» saves the change first, then publishes the returned version with one key; the card opens [ux §5]', async ({
    page,
  }) => {
    const before = await readDraft(api, draft.id);
    const sent = writes(page);
    // A real publish cannot be undone (no delete for an open vacancy), so the answer is stubbed: contract and UI, no residue in the seeded lists.
    await page.route(publishUrl(draft.id), async (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(opened(await readDraft(api, draft.id))),
      }),
    );
    await open(page);
    await field(page, t.location.label).fill('Львів');
    await publishEdit(page).dblclick();
    await expect(page).toHaveURL(new RegExp(`/vacancies/${draft.id}$`));
    expect(sent.map((request) => request.method())).toEqual(['PATCH', 'POST']);
    expect(sent[0]!.postDataJSON()).toEqual({
      location: 'Львів',
      expectedVersion: before.version,
    });
    expect(sent[1]!.postDataJSON()).toEqual({
      expectedVersion: before.version + 1,
    });
    expect(await sent[1]!.headerValue('idempotency-key')).toMatch(
      IDEMPOTENCY_KEY,
    );
    await expect(
      page.getByText(t.toast.published, { exact: true }),
    ).toBeVisible();
  });

  test('Ctrl+Enter publishes once; with no change only the publish is sent [ux §5]', async ({
    page,
  }) => {
    const current = await readDraft(api, draft.id);
    await page.route(publishUrl(draft.id), (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(opened(current)),
      }),
    );
    const sent = writes(page);
    await open(page);
    const input = field(page, t.titleField.label);
    await input.press('Enter');
    expect(sent).toHaveLength(0);
    await input.press('Control+Enter');
    await expect(page).toHaveURL(new RegExp(`/vacancies/${draft.id}$`));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.postDataJSON()).toEqual({
      expectedVersion: current.version,
    });
  });

  test('a publish the server refuses flags the field, keeps the draft and its values, and «Показати поля» focuses it [ux §5, §4.1]', async ({
    page,
  }) => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route(publishUrl(draft.id), async (route) => {
      await gate;
      await route.fulfill(await problemFulfill(409, 'POSITION_INACTIVE'));
    });
    const sent = writes(page);
    await open(page);
    await publishEdit(page).dblclick();
    release();
    await expect(
      page.getByText(draftsOf.draftErrors.positionInactive, { exact: true }),
    ).toBeVisible();
    expect(publishRequests(sent)).toHaveLength(1);
    await expect(page).toHaveURL(new RegExp(`${draft.id}/edit$`));
    const refusal = toastWith(page, te.toast.refused);
    await expect(refusal).toContainText(te.toast.refusedDescription);
    await field(page, t.titleField.label).focus();
    await refusal.getByRole('button', { name: te.toast.showFields }).click();
    await expect(position(page)).toBeFocused();
    // The failed press released the form: it can be pressed again.
    await expect(publishEdit(page)).not.toHaveAttribute('aria-busy', 'true');
  });

  test('a publish after another tab saved shows the stale alert and leaves the draft a draft [ux §5.1]', async ({
    page,
  }) => {
    await page.route(publishUrl(draft.id), async (route) =>
      route.fulfill(await problemFulfill(409, 'STALE_STATE')),
    );
    await open(page);
    await publishEdit(page).click();
    await expect(staleAlert(page)).toBeVisible();
    await expect(toastWith(page, te.toast.stale)).toHaveCount(1);
    await expect(page).toHaveURL(new RegExp(`${draft.id}/edit$`));
  });

  test('a draft deleted elsewhere says so and returns to the list [ux §5]', async ({
    page,
  }) => {
    await page.route(detailUrl(draft.id), async (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill(await problemFulfill(404, 'NOT_FOUND'))
        : route.fallback(),
    );
    await open(page);
    await field(page, t.location.label).fill('Харків');
    await saveEdit(page).click();
    await expect(toastWith(page, te.toast.gone)).toBeVisible();
    await expect(page).toHaveURL(/\/vacancies(\?|$)/);
    await expect(page).not.toHaveURL(/\/edit/);
  });

  test('a lost connection keeps the typed value and the retry sends the same change again [ux §4.2]', async ({
    page,
  }) => {
    const current = await readDraft(api, draft.id);
    let attempt = 0;
    await page.route(detailUrl(draft.id), async (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback();
      attempt += 1;
      if (attempt === 1) return route.abort('failed');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          patched(
            current,
            route.request().postDataJSON() as { expectedVersion: number },
          ),
        ),
      });
    });
    await open(page);
    const typed = field(page, t.location.label);
    await typed.fill('Харків');
    await saveEdit(page).click();
    await expect(
      page.getByText(t.toast.noConnection, { exact: true }),
    ).toBeVisible();
    await expect(typed).toHaveValue('Харків');
    await expect(page).toHaveURL(new RegExp(`${draft.id}/edit$`));
    await page
      .getByRole('button', { name: t.toast.retry, exact: true })
      .click();
    await expect(page).toHaveURL(draftListUrl(draft.id));
    expect(attempt).toBe(2);
  });

  test('a field the server refuses on the save is flagged and focused, with the values kept [ux §4.1]', async ({
    page,
  }) => {
    await page.route(detailUrl(draft.id), async (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill(
            await problemFulfill(400, 'VALIDATION_FAILED', [
              { path: 'body.location', code: 'too_big' },
            ]),
          )
        : route.fallback(),
    );
    await open(page);
    const typed = field(page, t.location.label);
    await typed.fill('Харків');
    await saveEdit(page).click();
    await expect(
      page.getByText(t.errors.locationLong.replace('{max}', '200'), {
        exact: true,
      }),
    ).toBeVisible();
    await expect(typed).toBeFocused();
    await expect(typed).toHaveValue('Харків');
  });

  test('a rate limit warns, keeps the values and offers no retry [ux §4.2]', async ({
    page,
  }) => {
    await page.route(detailUrl(draft.id), async (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill(await problemFulfill(429, 'RATE_LIMITED'))
        : route.fallback(),
    );
    await open(page);
    const typed = field(page, t.location.label);
    await typed.fill('Харків');
    await saveEdit(page).click();
    const toast = toastWith(page, t.toast.rateLimited);
    await expect(toast).toBeVisible();
    await expect(
      toast.getByRole('button', { name: t.toast.retry }),
    ).toHaveCount(0);
    await expect(typed).toHaveValue('Харків');
  });

  test('a Team Lead or a probation length sent by a Recruiter is 403 FORBIDDEN and leaves the draft at its version [D78, D115]', async () => {
    const before = await readDraft(api, draft.id);
    for (const rest of [{ teamLeadId: randomUUID() }, { probationDays: 60 }]) {
      const refused = await api.patch(`/api/v1/vacancies/${draft.id}`, {
        headers: { ...MUTATION_HEADERS, 'idempotency-key': randomUUID() },
        data: { expectedVersion: before.version, ...rest },
      });
      expect(refused.status()).toBe(403);
      expect(await refused.json()).toMatchObject({ code: 'FORBIDDEN' });
    }
    expect((await readDraft(api, draft.id)).version).toBe(before.version);
  });

  test('the loaded form and its stale warning pass the WCAG 2.1 AA rules [ux §8]', async ({
    page,
  }, testInfo) => {
    await page.route(detailUrl(draft.id), async (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill(await problemFulfill(409, 'STALE_STATE'))
        : route.fallback(),
    );
    await open(page);
    await checkAccessibility(page, testInfo);
    await field(page, t.location.label).fill('Харків');
    await saveEdit(page).click();
    await expect(staleAlert(page)).toBeVisible();
    await checkAccessibility(page, testInfo);
  });

  test('an edit chunk that fails to load reports an error and keeps the form; it works again once the chunk loads [self-check: lazy code]', async ({
    page,
  }) => {
    const current = await readDraft(api, draft.id);
    const chunks = await blockChunksWith(page, 'stale:vacancy:');
    await page.route(detailUrl(draft.id), async (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(
              patched(
                current,
                route.request().postDataJSON() as { expectedVersion: number },
              ),
            ),
          })
        : route.fallback(),
    );
    const sent = writes(page);
    await open(page);
    const typed = field(page, t.location.label);
    await typed.fill('Харків');
    await saveEdit(page).click();
    await expect(
      page.getByText(t.toast.noConnection, { exact: true }),
    ).toBeVisible();
    expect(sent).toHaveLength(0);
    await expect(typed).toHaveValue('Харків');
    await expect(typed).not.toHaveAttribute('readonly', '');
    await expect(saveEdit(page)).not.toHaveAttribute('aria-busy', 'true');
    await expect(page).toHaveURL(new RegExp(`${draft.id}/edit$`));

    chunks.allow();
    await toastWith(page, t.toast.noConnection)
      .getByRole('button', { name: t.toast.retry })
      .click();
    await expect(page).toHaveURL(draftListUrl(draft.id));
    expect(sent).toHaveLength(1);
  });

  test('a stale-alert chunk that fails to load never unmounts the form: the conflict still reaches the user as a toast and the values stay [self-check: lazy code]', async ({
    page,
  }) => {
    await blockChunksWith(page, 'stale.confirmTitle');
    await page.route(detailUrl(draft.id), async (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill(await problemFulfill(409, 'STALE_STATE'))
        : route.fallback(),
    );
    await open(page);
    const typed = field(page, t.location.label);
    await typed.fill('Харків');
    await saveEdit(page).click();
    await expect(toastWith(page, te.toast.stale)).toBeVisible();
    await expect(typed).toHaveValue('Харків');
    await expect(page).toHaveURL(new RegExp(`${draft.id}/edit$`));
    await expect(
      page.getByRole('heading', { name: messages.errors.appErrorTitle }),
    ).toHaveCount(0);
  });

  test('leaving a changed form asks first; the question is gone after «Залишитися» and the change stays [F9b]', async ({
    page,
  }) => {
    await open(page);
    const typed = field(page, t.location.label);
    await typed.fill('Харків');
    await page
      .getByRole('link', { name: messages.common.cancel, exact: true })
      .click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText(messages.common.leaveTitle);
    await dialog
      .getByRole('button', { name: messages.common.leaveStay })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(typed).toHaveValue('Харків');
    await expect(page).toHaveURL(new RegExp(`${draft.id}/edit$`));
  });
});

test.describe('a vacancy that is not a draft [ux §5]', () => {
  test.use({ storageState: sessionFile(AUTHOR) });

  test('shows the reason and the way to the card instead of a form', async ({
    page,
  }, testInfo) => {
    const open = demoVacancy(2);
    const response = await page.goto(editPath(open.id));
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { level: 1, name: te.title, exact: true }),
    ).toBeVisible();
    const alert = page
      .getByRole('alert')
      .filter({ hasText: draftsOf.draftErrors.notDraft });
    await expect(alert).toBeVisible();
    const link = alert.getByRole('link', { name: te.notDraft.link });
    await expect(link).toHaveAttribute('href', `/vacancies/${open.id}`);
    await checkAccessibility(page, testInfo);
    await expect(saveEdit(page)).toHaveCount(0);
    await expect(publishEdit(page)).toHaveCount(0);
    await expect(field(page, t.titleField.label)).toHaveCount(0);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/vacancies/${open.id}$`));
  });

  test('an own cancelled draft opens the same state, not a form [ux §5, D82]', async ({
    page,
  }) => {
    const cancelled = await createDraft(page.request);
    try {
      const answer = await page.request.post(
        `/api/v1/vacancies/${cancelled.id}/cancel`,
        { headers: MUTATION_HEADERS, data: { reason: 'Тест E2E' } },
      );
      expect(answer.status(), await answer.text()).toBe(200);
      const response = await page.goto(editPath(cancelled.id));
      expect(response?.status()).toBe(200);
      await expect(
        page
          .getByRole('alert')
          .filter({ hasText: draftsOf.draftErrors.notDraft }),
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: te.notDraft.link }),
      ).toHaveAttribute('href', `/vacancies/${cancelled.id}`);
      await expect(saveEdit(page)).toHaveCount(0);
      await expect(publishEdit(page)).toHaveCount(0);
    } finally {
      const removed = await page.request.delete(
        `/api/v1/vacancies/${cancelled.id}`,
        { headers: MUTATION_HEADERS, data: {} },
      );
      expect([200, 404], await removed.text()).toContain(removed.status());
    }
  });
});

test.describe('who gets a 404 on /edit [VIS-02, D92]', () => {
  const unknown = '00000000-0000-4000-8000-000000000000';
  const cases = [
    [AUTHOR, 'the draft of another author', demoVacancy(DRAFT_VACANCY).id],
    [
      'head.recruiter.gambling@demo',
      'the draft of the Admin',
      demoVacancy(DRAFT_VACANCY).id,
    ],
    [AUTHOR, 'an id that does not exist', unknown],
    [AUTHOR, 'an id that is no uuid', 'abc'],
    [
      'vasyl.tl@demo',
      'a Team Lead (requests, never authors)',
      demoVacancy(1).id,
    ],
    ['hr@demo', 'an HR user (reads, never authors)', demoVacancy(1).id],
  ] as const;

  for (const [user, name, id] of cases) {
    test(`${user}: ${name}`, async ({ browser }) => {
      const context = await browser.newContext({
        storageState: sessionFile(user),
        baseURL: E2E_ORIGIN,
      });
      try {
        const page = await context.newPage();
        const response = await page.goto(editPath(id));
        expect(response?.status()).toBe(404);
        await expect(notFound(page)).toBeVisible();
        await expect(saveEdit(page)).toHaveCount(0);
      } finally {
        await context.close();
      }
    });
  }
});

test.describe('the Admin edits the same form with the extra fields [D115, D78]', () => {
  test.use({ storageState: sessionFile('admin@demo') });

  test('shows the Team Lead and probation fields on the Admin’s own seeded draft and sends nothing', async ({
    page,
  }) => {
    const sent = writes(page);
    const response = await openHydrated(
      page,
      editPath(demoVacancy(DRAFT_VACANCY).id),
    );
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { level: 1, name: te.title, exact: true }),
    ).toBeVisible();
    await expect(teamLead(page)).toBeVisible();
    await expect(probation(page)).toHaveValue('90');
    await saveEdit(page).click();
    await expect(page).toHaveURL(/\/vacancies\?.*status=DRAFT/);
    expect(sent).toHaveLength(0);
  });
});
