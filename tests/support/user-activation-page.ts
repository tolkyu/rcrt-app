import { expect, type Page } from '@playwright/test';
import { FIXED_CLOCK_ISO } from '../../lib/fixed-clock';
import type { UserDetail, UserEvent, UserPage } from '../../lib/schemas/user';

type Role = { role: string; verticalId: string | null };
type Answer = { status: number; json: object } | null;
export type ActivationPost =
  | { action: 'deactivate'; expectedVersion: number; reason?: string }
  | { action: 'reactivate'; expectedVersion: number; roles: Role[] };

/**
 * «Деактивувати» / «Активувати знову» against a browser-side copy of a seeded user: the POSTs never
 * reach the server, so no demo account is banned or unbanned (service + provider ordering have
 * integration coverage). `answerNext` queues an error for the next POST.
 */
export async function userActivationPage(
  page: Page,
  name: string,
  patch: (detail: UserDetail) => void = () => undefined,
) {
  const listing = await page.request.get(
    `/api/v1/users?q=${encodeURIComponent(name)}`,
  );
  expect(listing.status()).toBe(200);
  const person = ((await listing.json()) as UserPage).items.find(
    (item) => item.fullName === name,
  );
  expect(person).toBeDefined();
  const response = await page.request.get(`/api/v1/users/${person!.id}`);
  expect(response.status()).toBe(200);
  const detail = (await response.json()) as UserDetail;
  detail.activatedAt ??= FIXED_CLOCK_ISO;
  patch(detail);
  const posts: ActivationPost[] = [];
  const events: UserEvent[] = [];
  const answers: Answer[] = [];

  await page.route(
    (url) => url.pathname === `/api/v1/users/${detail.id}/events`,
    (route) => route.fulfill({ json: { items: events, nextCursor: null } }),
  );
  await page.route(
    (url) => url.pathname === `/api/v1/users/${detail.id}`,
    (route) => route.fulfill({ json: detail }),
  );
  await page.route(
    (url) => url.pathname === '/api/v1/users',
    async (route) => {
      const original = await route.fetch();
      const data = (await original.json()) as UserPage;
      for (const item of data.items)
        if (item.id === detail.id) {
          item.status = detail.status;
          item.roles = detail.roles;
        }
      await route.fulfill({ response: original, json: data });
    },
  );
  await page.route(
    (url) =>
      url.pathname === `/api/v1/users/${detail.id}/deactivate` ||
      url.pathname === `/api/v1/users/${detail.id}/reactivate`,
    async (route) => {
      expect(route.request().method()).toBe('POST');
      const action = new URL(route.request().url()).pathname.endsWith(
        '/deactivate',
      )
        ? 'deactivate'
        : 'reactivate';
      const body = route.request().postDataJSON() as {
        expectedVersion: number;
        reason?: string;
        roles?: Role[];
      };
      posts.push({ action, ...body } as ActivationPost);
      const answer = answers.shift() ?? null;
      if (answer) {
        if (answer.status === 503 && action === 'deactivate') {
          // Local denial commits before the provider failure is reported (ADR-011).
          detail.status = 'DEACTIVATED';
          detail.version += 1;
        }
        return route.fulfill({
          status: answer.status,
          contentType: 'application/problem+json',
          json: answer.json,
        });
      }
      expect(body.expectedVersion).toBe(detail.version);
      const wasActive = detail.status === 'ACTIVE';
      if (action === 'deactivate') {
        if (wasActive) {
          detail.status = 'DEACTIVATED';
          detail.deactivatedAt = FIXED_CLOCK_ISO;
          detail.version += 1;
        }
      } else {
        const kept = body.roles ?? [];
        detail.roles = detail.roles.filter((role) =>
          kept.some(
            (k) =>
              k.role === role.role &&
              k.verticalId === (role.vertical?.id ?? null),
          ),
        );
        detail.status = 'ACTIVE';
        detail.deactivatedAt = null;
        detail.version += 1;
      }
      if (wasActive || action === 'reactivate')
        events.unshift({
          id: String(events.length + 1),
          type:
            action === 'deactivate' ? 'user.deactivated' : 'user.reactivated',
          occurredAt: FIXED_CLOCK_ISO,
          actorKind: 'USER',
          actor: null,
          roles: null,
          fields: null,
          priorityChange: null,
        });
      await route.fulfill({
        json: {
          version: detail.version,
          status: action === 'deactivate' ? 'DEACTIVATED' : 'ACTIVE',
        },
      });
    },
  );
  return {
    detail,
    posts,
    answerNext: (answer: Answer) => {
      answers.push(answer);
    },
  };
}
