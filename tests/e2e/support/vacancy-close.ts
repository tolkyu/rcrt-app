import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { DEMO_VERTICALS } from '../../../server/db/seed';
import type { VacancyDetail } from '../../../lib/schemas/vacancy';
import messages from '../../../messages/uk.json' with { type: 'json' };
import { problemFulfill } from '../../support/problem';
import { COUNT_URL } from './vacancy-draft-actions';
import { OWN_DRAFT_PREFIX } from './vacancy-create';
import { readDraft, write } from './vacancy-edit';

export const tc = messages.vacancies.draft.close;
export const CANCEL_TITLE = tc.cancel.title;

const LIST_URL = /\/api\/v1\/vacancies\?/;

/** The author's cancelled drafts of this project only (its prefix is in the search). */
export const cancelledListPath = (selected?: string) =>
  `/vacancies?status=CANCELLED&vertical=${DEMO_VERTICALS.gambling}&q=${encodeURIComponent(OWN_DRAFT_PREFIX)}${selected ? `&vacancy=${selected}` : ''}`;

export const cancelDialog = (page: Page) =>
  page.getByRole('alertdialog', { name: CANCEL_TITLE });
export const deleteDialog = (page: Page, cancelled = false) =>
  page.getByRole('alertdialog', {
    name: cancelled ? tc.delete.titleCancelled : tc.delete.titleDraft,
  });
export const reasonBox = (page: Page) =>
  page.getByRole('textbox', {
    name: new RegExp(`^${tc.cancel.reasonLabel}`),
  });
export const confirmCancel = (page: Page) =>
  cancelDialog(page).getByRole('button', {
    name: tc.cancel.confirm,
    exact: true,
  });
export const confirmDelete = (page: Page) =>
  page
    .getByRole('alertdialog')
    .getByRole('button', { name: tc.delete.confirm, exact: true });

/** A real cancelled never-opened draft: the API cancel, no UI. */
export async function cancelByApi(
  api: APIRequestContext,
  id: string,
  reason = 'Не потрібна',
) {
  const answer = await api.post(`/api/v1/vacancies/${id}/cancel`, {
    headers: write(),
    data: { reason },
  });
  expect(answer.status(), await answer.text()).toBe(200);
  return (await answer.json()) as VacancyDetail;
}

export type CloseAnswer = 'ok' | 'abort' | { status: number; code: string };

export interface CloseStub {
  readonly requests: { body: unknown }[];
  release: () => void;
}

/**
 * Stands in for the server's cancel or delete, so a dialog can be observed without a write (a real write counts against
 * the user's 30 per minute). While the gate is closed the request waits. Once answered, lists and the count read without
 * the draft, as the real server would; with `abort` only the first attempt is lost.
 */
export async function stubClose(
  page: Page,
  api: APIRequestContext,
  id: string,
  kind: 'cancel' | 'delete',
  answer: CloseAnswer = 'ok',
  { gated = true, countsAsDraft = true } = {},
): Promise<CloseStub> {
  const requests: CloseStub['requests'] = [];
  let release = () => {};
  const gate = gated
    ? new Promise<void>((resolve) => (release = resolve))
    : Promise.resolve();
  let done = false;
  let attempts = 0;
  const url =
    kind === 'cancel'
      ? new RegExp(`/api/v1/vacancies/${id}/cancel$`)
      : new RegExp(`/api/v1/vacancies/${id}$`);
  const method = kind === 'cancel' ? 'POST' : 'DELETE';
  await page.route(url, async (route) => {
    if (route.request().method() !== method) return route.fallback();
    attempts += 1;
    requests.push({ body: route.request().postDataJSON() as unknown });
    await gate;
    if (answer === 'abort' && attempts === 1) return route.abort('failed');
    if (typeof answer === 'object')
      return route.fulfill(await problemFulfill(answer.status, answer.code));
    done = true;
    const stored = kind === 'cancel' ? await readDraft(api, id) : null;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        stored
          ? { ...stored, status: 'CANCELLED', version: stored.version + 1 }
          : { id },
      ),
    });
  });
  await page.route(LIST_URL, async (route) => {
    const response = await route.fetch();
    if (!done || !response.ok()) return route.fulfill({ response });
    const body = (await response.json()) as { items: { id: string }[] };
    return route.fulfill({
      response,
      json: { ...body, items: body.items.filter((item) => item.id !== id) },
    });
  });
  await page.route(COUNT_URL, async (route) => {
    const response = await route.fetch();
    if (!done || !countsAsDraft || !response.ok())
      return route.fulfill({ response });
    const body = (await response.json()) as { count: number };
    return route.fulfill({
      response,
      json: { count: Math.max(0, body.count - 1) },
    });
  });
  return { requests, release };
}
