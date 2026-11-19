import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { DEMO_VERTICALS } from '../../../server/db/seed';
import type { VacancyDetail } from '../../../lib/schemas/vacancy';
import messages from '../../../messages/uk.json' with { type: 'json' };
import { problemFulfill } from '../../support/problem';
import { OWN_DRAFT_PREFIX } from './vacancy-create';
import { activePositionId, opened, readDraft, write } from './vacancy-edit';

export const ta = messages.vacancies.draft.actions;
export const COUNT_URL = /\/api\/v1\/vacancies\/drafts\/count$/;
const LIST_URL = /\/api\/v1\/vacancies\?/;
const publishRoute = (id: string) =>
  new RegExp(`/api/v1/vacancies/${id}/publish$`);

/** The drafts of this project only: its title prefix is in the search, so the other project's drafts (same user, same time) never shift a neighbour. */
export const draftListPath = (selected?: string) =>
  `/vacancies?status=DRAFT&vertical=${DEMO_VERTICALS.gambling}&q=${encodeURIComponent(OWN_DRAFT_PREFIX)}${selected ? `&vacancy=${selected}` : ''}`;

export async function createOwnDraft(
  api: APIRequestContext,
  label: string,
  withPosition: boolean,
) {
  const answer = await api.post('/api/v1/vacancies', {
    headers: write(),
    data: {
      mode: 'DRAFT',
      verticalId: DEMO_VERTICALS.gambling,
      ...(withPosition ? { positionId: await activePositionId(api) } : {}),
      title: `${OWN_DRAFT_PREFIX} ${label}`,
    },
  });
  expect(answer.status(), await answer.text()).toBe(201);
  return (await answer.json()) as VacancyDetail;
}

const menuLabel = (title: string) => ta.menuLabel.replace('{title}', title);
/** The row's own `⋯`: at 1280 px and up the preview of the selected row has one with the same name. */
export const menuButton = (page: Page, title: string) =>
  page
    .getByRole('region', { name: messages.vacancies.resultsLabel })
    .getByRole('button', { name: menuLabel(title), exact: true });
/** The `⋯` of a card page. */
export const cardMenuButton = (page: Page, title: string) =>
  page.getByRole('button', { name: menuLabel(title), exact: true });
export const rowLink = (page: Page, title: string) =>
  page
    .getByRole('link', { name: title, exact: true })
    .filter({ visible: true });
export const menuItem = (page: Page, name: string) =>
  page.getByRole('menuitem', { name: new RegExp(`^${name}`) });
export const visibleTitles = async (page: Page) =>
  (
    await page
      .locator('a[data-vacancy-link]')
      .filter({ visible: true })
      .allInnerTexts()
  ).map((text) => text.trim());

/** What «Чернетки N» shows; the chip has no number until the count is known. */
export const draftCount = async (page: Page) => {
  const count = page
    .getByRole('radiogroup', { name: messages.vacancies.filterStatus })
    .getByRole('radio', {
      name: new RegExp(`^${messages.vacancies.filterStatuses.DRAFT}`),
    })
    .locator('.tabular-nums');
  await expect(count).toHaveText(/^\d+$/);
  return Number(await count.innerText());
};

/** The chip minus the server's own count. Other workers create and sweep drafts of the same author, so neither number holds still; their difference does. */
export const draftCountOffset = (page: Page, api: APIRequestContext) =>
  expect.poll(async () => {
    const answer = await api.get('/api/v1/vacancies/drafts/count');
    const { count } = (await answer.json()) as { count: number };
    return (await draftCount(page)) - count;
  });

/** A request still held by a closed gate reaches the real server once its route is removed (a failed test once published a draft that way), so the browser goes offline first. */
export async function removeStubs(page: Page) {
  await page.context().setOffline(true);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
}

export interface PublishStub {
  readonly requests: { key: string | undefined; body: unknown }[];
  release: () => void;
}

/**
 * Stands in for the server's publish: a real one cannot be undone (an open vacancy has no delete), so the answer is
 * built from the stored draft. While `gate` is closed the request waits, which is the window the optimistic row is
 * observed in. Once answered, the list and the count read without the draft, as the real server would.
 */
export async function stubPublish(
  page: Page,
  api: APIRequestContext,
  id: string,
  answer: 'ok' | { status: number; code: string } | 'abort' = 'ok',
  { gated = true }: { gated?: boolean } = {},
): Promise<PublishStub> {
  const requests: PublishStub['requests'] = [];
  let release = () => {};
  const gate = gated
    ? new Promise<void>((resolve) => (release = resolve))
    : Promise.resolve();
  let published = false;
  let attempts = 0;
  await page.route(publishRoute(id), async (route) => {
    attempts += 1;
    requests.push({
      key: (await route.request().headerValue('idempotency-key')) ?? undefined,
      body: route.request().postDataJSON() as unknown,
    });
    await gate;
    if (answer === 'abort' && attempts === 1) return route.abort('failed');
    if (typeof answer === 'object')
      return route.fulfill(await problemFulfill(answer.status, answer.code));
    published = true;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(opened(await readDraft(api, id))),
    });
  });
  await page.route(LIST_URL, async (route) => {
    const response = await route.fetch();
    if (!published || !response.ok()) return route.fulfill({ response });
    const body = (await response.json()) as { items: { id: string }[] };
    return route.fulfill({
      response,
      json: { ...body, items: body.items.filter((item) => item.id !== id) },
    });
  });
  await page.route(COUNT_URL, async (route) => {
    const response = await route.fetch();
    if (!published || !response.ok()) return route.fulfill({ response });
    const body = (await response.json()) as { count: number };
    return route.fulfill({
      response,
      json: { count: Math.max(0, body.count - 1) },
    });
  });
  return { requests, release };
}

/** Holds back the server's answer to a click on an edit link (not its prefetch), so the loading boundary the prefetch already stored stays on screen long enough to be read. */
export async function delayEditNavigation(page: Page, ms: number) {
  await page.route(
    (url) => /^\/vacancies\/[0-9a-f-]{36}\/edit$/.test(url.pathname),
    async (route) => {
      const headers = await route.request().allHeaders();
      if (headers['rsc'] && !headers['next-router-prefetch'])
        await new Promise((resolve) => setTimeout(resolve, ms));
      await route.continue();
    },
  );
}

/** Resolves when the loading boundary of the draft's edit page was prefetched; a click before that would wait for the server instead. */
export const editPrefetched = (page: Page, id: string) =>
  page.waitForResponse(
    (response) =>
      response.url().includes(`/vacancies/${id}/edit`) &&
      Boolean(response.request().headers()['next-router-prefetch']),
  );
