import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { DEMO_VERTICALS } from '../../../server/db/seed';
import type { VacancyDetail } from '../../../lib/schemas/vacancy';
import { MUTATION_HEADERS } from '../../support/e2e-session';
import { OWN_DRAFT_PREFIX, POSITION, t } from './vacancy-create';

export const te = t.edit;
export const saveEdit = (page: Page) =>
  page.getByRole('button', { name: te.actions.save, exact: true });
export const publishEdit = (page: Page) =>
  page.getByRole('button', { name: te.actions.publish, exact: true });
export const editPath = (id: string) => `/vacancies/${id}/edit`;
export const detailUrl = (id: string) => new RegExp(`/api/v1/vacancies/${id}$`);
export const publishUrl = (id: string) =>
  new RegExp(`/api/v1/vacancies/${id}/publish$`);
export const draftListUrl = (id: string) =>
  new RegExp(
    `/vacancies\\?(?=.*status=DRAFT)(?=.*vertical=${DEMO_VERTICALS.gambling})(?=.*vacancy=${id})`,
  );
export const toasts = (page: Page) => page.locator('[data-slot="toast"]');
export const toastWith = (page: Page, title: string) =>
  toasts(page).filter({ hasText: title });

export const write = (key: string = randomUUID()) => ({
  ...MUTATION_HEADERS,
  'idempotency-key': key,
});

export async function activePositionId(api: APIRequestContext) {
  const answer = await api.get(
    `/api/v1/positions?status=active&verticalId=${DEMO_VERTICALS.gambling}`,
  );
  const { items } = (await answer.json()) as {
    items: { id: string; name: string }[];
  };
  const found = items.find((item) => item.name === POSITION);
  expect(found, 'the seeded position is active').toBeDefined();
  return found!.id;
}

/** A real draft of the signed-in user, with a position and values in every group the edit tests read; the title carries the run's prefix so the sweep finds it. */
export async function createDraft(api: APIRequestContext) {
  const answer = await api.post('/api/v1/vacancies', {
    headers: write(),
    data: {
      mode: 'DRAFT',
      verticalId: DEMO_VERTICALS.gambling,
      positionId: await activePositionId(api),
      title: `${OWN_DRAFT_PREFIX} ${Date.now()}`,
      headcount: 3,
      priority: 'URGENT',
      seniority: 'Мідл',
      location: 'Київ',
      salaryMinMinor: '250000',
      salaryMaxMinor: '400050',
      salaryCurrency: 'USD',
    },
  });
  expect(answer.status(), await answer.text()).toBe(201);
  return (await answer.json()) as VacancyDetail;
}

export async function readDraft(api: APIRequestContext, id: string) {
  const answer = await api.get(`/api/v1/vacancies/${id}`);
  expect(answer.status(), await answer.text()).toBe(200);
  return (await answer.json()) as VacancyDetail;
}

/** Another tab saving first: the page under test still holds the old version. */
export async function changeBehindThePage(
  api: APIRequestContext,
  id: string,
  data: Record<string, unknown>,
) {
  const current = await readDraft(api, id);
  const answer = await api.patch(`/api/v1/vacancies/${id}`, {
    headers: write(),
    data: { expectedVersion: current.version, ...data },
  });
  expect(answer.status(), await answer.text()).toBe(200);
  return (await answer.json()) as VacancyDetail;
}

/** What the server would answer, built from the stored draft and the request: contract and UI are exercised without a write. */
export const patched = (
  current: VacancyDetail,
  body: { expectedVersion: number } & Record<string, unknown>,
): VacancyDetail => {
  const { expectedVersion, ...changes } = body;
  return {
    ...current,
    ...changes,
    version: expectedVersion + 1,
    updatedAt: new Date().toISOString(),
  };
};

export const opened = (current: VacancyDetail): VacancyDetail => ({
  ...current,
  status: 'OPEN',
  openedAt: new Date().toISOString(),
  version: current.version + 1,
});
