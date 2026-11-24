// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProfileView } from '@/components/profile/profile-view';
import { ApiError, apiRequest } from '@/lib/api-client';
import { FULL_NAME_MAX } from '@/lib/profile-name';
import { queryKeys } from '@/lib/query-keys';
import type { Me } from '@/lib/schemas/me';
import messages from '@/messages/uk.json';

vi.mock('@/lib/api-client', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  apiRequest: vi.fn(),
}));
vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/components/profile/security-card', () => ({
  SecurityCard: () => null,
}));
vi.mock('@/components/profile/login-history-card', () => ({
  LoginHistoryCard: () => null,
}));
vi.mock('@/components/theme/theme-provider', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}));

afterEach(cleanup);

it('keeps the server name field error after optimistic rollback [ROLE-05, C05]', async () => {
  const me: Me = {
    user: {
      id: '17c2aa02-5893-4c23-b2f5-c5b1bc818d45',
      email: 'vasyl.tl@demo',
      fullName: 'Василь Мороз',
      timezone: 'Europe/Kyiv',
    },
    roles: [],
    grants: [],
    mfaRequired: false,
  };
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData(queryKeys.me(), me);
  vi.mocked(apiRequest).mockRejectedValue(
    new ApiError(400, 'VALIDATION_FAILED', [
      { path: 'body.fullName', code: 'too_big' },
    ]),
  );
  render(
    createElement(NextIntlClientProvider, {
      locale: 'uk',
      timeZone: 'Europe/Kyiv',
      messages,
      children: createElement(QueryClientProvider, {
        client,
        children: createElement(ProfileView),
      }),
    }),
  );
  const input = screen.getByLabelText(messages.profile.nameLabel);
  await userEvent.clear(input);
  await userEvent.type(input, 'Василь Іваненко');
  await userEvent.click(
    screen.getByRole('button', { name: messages.profile.save }),
  );
  await screen.findByText(
    messages.profile.nameTooLong.replace('{max}', String(FULL_NAME_MAX)),
  );
  await waitFor(() =>
    expect((input as HTMLInputElement).value).toBe(me.user.fullName),
  );
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(client.getQueryData<Me>(queryKeys.me())?.user.fullName).toBe(
    me.user.fullName,
  );
});
