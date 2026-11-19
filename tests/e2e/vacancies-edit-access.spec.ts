import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequest } from '@playwright/test';
import {
  E2E_ORIGIN,
  MUTATION_HEADERS,
  sessionFile,
  type E2EUser,
} from '../support/e2e-session';
import { openHydrated } from '../support/hydration';
import { DRAFT_VACANCY, demoVacancy } from '../support/vacancy-demo';
import messages from '../../messages/uk.json' with { type: 'json' };
import { notFound } from './support/vacancy-create';
import { editPath, publishEdit, saveEdit } from './support/vacancy-edit';

const ADMIN_DRAFT = demoVacancy(DRAFT_VACANCY);
const OPEN_VACANCY = demoVacancy(1);

type Route = { id: string };
const targets = { draft: ADMIN_DRAFT, open: OPEN_VACANCY } as const;

/** Users who hold no authoring role anywhere: the routes hide the draft endpoints from them before reading any input. */
const NON_AUTHORS: readonly E2EUser[] = [
  'hr@demo',
  'head.hr@demo',
  'finance@demo',
  'vasyl.tl@demo',
  'taras.tl@demo',
];

const pageCases: readonly [E2EUser, keyof typeof targets, string][] = [
  ['recruiter1.gambling@demo', 'draft', "another author's draft"],
  ['head.recruiter.gambling@demo', 'draft', "the Admin's draft (D92)"],
  ['recruiter.crypto@demo', 'draft', 'a draft of another vertical'],
  ['recruiter.crypto@demo', 'open', 'a vacancy of another vertical'],
  ['finance@demo', 'draft', 'Finance (statistics only)'],
  ['finance@demo', 'open', 'Finance (statistics only)'],
  ['head.hr@demo', 'draft', 'Head HR (reads, never authors)'],
  ['head.hr@demo', 'open', 'Head HR (reads, never authors)'],
  ['vasyl.tl@demo', 'open', 'the Team Lead of that very vacancy'],
  ['taras.tl@demo', 'draft', 'a Team Lead of the vertical'],
];

test.describe('the edit page answers an HTTP 404 to everyone but the author in the vertical [VIS-02, D92, D98]', () => {
  for (const [user, target, name] of pageCases) {
    test(`${user} on the ${target} vacancy: ${name}`, async ({ browser }) => {
      const context = await browser.newContext({
        storageState: sessionFile(user),
        baseURL: E2E_ORIGIN,
      });
      try {
        const page = await context.newPage();
        const response = await page.goto(editPath(targets[target].id));
        expect(response?.status()).toBe(404);
        // A caller who may read the vacancy but not author it learns nothing from the 404 body [security F2].
        const html = await response!.text();
        // The catalogue holds the sample «V-0001» and the position names as plain copy, so the data is looked for as a field of the vacancy payload.
        for (const key of ['number', 'title'] as const)
          expect(html).not.toMatch(
            new RegExp(`${key}\\W{1,6}${targets[target][key]}`),
          );
        await expect(notFound(page)).toBeVisible();
        await expect(saveEdit(page)).toHaveCount(0);
        await expect(publishEdit(page)).toHaveCount(0);
      } finally {
        await context.close();
      }
    });
  }

  test('a Head Recruiter of the vertical gets the not-a-draft state for a published vacancy, never a form', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: sessionFile('head.recruiter.gambling@demo'),
      baseURL: E2E_ORIGIN,
    });
    try {
      const page = await context.newPage();
      const response = await page.goto(editPath(OPEN_VACANCY.id));
      expect(response?.status()).toBe(200);
      await expect(
        page
          .getByRole('alert')
          .filter({ hasText: messages.vacancies.draftErrors.notDraft }),
      ).toBeVisible();
      await expect(saveEdit(page)).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});

const write = (key: string = randomUUID()) => ({
  ...MUTATION_HEADERS,
  'idempotency-key': key,
});

type Expected = { status: number; code: string };
const NOT_FOUND: Expected = { status: 404, code: 'NOT_FOUND' };
const NOT_DRAFT: Expected = { status: 409, code: 'VACANCY_NOT_DRAFT' };

