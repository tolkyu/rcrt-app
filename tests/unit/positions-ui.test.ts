// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PositionNameDialog } from '@/components/positions/position-name-dialog';
import { usePositionToggle } from '@/components/positions/position-write';
import { ApiError, apiRequest } from '@/lib/api-client';
import { positionsClientMessages } from '@/lib/i18n/positions-messages';
import { MANAGER_POSITIONS, positionsQuery } from '@/lib/queries/positions';
import {
  POSITION_PER_VERTICAL_LIMIT,
  type Position,
  type PositionList,
} from '@/lib/schemas/position';
import messages from '@/messages/uk.json';

vi.mock('@/lib/api-client', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  apiRequest: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/toast', () => ({ toast }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const VERTICAL = '11111111-1111-4111-8111-111111111111';
const t = messages.positions;
const facebook: Position = {
  id: '00000000-0000-4000-8000-000000000001',
  verticalId: VERTICAL,
  name: 'Медіабаєр — Facebook',
  isActive: true,
  version: 3,
  createdAt: '2026-10-15T09:00:00.000Z',
  openVacanciesCount: 2,
};
const reserved: Position = {
  ...facebook,
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Афілейт Лід',
  isActive: false,
  version: 1,
  openVacanciesCount: 0,
};
const key = positionsQuery(MANAGER_POSITIONS).queryKey;

function seededClient(items: Position[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData<PositionList>(key, { items });
  return client;
}

const intl = (node: ReactNode) =>
  createElement(NextIntlClientProvider, {
    locale: 'uk',
    timeZone: 'Europe/Kyiv',
    messages: positionsClientMessages(messages),
    onError: (error) => {
      throw error;
    },
    children: node,
  });

describe('optimistic toggle keeps the row count [ADR-013 addendum]', () => {
  const setup = () => {
    const client = seededClient([facebook]);
    const wrapper = ({ children }: { children: ReactNode }) =>
      intl(createElement(QueryClientProvider, { client }, children));
    const { result } = renderHook(() => usePositionToggle(), { wrapper });
    const row = () => client.getQueryData<PositionList>(key)?.items[0];
    return { result, row };
  };

  it('flips the row at once, merges the null-count response and keeps the count', async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      ...facebook,
      isActive: false,
      version: 4,
      openVacanciesCount: null,
    });
    const { result, row } = setup();
    await act(() =>
      result.current.mutateAsync({ position: facebook, isActive: false }),
    );
    expect(row()).toMatchObject({
      isActive: false,
      version: 4,
      openVacanciesCount: 2,
    });
    expect(vi.mocked(apiRequest).mock.calls[0]?.[1]).toMatchObject({
      method: 'PATCH',
      body: { expectedVersion: 3, isActive: false },
    });
  });

  it('restores the original row, count included, when the server refuses', async () => {
    vi.mocked(apiRequest).mockRejectedValue(new ApiError(409, 'STALE_STATE'));
    const { result, row } = setup();
    await act(async () => {
      await result.current
        .mutateAsync({ position: facebook, isActive: false })
        .catch(() => undefined);
    });
    expect(row()).toEqual(facebook);
  });
});

