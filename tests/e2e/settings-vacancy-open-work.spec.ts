import { expect, test, type Page } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import type { UserDetail, UserPage } from '../../lib/schemas/user';
import { MUTATION_HEADERS, sessionFile } from '../support/e2e-session';

test.use({ storageState: sessionFile('admin@demo') });

const drawerT = messages.settings.users.drawer;
const NAMES = ['Василь Мороз', 'Тарас Лисенко', 'Дмитро Савченко'] as const;

async function userByName(page: Page, name: string) {
  const listing = await page.request.get(
    `/api/v1/users?q=${encodeURIComponent(name)}`,
  );
  expect(listing.status()).toBe(200);
  const person = ((await listing.json()) as UserPage).items.find(
    (item) => item.fullName === name,
  );
  expect(person).toBeDefined();
  const detail = await page.request.get(`/api/v1/users/${person!.id}`);
  return (await detail.json()) as UserDetail;
}

test('deactivating a Team Lead who leads open vacancies is refused with the Ukrainian explanation and changes nothing [ROLE-06, D24, D43, STORY-ROLE-06-1]', async ({
  page,
}) => {
  const before = await userByName(page, 'Василь Мороз');
  await page.goto(
    `/settings/users?q=${encodeURIComponent('Василь Мороз')}&user=${before.id}`,
  );
  const card = page.getByRole('dialog').filter({
    has: page.getByRole('button', { name: drawerT.close, exact: true }),
  });
  await expect(card).toBeVisible();
  await card
    .getByRole('button', { name: drawerT.activation.deactivate })
    .click();
  const dialog = page.getByRole('alertdialog', {
    name: drawerT.activation.deactivateTitle.replace('{name}', 'Василь Мороз'),
  });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole('button', { name: drawerT.activation.deactivate })
    .click();
  await expect(
    page.getByText(drawerT.activation.openWorkReason, { exact: true }),
  ).toBeVisible();
  await expect(dialog).toHaveCount(0);

  const after = await userByName(page, 'Василь Мороз');
  expect(after).toEqual(before);
  expect(after.status).toBe('ACTIVE');
  const events = await page.request.get(`/api/v1/users/${before.id}/events`);
  expect(events.status()).toBe(200);
  expect(
    ((await events.json()) as { items: { type: string }[] }).items.map(
      (event) => event.type,
    ),
  ).not.toContain('user.deactivated');
});

for (const name of NAMES) {
  test(`${name}: the API refuses deactivation and role removal while open vacancy work exists, with an untouched account [ROLE-06, STORY-ROLE-06-1]`, async ({
    page,
  }) => {
    const before = await userByName(page, name);
    const deactivate = await page.request.post(
      `/api/v1/users/${before.id}/deactivate`,
      {
        headers: MUTATION_HEADERS,
        data: { expectedVersion: before.version },
      },
    );
    expect(deactivate.status()).toBe(409);
    expect(((await deactivate.json()) as { code: string }).code).toBe(
      'USER_HAS_OPEN_WORK',
    );

    const demoted = before.roles.map((assignment) => ({
      role: assignment.role === 'TEAM_LEAD' ? 'RECRUITER' : assignment.role,
      verticalId: assignment.vertical?.id ?? null,
    }));
    const removal = await page.request.put(`/api/v1/users/${before.id}/roles`, {
      headers: MUTATION_HEADERS,
      data: { expectedVersion: before.version, roles: demoted },
    });
    expect(removal.status()).toBe(409);
    expect(((await removal.json()) as { code: string }).code).toBe(
      'USER_HAS_OPEN_WORK',
    );

    expect(await userByName(page, name)).toEqual(before);
  });
}
