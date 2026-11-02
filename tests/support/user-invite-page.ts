import { expect, type Page } from '@playwright/test';
import { FIXED_CLOCK_ISO } from '../../lib/fixed-clock';
import type { UserDetail, UserEvent, UserPage } from '../../lib/schemas/user';

const NOW = Date.parse(FIXED_CLOCK_ISO);
const HOUR = 3_600_000;
const at = (hours: number) => new Date(NOW + hours * HOUR).toISOString();

/** Browser-only state changes leave the permanent demo invitee untouched; real service transitions have integration coverage. */
export async function userInvitePage(
  page: Page,
  options: { noRoles?: boolean; delivered?: boolean } = {},
) {
  const response = await page.request.get('/api/v1/users?q=Богдан');
  expect(response.status()).toBe(200);
  const listing = (await response.json()) as UserPage;
  const person = listing.items.find(
    (item) => item.fullName === 'Богдан Поліщук',
  );
  expect(person).toBeDefined();
  const detailResponse = await page.request.get(`/api/v1/users/${person!.id}`);
  expect(detailResponse.status()).toBe(200);
  const detail = (await detailResponse.json()) as UserDetail;
  detail.status = 'INVITE_EXPIRED';
  detail.createdAt = at(-168);
  detail.invitation = {
    sentAt: at(-73),
    expiresAt: at(-1),
    resendCount: 0,
    revokedAt: null,
    revokedBy: null,
  };
  if (options.noRoles) detail.roles = [];
  const posts: string[] = [];
  const events: UserEvent[] = [
    {
      id: '1',
      type: 'user.invited',
      occurredAt: at(-73),
      actorKind: 'USER',
      actor: null,
      roles: null,
      fields: null,
    },
  ];
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
          item.inviteExpiresAt = detail.invitation?.expiresAt ?? null;
        }
      await route.fulfill({ response: original, json: data });
    },
  );
  await page.route(
    (url) => url.pathname.startsWith(`/api/v1/users/${detail.id}/invite`),
    async (route) => {
      expect(route.request().method()).toBe('POST');
      expect(route.request().postDataJSON()).toEqual({});
      const path = new URL(route.request().url()).pathname;
      posts.push(path);
      if (path.endsWith('/revoke')) {
        events.unshift({
          id: String(events.length + 1),
          type: 'user.invite_revoked',
          occurredAt: FIXED_CLOCK_ISO,
          actorKind: 'USER',
          actor: null,
          roles: null,
          fields: null,
        });
        detail.status = 'REVOKED';
        detail.invitation!.revokedAt = FIXED_CLOCK_ISO;
        detail.invitation!.revokedBy = {
          id: '00000000-0000-4000-8000-000000000111',
          fullName: 'Іван Коваленко',
          isActive: true,
        };
        await route.fulfill({
          json: {
            inviteId: '00000000-0000-4000-8000-000000000112',
            revokedAt: FIXED_CLOCK_ISO,
          },
        });
        return;
      }
      const resent = path.endsWith('/resend');
      events.unshift({
        id: String(events.length + 1),
        type: resent ? 'user.invite_resent' : 'user.reinvited',
        occurredAt: FIXED_CLOCK_ISO,
        actorKind: 'USER',
        actor: null,
        roles: null,
        fields: null,
      });
      detail.status = 'INVITED';
      detail.invitation = {
        sentAt: FIXED_CLOCK_ISO,
        expiresAt: at(72),
        resendCount: resent ? detail.invitation!.resendCount + 1 : 0,
        revokedAt: null,
        revokedBy: null,
      };
      await route.fulfill({
        status: resent ? 200 : 201,
        json: {
          inviteId: '00000000-0000-4000-8000-000000000113',
          expiresAt: at(72),
          delivered: options.delivered ?? true,
        },
      });
    },
  );
  return { detail, posts };
}