describe('create and rename dialog [VAC-01, D76]', () => {
  function mount(node: ReactElement, items: Position[]) {
    const client = seededClient(items);
    render(intl(createElement(QueryClientProvider, { client }, node)));
  }
  const dialog = (target: Position | null, onClose = vi.fn()) =>
    createElement(PositionNameDialog, {
      target,
      verticals: [{ id: VERTICAL, name: 'Гемблінг' }],
      presetVerticalId: undefined,
      onClose,
      onCloseAutoFocus: vi.fn(),
    });

  it('reports a duplicate of an inactive position without a request, showing the stored name', async () => {
    mount(dialog(null), [facebook, reserved]);
    await userEvent.type(
      screen.getByLabelText(t.dialog.nameLabel),
      'АФІЛЕЙТ  лід',
    );
    await userEvent.click(
      screen.getByRole('button', { name: t.dialog.createSubmit }),
    );
    expect(
      await screen.findByText(
        t.dialog.errors.duplicateInactive.replace('{name}', 'Афілейт Лід'),
      ),
    ).toBeTruthy();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('keeps the dialog open with the typed value on a server 409 name conflict', async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      new ApiError(409, 'POSITION_NAME_TAKEN'),
    );
    const onClose = vi.fn();
    mount(dialog(null, onClose), [facebook]);
    const input = screen.getByLabelText(t.dialog.nameLabel);
    await userEvent.type(input, 'Новий  Лід');
    await userEvent.click(
      screen.getByRole('button', { name: t.dialog.createSubmit }),
    );
    expect(
      await screen.findByText(
        t.dialog.errors.duplicate.replace('{name}', 'Новий Лід'),
      ),
    ).toBeTruthy();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect((input as HTMLInputElement).value).toBe('Новий  Лід');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the stale-version alert and swaps in the refreshed current name on rename', async () => {
    const renamedElsewhere = {
      ...facebook,
      name: 'Медіабаєр Meta',
      version: 4,
    };
    vi.mocked(apiRequest).mockImplementation(((path: string) =>
      path.startsWith('/positions?')
        ? Promise.resolve({ items: [renamedElsewhere] })
        : Promise.reject(
            new ApiError(409, 'STALE_STATE'),
          )) as typeof apiRequest);
    mount(dialog(facebook), [facebook]);
    const description = (name: string) =>
      t.dialog.currentName.replace('{name}', name);
    expect(screen.getByText(description(facebook.name))).toBeTruthy();
    const input = screen.getByLabelText(t.dialog.nameLabel);
    await userEvent.clear(input);
    await userEvent.type(input, 'Медіабаєр');
    await userEvent.click(
      screen.getByRole('button', { name: t.dialog.renameSubmit }),
    );
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(t.errors.stale),
    );
    expect(
      await screen.findByText(description(renamedElsewhere.name)),
    ).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith(
      `/positions/${facebook.id}`,
      expect.objectContaining({
        body: { expectedVersion: 3, name: 'Медіабаєр' },
      }),
    );
  });

  it.each([
    ['rate limit', new ApiError(429, 'RATE_LIMITED'), t.errors.rateLimited],
    [
      'per-vertical limit',
      new ApiError(409, 'POSITION_LIMIT_REACHED'),
      t.dialog.errors.limitReached.replace(
        '{max}',
        String(POSITION_PER_VERTICAL_LIMIT),
      ),
    ],
  ])(
    'keeps the dialog open with the typed name and a banner on %s',
    async (_label, failure, text) => {
      vi.mocked(apiRequest).mockRejectedValue(failure);
      const onClose = vi.fn();
      mount(dialog(null, onClose), [facebook]);
      const input = screen.getByLabelText(t.dialog.nameLabel);
      await userEvent.type(input, 'Новий Лід');
      await userEvent.click(
        screen.getByRole('button', { name: t.dialog.createSubmit }),
      );
      expect((await screen.findByRole('alert')).textContent).toContain(text);
      expect((input as HTMLInputElement).value).toBe('Новий Лід');
      expect(onClose).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    },
  );

  it('does not flash a name error while focus leaves through Cancel, but still reports it on a plain blur', async () => {
    const onClose = vi.fn();
    mount(dialog(null, onClose), [facebook]);
    const input = screen.getByLabelText(t.dialog.nameLabel);
    await userEvent.type(input, 'Ф');
    await userEvent.click(
      screen.getByRole('button', { name: messages.settings.common.cancel }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(t.dialog.errors.tooShort)).toBeNull();

    await userEvent.click(input);
    await userEvent.click(
      screen.getByRole('heading', { name: t.dialog.createTitle }),
    );
    expect(await screen.findByText(t.dialog.errors.tooShort)).toBeTruthy();
  });

  it('describes nothing on create, and the current name on rename', () => {
    mount(dialog(null), [facebook]);
    expect(screen.getByRole('dialog').hasAttribute('aria-describedby')).toBe(
      false,
    );
    cleanup();
    mount(dialog(facebook), [facebook]);
    expect(
      screen.getByRole('dialog').getAttribute('aria-describedby'),
    ).toBeTruthy();
  });
});
