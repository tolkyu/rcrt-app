import { expect, type Page } from '@playwright/test';
import { FIXED_CLOCK_ISO } from '../../lib/fixed-clock';
import type { UserDetail, UserEvent, UserPage } from '../../lib/schemas/user';
import type { SettingsVerticalList } from '../../lib/schemas/vertical';

type Role = { role: string; verticalId: string | null };
type Answer = { status: number; json: object } | null;
type Hold = { received: () => void; answer: Promise<NonNullable<Answer>> };

/**
 * «Змінити ролі» against a browser-side copy of a seeded user: the demo data stays untouched, the
 * service itself has integration coverage. `answer` lets a test return an error for the next save;
 * `holdNextDetailFetch` keeps the card's next refetch in flight until the test answers it.
 */
export async function userRolesPage(
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
  const [detailResponse, verticalsResponse] = await Promise.all([
    page.request.get(`/api/v1/users/${person!.id}`),
    page.request.get('/api/v1/settings/verticals'),
  ]);
  const detail = (await detailResponse.json()) as UserDetail;
  const verticals = (await verticalsResponse.json()) as SettingsVerticalList;
  patch(detail);
  const saves: { roles: Role[]; expectedVersion: number }[] = [];
  const events: UserEvent[] = [];
  const state: {
    answer: Answer;
    pause: { received: () => void; released: Promise<void> } | null;
    hold: Hold | null;
  } = { answer: null, pause: null, hold: null };

  await page.route(
    (url) => url.pathname === `/api/v1/users/${detail.id}/events`,
    (route) => route.fulfill({ json: { items: events, nextCursor: null } }),
  );
  await page.route(
    (url) => url.pathname === `/api/v1/users/${detail.id}`,
    async (route) => {
      const hold = state.hold;
      state.hold = null;
      if (!hold) return route.fulfill({ json: detail });
      hold.received();
      await route.fulfill(await hold.answer);
    },
  );
  await page.route(
    (url) => url.pathname === '/api/v1/users',
    async (route) => {
      const original = await route.fetch();
      const data = (await original.json()) as UserPage;
      for (const item of data.items)
        if (item.id === detail.id) item.roles = detail.roles;
      await route.fulfill({ response: original, json: data });
    },
  );
  await page.route(
    (url) => url.pathname === `/api/v1/users/${detail.id}/roles`,
    async (route) => {
      expect(route.request().method()).toBe('PUT');
      const body = route.request().postDataJSON() as {
        roles: Role[];
        expectedVersion: number;
      };
      saves.push(body);
      const pause = state.pause;
      state.pause = null;
      if (pause) {
        pause.received();
        await pause.released;
      }
      const answer = state.answer;
      state.answer = null;
      if (answer) return route.fulfill(answer);
      expect(body.expectedVersion).toBe(detail.version);
      const key = (r: Role) => `${r.role}|${r.verticalId ?? ''}`;
      const before = detail.roles.map((r) => ({
        role: r.role,
        verticalId: r.vertical?.id ?? null,
      }));
      const added = body.roles.filter(
        (r) => !before.some((b) => key(b) === key(r)),
      );
      const removed = before.filter(
        (b) => !body.roles.some((r) => key(b) === key(r)),
      );
      const view = (r: Role) => {
        const vertical = verticals.items.find((v) => v.id === r.verticalId);
        return {
          role: r.role,
          vertical: vertical ? { id: vertical.id, name: vertical.name } : null,
        };
      };
      for (const [type, list] of [
        ['user.role_removed', removed],
        ['user.role_assigned', added],
      ] as const)
        for (const role of list)
          events.unshift({
            id: String(events.length + 1),
            type,
            occurredAt: FIXED_CLOCK_ISO,
            actorKind: 'USER',
            actor: null,
            roles: [view(role)],
            fields: null,
          });
      detail.roles = body.roles.map(view);
      detail.version += 1;
      await route.fulfill({
        json: { version: detail.version, added, removed },
      });
    },
  );
  return {
    detail,
    saves,
    verticalId: (verticalName: string) =>
      verticals.items.find((v) => v.name === verticalName)!.id,
    answerNextSave: (answer: Answer) => {
      state.answer = answer;
    },
    pauseNextSave: () => {
      let received!: () => void;
      let release!: () => void;
      const started = new Promise<void>((resolve) => {
        received = resolve;
      });
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      state.pause = { received, released };
      return { started, release };
    },
    holdNextDetailFetch: () => {
      let received!: () => void;
      let answer!: (value: NonNullable<Answer>) => void;
      const started = new Promise<void>((resolve) => {
        received = resolve;
      });
      state.hold = {
        received,
        answer: new Promise((resolve) => {
          answer = resolve;
        }),
      };
      return { started, answer };
    },
  };
}