async function attempt(
  request: APIRequest,
  user: E2EUser,
  operation: 'PATCH' | 'PUBLISH',
  route: Route,
) {
  const api = await request.newContext({
    baseURL: E2E_ORIGIN,
    storageState: sessionFile(user),
  });
  try {
    const answer =
      operation === 'PATCH'
        ? await api.patch(`/api/v1/vacancies/${route.id}`, {
            headers: write(),
            data: { expectedVersion: 1, title: 'Чужа правка' },
          })
        : await api.post(`/api/v1/vacancies/${route.id}/publish`, {
            headers: write(),
            data: { expectedVersion: 1 },
          });
    const body = (await answer.json()) as { code: string };
    return { status: answer.status(), code: body.code };
  } finally {
    await api.dispose();
  }
}

test.describe('PATCH and publish answer the exact code per role [SEC-VC-05, D92, D98]', () => {
  for (const user of NON_AUTHORS)
    for (const [label, route] of Object.entries(targets))
      for (const operation of ['PATCH', 'PUBLISH'] as const)
        test(`${user} ${operation} on the ${label} vacancy is 404 NOT_FOUND`, async ({
          playwright,
        }) => {
          expect(
            await attempt(playwright.request, user, operation, route),
          ).toEqual(NOT_FOUND);
        });

  const authoring: readonly [
    E2EUser,
    'PATCH' | 'PUBLISH',
    keyof typeof targets,
    Expected,
    string,
  ][] = [
    [
      'recruiter1.gambling@demo',
      'PATCH',
      'draft',
      NOT_FOUND,
      "another author's draft",
    ],
    [
      'head.recruiter.gambling@demo',
      'PATCH',
      'draft',
      NOT_FOUND,
      "the Admin's draft",
    ],
    [
      'recruiter.crypto@demo',
      'PUBLISH',
      'draft',
      NOT_FOUND,
      'a draft of another vertical',
    ],
    [
      'recruiter.crypto@demo',
      'PATCH',
      'open',
      NOT_FOUND,
      'a vacancy of another vertical',
    ],
    [
      'head.recruiter.gambling@demo',
      'PATCH',
      'open',
      NOT_DRAFT,
      'a published vacancy in the vertical',
    ],
    [
      'recruiter1.gambling@demo',
      'PUBLISH',
      'open',
      NOT_DRAFT,
      'a published vacancy in the vertical',
    ],
  ];
  for (const [user, operation, label, expected, name] of authoring)
    test(`${user} ${operation} on ${name} is ${expected.status} ${expected.code}`, async ({
      playwright,
    }) => {
      expect(
        await attempt(playwright.request, user, operation, targets[label]),
      ).toEqual(expected);
    });
});

test.describe('the card keeps its own loading boundary after the move into (card) [S3.3]', () => {
  test.use({ storageState: sessionFile('head.recruiter.gambling@demo') });

  test('a client navigation to the card shows the content skeleton while the page loads, then the card', async ({
    page,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      'the list does not prefetch its card links; only the desktop preview link caches the loading boundary',
    );
    const card = demoVacancy(11);
    const path = `/vacancies/${card.id}`;
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let prefetched = false;
    let held = false;
    await page.route(
      (url) => url.pathname === path && url.searchParams.has('_rsc'),
      async (route) => {
        if (route.request().headers()['next-router-prefetch'] === undefined) {
          held = true;
          await released;
        } else prefetched = true;
        await route.continue();
      },
    );
    await openHydrated(page, '/vacancies');
    await expect.poll(() => prefetched).toBe(true);
    await page.locator(`a[href^="${path}"]`).first().click();
    await expect.poll(() => held).toBe(true);
    await expect(
      page.getByRole('status').filter({ hasText: messages.states.loading }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 1, name: card.title }),
    ).toHaveCount(0);

    release();
    await expect(
      page.getByRole('heading', { level: 1, name: card.title }),
    ).toBeVisible();
    await expect(
      page.getByRole('status').filter({ hasText: messages.states.loading }),
    ).toHaveCount(0);
  });
});
