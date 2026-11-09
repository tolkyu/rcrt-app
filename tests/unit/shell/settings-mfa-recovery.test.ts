// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { AppShell } from '@/components/shell/app-shell';
import { ApiError } from '@/lib/api-client';
import messages from '@/messages/uk.json';

vi.mock('next/navigation', () => ({ usePathname: () => '/settings/users' }));
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children?: ReactNode;
  }) => createElement('a', { href, ...props }, children),
}));
vi.mock('@/components/shell/sidebar', () => ({
  Sidebar: () => null,
  SidebarNav: () => null,
}));
vi.mock('@/components/shell/user-menu', () => ({ UserMenu: () => null }));
vi.mock('@/components/theme/theme-toggle', () => ({ ThemeToggle: () => null }));

afterEach(cleanup);

it.each(['MFA_REQUIRED', 'STALE_STATE'])(
  'only offers verification for %s failures [C05, D63]',
  async (code) => {
    window.history.replaceState(null, '', '/settings/users?status=ACTIVE');
    const client = new QueryClient();
    render(
      createElement(NextIntlClientProvider, {
        locale: 'uk',
        timeZone: 'Europe/Kyiv',
        messages,
        children: createElement(QueryClientProvider, {
          client,
          children: createElement(AppShell, {
            navIds: [],
            verticals: [],
            verticalFilter: 'all',
            initialCollapsed: false,
            children: 'content',
          }),
        }),
      }),
    );
    await act(async () => {
      await client
        .getMutationCache()
        .build(client, {
          mutationFn: () => Promise.reject(new ApiError(401, code)),
        })
        .execute(undefined)
        .catch(() => undefined);
    });
    if (code === 'MFA_REQUIRED') {
      expect((await screen.findByRole('alert')).textContent).toContain(
        messages.settings.mfaRequired,
      );
      expect(
        screen
          .getByRole('link', { name: messages.settings.common.mfaVerify })
          .getAttribute('href'),
      ).toBe('/mfa/verify?next=%2Fsettings%2Fusers%3Fstatus%3DACTIVE');
      expect(window.location.pathname).toBe('/settings/users');
    } else expect(screen.queryByRole('alert')).toBeNull();
  },
);

it('keeps one verification action inside the open dialog, then moves it to the page when closed [C05]', async () => {
  const client = new QueryClient();
  render(
    createElement(NextIntlClientProvider, {
      locale: 'uk',
      timeZone: 'Europe/Kyiv',
      messages,
      children: createElement(QueryClientProvider, {
        client,
        children: createElement(AppShell, {
          navIds: [],
          verticals: [],
          verticalFilter: 'all',
          initialCollapsed: false,
          children: 'content',
        }),
      }),
    }),
  );
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.dataset.state = 'open';
  document.body.append(dialog);
  try {
    await act(async () => {
      await client
        .getMutationCache()
        .build(client, {
          mutationFn: () => Promise.reject(new ApiError(401, 'MFA_REQUIRED')),
        })
        .execute(undefined)
        .catch(() => undefined);
    });
    expect(await screen.findAllByRole('alert')).toHaveLength(1);
    expect(
      dialog.contains(
        screen.getByRole('link', { name: messages.settings.common.mfaVerify }),
      ),
    ).toBe(true);
    await act(async () => {
      dialog.remove();
    });
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(1));
    expect(
      document.querySelector('main')?.contains(
        screen.getByRole('link', {
          name: messages.settings.common.mfaVerify,
        }),
      ),
    ).toBe(true);
  } finally {
    dialog.remove();
  }
});
