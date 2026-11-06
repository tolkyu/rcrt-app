// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MfaSetupForm } from '@/components/auth/mfa-setup-form';
import { TotpCodeForm } from '@/components/auth/totp-code-form';
import { apiRequest } from '@/lib/api-client';
import messages from '@/messages/uk.json';

vi.mock('@/lib/api-client', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  apiRequest: vi.fn(),
}));
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

afterEach(() => {
  cleanup();
  vi.mocked(apiRequest).mockReset();
});

describe('MFA setup exits never grant assurance [STORY-SEC-AUTH-5, D63]', () => {
  it('aborts an in-flight verification on exit and ignores its late redirect', async () => {
    let finish!: (reply: { redirectTo: string }) => void;
    vi.mocked(apiRequest).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { unmount } = render(
      createElement(NextIntlClientProvider, {
        locale: 'uk',
        timeZone: 'Europe/Kyiv',
        messages,
        children: createElement(TotpCodeForm, {
          factorId: '1692ead0-7054-4a51-8809-4e9a126e4800',
          next: null,
        }),
      }),
    );
    await userEvent.type(
      screen.getByLabelText(messages.auth.mfa.codeLabel),
      '480215',
    );
    await userEvent.click(
      screen.getByRole('button', { name: messages.auth.mfa.submit }),
    );
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(apiRequest).mock.calls[0]?.[1]?.signal;
    expect(signal?.aborted).toBe(false);
    const before = window.location.href;
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      finish({ redirectTo: '#late-verify' });
    });
    expect(window.location.href).toBe(before);
  });

  for (const state of ['loading', 'error', 'ready'] as const) {
    it.each([
      ['optional', false, messages.auth.mfa.later, '/profile'],
      ['backup', false, messages.common.cancel, '/profile'],
      ['required', false, null, null],
      ['required', true, messages.auth.mfa.skip, '/'],
    ] as const)(
      `${state}: %s (mixed grants %s) offers only the permitted exit`,
      async (mode, canSkip, label, href) => {
        const request = vi.mocked(apiRequest);
        if (state === 'loading') request.mockReturnValue(new Promise(() => {}));
        else if (state === 'error')
          request.mockRejectedValue(new Error('Unavailable'));
        else
          request.mockResolvedValue({
            factorId: '1692ead0-7054-4a51-8809-4e9a126e4800',
            qrCode:
              'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
            secret: 'ELXSNOPLXIKFDJTNLZ4FWH46TDF7EJIN',
          });
        render(
          createElement(NextIntlClientProvider, {
            locale: 'uk',
            timeZone: 'Europe/Kyiv',
            messages,
            children: createElement(MfaSetupForm, {
              mode,
              canSkip,
              next: '/settings/users',
            }),
          }),
        );
        if (state === 'error') await screen.findByRole('alert');
        else if (state === 'ready')
          await screen.findByRole('img', { name: messages.auth.mfa.qrAlt });
        else
          expect(screen.getByRole('status').textContent).toBe(
            messages.auth.mfa.preparing,
          );
        if (label)
          expect(
            screen.getByRole('link', { name: label }).getAttribute('href'),
          ).toBe(href);
        else {
          expect(
            screen.queryByRole('link', { name: messages.auth.mfa.later }),
          ).toBeNull();
          expect(
            screen.queryByRole('link', { name: messages.common.cancel }),
          ).toBeNull();
          expect(
            screen.queryByRole('link', { name: messages.auth.mfa.skip }),
          ).toBeNull();
        }
        expect(request).toHaveBeenCalledTimes(1);
        expect(request.mock.calls[0]?.[0]).toBe('/auth/mfa/enroll');
      },
    );
  }
});
