import { expect, test } from '@playwright/test';

test('health exposes liveness only and prevents response caching', async ({
  request,
}) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['x-powered-by']).toBeUndefined();
});

test('unknown pages use Ukrainian copy and a fresh script nonce', async ({
  page,
  request,
}, testInfo) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(404);
  await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
  await expect(
    page.getByRole('heading', { name: 'Сторінку не знайдено', exact: true }),
  ).toBeVisible();

  const csp = response?.headers()['content-security-policy'];
  const nonce = csp?.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();
  expect(csp).not.toContain('unsafe-eval');
  expect(
    await page
      .locator('script')
      .evaluateAll((scripts) =>
        scripts.every((script) => Boolean(script.nonce)),
      ),
  ).toBe(true);

  const another = await request.get('/missing-page');
  expect(another.status()).toBe(404);
  expect(another.headers()['content-security-policy']).not.toBe(csp);
  for (const path of ['/favicon.ico', '/robots.txt']) {
    const fallback = await request.get(path);
    expect(fallback.status()).toBe(404);
    expect(fallback.headers()['content-security-policy']).toContain(
      "frame-ancestors 'none'",
    );
  }
  const shot = await page.screenshot({
    path: testInfo.outputPath('not-found.png'),
    fullPage: true,
  });
  await testInfo.attach('not-found', { body: shot, contentType: 'image/png' });
});

test('production browser blocks an injected inline script without a nonce', async ({
  page,
}) => {
  await page.route('**/csp-probe', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      '</head>',
      "<script>document.documentElement.dataset.injected = 'yes'</script></head>",
    );
    await route.fulfill({ response, body });
  });
  await page.goto('/csp-probe');
  const executed = await page.evaluate(
    () => document.documentElement.dataset.injected,
  );
  expect(executed).toBeUndefined();
});

test('REST mutations reject cross-origin and missing CSRF headers before routing', async ({
  request,
}) => {
  const invalidHeaders: Record<string, string>[] = [
    {},
    { origin: 'https://evil.test', 'x-csrf-protection': '1' },
    {
      origin: 'http://localhost:3100',
      'x-csrf-protection': '1',
      'content-type': 'text/plain',
    },
  ];
  for (const headers of invalidHeaders) {
    const response = await request.post('/api/v1/verticals', {
      headers,
      data: {},
    });
    expect(response.status()).toBe(403);
    expect(await response.json()).toEqual({
      error: { code: 'CSRF_FORBIDDEN' },
    });
  }
  const allowed = await request.post('/api/v1/verticals', {
    headers: { origin: 'http://localhost:3100', 'x-csrf-protection': '1' },
    data: {},
  });
  expect(allowed.status()).toBe(404);
});
