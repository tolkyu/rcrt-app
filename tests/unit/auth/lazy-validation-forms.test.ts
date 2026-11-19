// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ComponentType } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/uk.json';

const chunk = vi.hoisted(() => ({
  mode: 'real' as 'real' | 'fail' | 'gated',
  wait: Promise.resolve(),
}));
type Resolve = (...args: unknown[]) => Promise<unknown>;
/** The chunk fails to load, or its resolver is held until released (a mock factory cannot be held: a second concurrent import of it resolves early). */
const validationChunk = async (
  original: () => Promise<Record<string, unknown>>,
  resolverKey: string,
) => {
  if (chunk.mode === 'fail') throw new Error('ChunkLoadError');
  const actual = await original();
  if (chunk.mode === 'real') return actual;
  const resolver = actual[resolverKey] as Resolve;
  return {
    ...actual,
    [resolverKey]: async (...args: unknown[]) => {
      await chunk.wait;
      return resolver(...args);
    },
  };
};
vi.mock('@/components/auth/login-validation', (original) =>
  validationChunk(
    original as () => Promise<Record<string, unknown>>,
    'loginResolver',
  ),
);
vi.mock('@/components/auth/totp-validation', (original) =>
  validationChunk(
    original as () => Promise<Record<string, unknown>>,
    'totpResolver',
  ),
);

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  chunk.mode = 'real';
  fetchMock = vi.fn<typeof fetch>(async (url) =>
    jsonResponse(
      String(url).endsWith('/auth/magic-link')
        ? { accepted: true }
        : { redirectTo: '/vacancies' },
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  vi.resetModules();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const t = messages.auth;
const wrap = (form: ComponentType) =>
  render(
    createElement(NextIntlClientProvider, {
      locale: 'uk',
      timeZone: 'Europe/Kyiv',
      messages,
      children: createElement(form),
    }),
  );

async function loginForm() {
  const { LoginForm } = await import('@/components/auth/login-form');
  wrap(() =>
    createElement(LoginForm, {
      googleEnabled: false,
      reason: null,
      next: null,
    }),
  );
  return {
    field: screen.getByLabelText(t.login.emailLabel),
    submit: () => screen.getByRole('button'),
  };
}

async function totpForm() {
  const { TotpCodeForm } = await import('@/components/auth/totp-code-form');
  wrap(() =>
    createElement(TotpCodeForm, {
      factorId: '1692ead0-7054-4a51-8809-4e9a126e4800',
      next: null,
    }),
  );
  return {
    field: screen.getByLabelText(t.mfa.codeLabel),
    submit: () => screen.getByRole('button'),
  };
}

describe('sign-in form with its validation chunk missing (PERF-04, SEC F3)', () => {
  beforeEach(() => {
    chunk.mode = 'fail';
  });

  it('an empty email shows the Ukrainian «required» message, focuses the field and sends nothing', async () => {
    const { field, submit } = await loginForm();
    await userEvent.click(submit());
    expect(await screen.findByText(t.login.emailRequired)).toBeTruthy();
    expect(document.activeElement).toBe(field);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a malformed email shows the Ukrainian «invalid» message', async () => {
    const { field, submit } = await loginForm();
    await userEvent.type(field, 'not-an-email');
    await userEvent.click(submit());
    expect(await screen.findByText(t.login.emailInvalid)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a valid email still sends nothing: the response schema cannot load, so the server never acts', async () => {
    const { field, submit } = await loginForm();
    await userEvent.type(field, 'ivan@example.com');
    await userEvent.click(submit());
    expect(await screen.findByText(t.genericError)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect((submit() as HTMLButtonElement).disabled).toBe(false);
  });

  it('a malformed MFA code shows the Ukrainian format message and focuses the field', async () => {
    const { field, submit } = await totpForm();
    await userEvent.type(field, '12ab');
    await userEvent.click(submit());
    await waitFor(() =>
      expect(screen.getByText(t.mfa.codeInvalidFormat)).toBeTruthy(),
    );
    expect(document.activeElement).toBe(field);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a well-formed MFA code is not sent either while the response schema is missing', async () => {
    const { field, submit } = await totpForm();
    await userEvent.type(field, '480215');
    await userEvent.click(submit());
    expect(await screen.findByText(t.genericError)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('sign-in form while the validation resolver is still awaited', () => {
  let open: () => void;
  /** Modules are reset per test, so the chunk is loaded here; under load its first import outlasts `waitFor` (the resolver stays held). */
  beforeEach(async () => {
    chunk.mode = 'gated';
    chunk.wait = new Promise<void>((resolve) => {
      open = resolve;
    });
    await Promise.all([
      import('@/components/auth/login-validation'),
      import('@/components/auth/totp-validation'),
    ]);
  });

  it('the login button is disabled while the resolver is awaited and one submit sends one request', async () => {
    const { field, submit } = await loginForm();
    await userEvent.type(field, 'ivan@example.com');
    await userEvent.click(submit());
    await waitFor(() =>
      expect((submit() as HTMLButtonElement).disabled).toBe(true),
    );
    await userEvent.click(submit());
    await userEvent.keyboard('{Enter}');
    open();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(t.login.sentTitle)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('the MFA button is disabled while the resolver is awaited and one submit sends one request', async () => {
    const { field, submit } = await totpForm();
    await userEvent.type(field, '480215');
    await userEvent.click(submit());
    await waitFor(() =>
      expect((submit() as HTMLButtonElement).disabled).toBe(true),
    );
    await userEvent.click(submit());
    open();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/auth/mfa/verify');
  });
});
