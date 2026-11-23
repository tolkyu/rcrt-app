// @vitest-environment jsdom
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  createElement,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppLayout from '@/app/(app)/layout';
import type { AuthContext } from '@/server/authz/context';
import type { VerifiedIdentity } from '@/server/context/identity';
import { ME, OTHER, roleContext } from './authz/fixtures';

const { session, serverClient } = vi.hoisted(() => ({
  session:
    vi.fn<() => Promise<{ auth: AuthContext; identity: VerifiedIdentity }>>(),
  serverClient: vi.fn<() => QueryClient>(),
}));
vi.mock('@/app/(app)/_lib/session', () => ({ requireSession: session }));
vi.mock('@/server/query/query-client', () => ({
  getQueryClient: serverClient,
}));
vi.mock('@/server/services/me', () => ({
  getMe: async () => ({ id: 'verified-principal' }),
}));
vi.mock('@/app/(app)/_lib/verticals', () => ({
  getVisibleVerticals: async () => ({ items: [], readable: false }),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock('next-intl/server', () => ({ getMessages: async () => ({}) }));
vi.mock('next-intl', () => ({
  NextIntlClientProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/shell/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }));

const SESSION = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const NEW_SESSION = '8b1f5a0e-0c2d-4f6e-9d7a-2b3c4d5e6f70';
const identity = (
  sessionId = SESSION,
  aal: VerifiedIdentity['aal'] = 'aal1',
): VerifiedIdentity => ({
  authUserId: '3f1e2d3c-4b5a-4968-8776-655443322110',
  sessionId,
  aal,
});
const privateKey = ['vacancy', 'private', 'content'];
const clients: QueryClient[] = [];
let latest: QueryClient | undefined;
function Probe() {
  const client = useQueryClient();
  useLayoutEffect(() => {
    latest = client;
  }, [client]);
  const [buffer, setBuffer] = useState('clean');
  return createElement(
    'button',
    {
      onClick: () => {
        client.setQueryData(privateKey, 'old private documents');
        setBuffer('dirty');
      },
    },
    buffer,
  );
}
const activeClient = () => {
  if (!latest) throw new Error('Expected the mounted provider client');
  return latest;
};
beforeEach(async () => {
  vi.clearAllMocks();
  latest = undefined;
  const { QueryClient } = await import('@tanstack/react-query');
  serverClient.mockImplementation(() => {
    const client = new QueryClient();
    clients.push(client);
    return client;
  });
  session.mockResolvedValue({
    auth: roleContext('RECRUITER'),
    identity: identity(),
  });
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  latest?.clear();
});
const layout = () => AppLayout({ children: createElement(Probe) });

describe('verified application identity owns the QueryClient before hydration [ADR-020]', () => {
  it('same actor/session preserves the client and local editor memory through role refresh and MFA step-up', async () => {
    const view = render(await layout());
    const original = activeClient();
    fireEvent.click(screen.getByRole('button', { name: 'clean' }));
    session.mockResolvedValue({
      auth: { ...roleContext('HEAD_RECRUITER', 'aal2'), userId: ME },
      identity: identity(SESSION, 'aal2'),
    });
    view.rerender(await layout());
    expect(activeClient()).toBe(original);
    expect(activeClient().getQueryData(privateKey)).toBe(
      'old private documents',
    );
    expect(screen.getByRole('button', { name: 'dirty' })).toBeDefined();
  });
  it.each(['actor', 'session'] as const)(
    'a different %s remounts the client and protected component state',
    async (changed) => {
      const view = render(await layout());
      const original = activeClient();
      fireEvent.click(screen.getByRole('button', { name: 'clean' }));
      session.mockResolvedValue({
        auth: {
          ...roleContext('RECRUITER'),
          userId: changed === 'actor' ? OTHER : ME,
        },
        identity: identity(changed === 'session' ? NEW_SESSION : SESSION),
      });
      view.rerender(await layout());
      expect(activeClient()).not.toBe(original);
      expect(activeClient().getQueryData(privateKey)).toBeUndefined();
      expect(screen.getByRole('button', { name: 'clean' })).toBeDefined();
    },
  );
  it('a late old-client completion cannot populate the new session client', async () => {
    const view = render(await layout());
    const original = activeClient();
    let resolve: (value: string) => void = () => {};
    const pending = original.fetchQuery({
      queryKey: privateKey,
      queryFn: () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    });
    session.mockResolvedValue({
      auth: roleContext('RECRUITER'),
      identity: identity(NEW_SESSION),
    });
    view.rerender(await layout());
    resolve('late old-session documents');
    await pending;
    expect(activeClient()).not.toBe(original);
    expect(activeClient().getQueryData(privateKey)).toBeUndefined();
    original.clear();
  });
  it('an ended session cannot render a provider through a fallback identity', async () => {
    const denied = new Error('NEXT_REDIRECT: /session-expired');
    session.mockRejectedValueOnce(denied);
    await expect(layout()).rejects.toBe(denied);
    expect(latest).toBeUndefined();
    expect(serverClient).not.toHaveBeenCalled();
  });
});
