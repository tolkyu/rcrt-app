import { expect, test } from '@playwright/test';

for (const email of ['active@fixture.test', 'unknown@fixture.test']) {
  test(`magic-link request shows the same neutral completion for ${email}`, async ({
    page,
  }) => {
    await page.route('**/api/v1/auth/magic-link', (route) =>
      route.fulfill({ json: { accepted: true } }),
    );
    await page.goto('/login');
    await expect(
      page.getByRole('heading', { name: 'Вхід до Hiring', exact: true }),
    ).toBeVisible();
    await page.getByLabel('Робоча електронна пошта').fill(email);
    await page
      .getByRole('button', {
        name: 'Надіслати посилання для входу',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Перевірте пошту', exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/15 хв/)).toBeVisible();
  });
}

test('login disables repeat submissions while the request is pending', async ({
  page,
}) => {
  let finish: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route('**/api/v1/auth/magic-link', async (route) => {
    await pending;
    await route.fulfill({ json: { accepted: true } });
  });
  await page.goto('/login');
  await page.getByLabel('Робоча електронна пошта').fill('active@fixture.test');
  const submit = page.getByRole('button', {
    name: /Надіслати посилання для входу|Надсилаємо…/,
  });
  await submit.click();
  await expect(submit).toBeDisabled();
  finish();
  await expect(
    page.getByRole('heading', { name: 'Перевірте пошту', exact: true }),
  ).toBeVisible();
});

test('login reports a rate limit and permits retry after an upstream failure', async ({
  page,
}) => {
  let attempts = 0;
  await page.route('**/api/v1/auth/magic-link', async (route) => {
    attempts += 1;
    await route.fulfill(
      attempts === 1
        ? {
            status: 429,
            headers: { 'Retry-After': '30' },
            json: { code: 'RATE_LIMITED', status: 429 },
          }
        : {
            status: 503,
            json: { code: 'AUTH_EMAIL_DELIVERY_FAILED', status: 503 },
          },
    );
  });
  await page.goto('/login');
  await page.getByLabel('Робоча електронна пошта').fill('active@fixture.test');
  const submit = page.getByRole('button', {
    name: /Надіслати посилання для входу|Надсилаємо…/,
  });
  await submit.click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Забагато спроб.' }),
  ).toBeVisible();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Не вдалося надіслати лист' }),
  ).toBeVisible();
  await expect(submit).toBeEnabled();
  expect(attempts).toBe(2);
});

test('confirmation waits for a click and removes the token fragment before sending a POST', async ({
  page,
}) => {
  const token = 'a'.repeat(56);
  const requests: string[] = [];
  const bodies: unknown[] = [];
  let finish: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  page.on('request', (request) => {
    requests.push(request.url());
  });
  await page.route('**/api/v1/auth/confirm', async (route) => {
    expect(route.request().method()).toBe('POST');
    bodies.push(route.request().postDataJSON());
    await pending;
    await route.fulfill({
      status: 401,
      json: { code: 'UNAUTHENTICATED', status: 401 },
    });
  });
  await page.goto(`/auth/confirm#token_hash=${token}&type=email`);
  await expect(
    page.getByRole('heading', { name: 'Підтвердіть вхід', exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/confirm$/);
  expect(bodies).toHaveLength(0);
  const confirm = page.getByRole('button', { name: /Увійти|Входимо…/ });
  await confirm.click();
  await expect(confirm).toBeDisabled();
  finish();
  await expect(
    page.getByText('Посилання недійсне або прострочене. Запросіть нове.', {
      exact: true,
    }),
  ).toBeVisible();
  expect(bodies).toEqual([expect.objectContaining({ token_hash: token })]);
  expect(requests.every((url) => !url.includes(token))).toBe(true);
});

test('confirmation without a token does not call the auth API', async ({
  page,
  request,
}) => {
  let calls = 0;
  await page.route('**/api/v1/auth/confirm', async (route) => {
    calls += 1;
    await route.abort();
  });
  await page.goto('/auth/confirm');
  await expect(
    page.getByText(
      'Посилання неповне. Відкрийте його з листа ще раз або запросіть нове.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Повернутися до входу', exact: true }),
  ).toBeVisible();
  expect(calls).toBe(0);
  expect((await request.get('/api/v1/auth/confirm')).status()).toBe(405);
});

test('delivery failure shows the owner-approved safe error instead of a sent confirmation', async ({
  page,
}) => {
  await page.route('**/api/v1/auth/magic-link', (route) =>
    route.fulfill({
      status: 503,
      json: { code: 'AUTH_EMAIL_DELIVERY_FAILED', status: 503 },
    }),
  );
  await page.goto('/login');
  await page.getByLabel('Робоча електронна пошта').fill('active@fixture.test');
  await page
    .getByRole('button', { name: 'Надіслати посилання для входу', exact: true })
    .click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Не вдалося надіслати лист.' }),
  ).toHaveText('Не вдалося надіслати лист. Спробуйте пізніше.');
  await expect(
    page.getByRole('heading', { name: 'Перевірте пошту', exact: true }),
  ).toHaveCount(0);
});
