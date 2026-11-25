import assert from 'node:assert/strict';
import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { chromium, type APIResponse, type Page } from '@playwright/test';
import { blockValidationChunks } from './lazy-chunks';

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function fixture(
  inspectResponse?: (response: APIResponse) => Promise<void>,
) {
  const pending = deferred();
  let delayed: ServerResponse | undefined;
  const server = createServer((request, response) => {
    if (request.url?.endsWith('/delayed.js')) {
      delayed = response;
      pending.resolve();
      return;
    }
    if (request.url?.endsWith('/reset.js')) {
      request.socket.destroy();
      return;
    }
    response.setHeader('content-type', 'application/javascript');
    response.end(
      request.url?.endsWith('/validation.js')
        ? 'globalThis.ZodError = true;'
        : 'globalThis.chunkLoaded = true;',
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors: unknown[] = [];
  const handled = deferred();
  const register = page.route.bind(page);
  // Observe real handler failures without leaving an unhandled rejection in node:test.
  page.route = async (url, handler, options) => {
    return register(
      url,
      async (route, request) => {
        const fetch = route.fetch.bind(route);
        route.fetch = async (options) => {
          const response = await fetch(options);
          await inspectResponse?.(response);
          return response;
        };
        try {
          await handler(route, request);
        } catch (error) {
          errors.push(error);
          if (!context.isClosed() && !page.isClosed()) await route.abort();
        } finally {
          handled.resolve();
        }
      },
      options,
    );
  };
  return {
    context,
    page,
    errors,
    handled,
    pending,
    url: (name: string) =>
      `http://127.0.0.1:${address.port}/_next/static/chunks/${name}.js`,
    release: () => delayed?.end('globalThis.delayedLoaded = true;'),
    async close() {
      await browser.close();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function requestScript(page: Page, url: string) {
  return page.evaluate((src) => {
    const script = document.createElement('script');
    script.src = src;
    document.head.append(script);
  }, url);
}

for (const tracing of [false, true]) {
  test(
    `body read during context teardown, tracing=${tracing}`,
    { timeout: 15_000 },
    async () => {
      const fetched = deferred();
      const readBody = deferred();
      const f = await fixture(async (response) => {
        const text = response.text.bind(response);
        response.text = async () => {
          fetched.resolve();
          await readBody.promise;
          return text();
        };
      });
      try {
        if (tracing) await f.context.tracing.start({ snapshots: true });
        const dispose = f.context.request.dispose.bind(f.context.request);
        f.context.request.dispose = async (options) => {
          await dispose(options);
          assert.equal(f.context.isClosed(), true);
          assert.equal(f.page.isClosed(), false);
          readBody.resolve();
          await f.handled.promise;
        };
        await blockValidationChunks(f.page);
        await requestScript(f.page, f.url('ordinary'));
        await fetched.promise;
        await f.context.close();
        assert.deepEqual(f.errors, []);
      } finally {
        await f.close();
      }
    },
  );

  test(
    `inflight fetch during context teardown, tracing=${tracing}`,
    { timeout: 15_000 },
    async () => {
      const f = await fixture();
      try {
        if (tracing) await f.context.tracing.start({ snapshots: true });
        await blockValidationChunks(f.page);
        await requestScript(f.page, f.url('delayed'));
        await f.pending.promise;
        await f.context.close();
        await f.handled.promise;
        assert.deepEqual(f.errors, []);
      } finally {
        await f.close();
      }
    },
  );
}

test(
  'blocks validation chunks and executes ordinary chunks',
  { timeout: 15_000 },
  async () => {
    const f = await fixture();
    try {
      const blocked = await blockValidationChunks(f.page);
      const failure = f.page.waitForEvent('requestfailed');
      await requestScript(f.page, f.url('validation'));
      assert.equal((await failure).url(), f.url('validation'));
      assert.deepEqual(blocked, [f.url('validation')]);
      assert.equal(await f.page.evaluate('globalThis.ZodError'), undefined);
      await requestScript(f.page, f.url('ordinary'));
      await f.page.waitForFunction('globalThis.chunkLoaded === true');
      assert.deepEqual(f.errors, []);
    } finally {
      await f.close();
    }
  },
);

test(
  'delayed chunk completes while the test remains active',
  { timeout: 15_000 },
  async () => {
    const f = await fixture();
    try {
      await blockValidationChunks(f.page);
      await requestScript(f.page, f.url('delayed'));
      await f.pending.promise;
      f.release();
      await f.page.waitForFunction('globalThis.delayedLoaded === true');
      assert.deepEqual(f.errors, []);
    } finally {
      await f.close();
    }
  },
);

test(
  'unexpected active network errors still escape the handler',
  { timeout: 15_000 },
  async () => {
    const f = await fixture();
    try {
      await blockValidationChunks(f.page);
      await requestScript(f.page, f.url('reset'));
      await f.handled.promise;
      assert.equal(f.context.isClosed(), false);
      assert.equal(f.page.isClosed(), false);
      assert.equal(f.errors.length, 1);
      assert.match(String(f.errors[0]), /socket hang up|ECONNRESET/);
    } finally {
      await f.close();
    }
  },
);

test(
  'unexpected active disposed body errors still escape the handler',
  { timeout: 15_000 },
  async () => {
    const f = await fixture(async (response) => response.dispose());
    try {
      await blockValidationChunks(f.page);
      await requestScript(f.page, f.url('ordinary'));
      await f.handled.promise;
      assert.equal(f.context.isClosed(), false);
      assert.equal(f.page.isClosed(), false);
      assert.equal(f.errors.length, 1);
      assert.match(String(f.errors[0]), /Response has been disposed/);
    } finally {
      await f.close();
    }
  },
);
