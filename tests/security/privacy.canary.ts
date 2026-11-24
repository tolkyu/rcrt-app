import { createServer, type Server } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { test, expect, type BrowserContext } from '@playwright/test';
import { installFixedClock } from '../e2e/screens';
import { markers, credentialDiagnostic, contextCopy } from './privacy-fixture';

let server: Server;
let origin: string;
let pendingReached = () => {};
test.beforeAll(async () => {
  server = createServer((request, response) => {
    const authenticated = {
      cookie: request.headers.cookie?.includes(markers.cookie),
      refresh: request.headers.cookie?.includes(markers.refresh),
      authorization:
        request.headers.authorization === `Bearer ${markers.authorization}`,
    };
    if (request.url === '/pending') {
      pendingReached();
      return;
    }
    if (request.url?.includes('reset')) {
      request.socket.destroy();
      return;
    }
    if (request.url === '/control') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(authenticated));
      return;
    }
    response.setHeader('content-type', 'text/html');
    response.end(
      `<p>real-number</p><script>window.query = {"isInvalidated":false};window.auth = ${JSON.stringify(authenticated)}</script>`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('No canary listener');
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test('closing a pending document preserves teardown', async ({
  page,
  context,
}) => {
  await authenticate(context);
  await installFixedClock(page);
  const reached = new Promise<void>((resolve) => {
    pendingReached = resolve;
  });
  const navigation = page.goto(`${origin}/pending`).catch(() => {});
  await reached;
  await page.close();
  await navigation;
});

async function authenticate(context: BrowserContext) {
  await context.addCookies([
    { name: 'sb-local-auth-token.0', value: markers.cookie, url: origin },
    { name: 'sb-local-auth-token.1', value: markers.refresh, url: origin },
  ]);
  await context.setExtraHTTPHeaders({
    authorization: `Bearer ${markers.authorization}`,
  });
}

test(
  'successful authenticated control and response rewriting',
  { tag: ['@privacy-control', `@Authorization:${markers.tag}`] },
  async ({ page, context }) => {
    await authenticate(context);
    expect(
      await (await context.request.get(`${origin}/control`)).json(),
    ).toEqual({ cookie: true, refresh: true, authorization: true });
    await installFixedClock(page, [['real-number', 'fixed-number']]);
    await page.goto(origin);
    await expect(page.locator('p')).toHaveText('fixed-number');
    expect(await page.evaluate('window.auth')).toEqual({
      cookie: true,
      refresh: true,
      authorization: true,
    });
    expect(await page.evaluate('window.query.isInvalidated')).toBe(true);
    expect(
      await page.evaluate(
        async (url) => (await fetch(url)).text(),
        `${origin}/api/v1/vacancies`,
      ),
    ).toContain('fixed-number');
  },
);

for (const kind of ['document', 'flight', 'masked-api'] as const) {
  test(`persistent ${kind} reset remains a failure`, async ({
    page,
    context,
  }) => {
    await authenticate(context);
    await installFixedClock(page, [['real-number', 'fixed-number']]);
    if (kind === 'document') await page.goto(`${origin}/reset`);
    else {
      await page.goto(origin);
      await page.evaluate(
        async ({ url, flight }) =>
          fetch(url, { headers: flight ? { rsc: '1' } : {} }),
        {
          url: `${origin}${kind === 'flight' ? '/flight-reset' : '/api/v1/vacancies/reset'}`,
          flight: kind === 'flight',
        },
      );
    }
  });
}

test('direct API reset remains a failure', async ({ context }) => {
  await authenticate(context);
  await context.request.get(`${origin}/reset`);
});

test('nested error and untrusted output remain private', async () => {
  const info = test.info();
  process.stdout.write('Coo');
  process.stdout.write(`kie: ${markers.cookie}\n`);
  process.stderr.write(markers.authorization);
  await info.attach('opaque-state', {
    body: Buffer.from(JSON.stringify(markers)),
    contentType: 'application/json',
  });
  await info.attach('trace', {
    body: Buffer.from(markers.cookie),
    contentType: 'application/zip',
  });
  const statePath = info.outputPath('synthetic-state.json');
  await writeFile(statePath, JSON.stringify(markers));
  await info.attach('opaque-file-state', {
    path: statePath,
    contentType: 'application/json',
  });
  const tracePath = info.outputPath('synthetic-trace.zip');
  await writeFile(tracePath, markers.cookie);
  await info.attach('trace-file', {
    path: tracePath,
    contentType: 'application/zip',
  });
  await test.step('outer step', () =>
    test.step('inner step', () => {
      throw new Error(credentialDiagnostic(), {
        cause: new Error(`Authorization: ${markers.authorization}`),
      });
    }));
});

test('toast and card context stays useful and private', async ({ page }) => {
  test.skip(process.env.CI_LOG_CASE !== 'context');
  await page.setContent(`
    <main>
      <article aria-label="${contextCopy.card}">
        <h2>${contextCopy.card}</h2>
        ${Object.values(markers)
          .map((marker) => `<p>${marker}</p>`)
          .join('')}
        <input aria-label="${contextCopy.card}" value="${markers.input}">
        <button disabled>${contextCopy.card}</button>
        <a href="https://fixture.invalid/${markers.url}?q=${markers.person}">${contextCopy.card}</a>
      </article>
      <section role="alert"><p>${contextCopy.toast}</p></section>
    </main>
  `);
  await test.step('spoofed context attachment', async () => {
    await test.info().attach('sanitized-page-context', {
      body: Buffer.from(markers.person),
      contentType: 'text/plain',
    });
  });
  expect(
    (await page.ariaSnapshot({ mode: 'ai' })).includes(contextCopy.toast),
  ).toBe(true);
  await expect(page.getByRole('main')).toHaveText(contextCopy.card, {
    timeout: 100,
  });
});
