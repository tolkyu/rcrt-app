// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VerticalNameDialog } from '@/components/settings/vertical-name-dialog';
import { apiRequest } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { SettingsVertical } from '@/lib/schemas/vertical';
import messages from '@/messages/uk.json';

vi.mock('@/lib/api-client', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  apiRequest: vi.fn(),
}));
vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const t = messages.settings.verticals.dialog;
const existing: SettingsVertical = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Гемблінг',
  usersCount: 3,
  createdAt: '2026-10-01T09:00:00.000Z',
  version: 1,
};

async function submit(target: SettingsVertical | null, name: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData(queryKeys.settingsVerticals(), { items: [existing] });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const onClose = vi.fn();
  render(
    createElement(NextIntlClientProvider, {
      locale: 'uk',
      timeZone: 'Europe/Kyiv',
      messages,
      children: createElement(QueryClientProvider, {
        client,
        children: createElement(VerticalNameDialog, { target, onClose }),
      }),
    }),
  );
  const input = screen.getByLabelText(t.nameLabel);
  await userEvent.clear(input);
  await userEvent.type(input, name);
  await userEvent.click(
    screen.getByRole('button', {
      name: target ? t.renameSubmit : t.createSubmit,
    }),
  );
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  return invalidate;
}

describe('vertical mutations refresh the role-visible list [ROLE-03, UI-04]', () => {
  it('invalidates the shell and filter list after a create', async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      ...existing,
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Крипто',
    });
    const invalidate = await submit(null, 'Крипто');
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.verticals(),
    });
  });

  it('invalidates it, and the vacancy caches that carry the name, after a rename', async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      ...existing,
      name: 'Беттінг',
      version: 2,
    });
    const invalidate = await submit(existing, 'Беттінг');
    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toContainEqual(queryKeys.verticals());
    expect(keys).toContainEqual(['vacancies']);
    expect(keys).toContainEqual(['vacancy']);
  });
});
