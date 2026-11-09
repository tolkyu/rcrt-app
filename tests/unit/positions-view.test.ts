// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactNode } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PositionsView } from '@/components/positions/positions-view';
import { ApiError, apiRequest } from '@/lib/api-client';
import { positionsClientMessages } from '@/lib/i18n/positions-messages';
import { MANAGER_POSITIONS, positionsQuery } from '@/lib/queries/positions';
import type { Position, PositionList } from '@/lib/schemas/position';
import type { ListLayout } from '@/lib/use-list-layout';
import messages from '@/messages/uk.json';

const urlListeners = vi.hoisted(() => new Set<() => void>());
vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useSearchParams: () =>
      new URLSearchParams(
        useSyncExternalStore(
          (listener) => {
            urlListeners.add(listener);
            return () => urlListeners.delete(listener);
          },
          () => window.location.search,
          () => '',
        ),
      ),
  };
});
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
vi.mock('@/lib/api-client', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  apiRequest: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/toast', () => ({ toast }));

const t = messages.positions;
const GAMBLING = '11111111-1111-4111-8111-111111111111';
const CRYPTO = '22222222-2222-4222-8222-222222222222';
const both = [
  { id: GAMBLING, name: 'Гемблінг' },
  { id: CRYPTO, name: 'Крипто' },
];
const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{${key}}`, String(value)),
    template,
  );

let counter = 0;
const position = (overrides: Partial<Position> = {}): Position => {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    verticalId: GAMBLING,
    name: `Посада ${counter}`,
    isActive: true,
    version: 1,
    createdAt: '2026-10-15T09:00:00.000Z',
    openVacanciesCount: 0,
    ...overrides,
  };
};

/** Refetches after a write answer with the list as seeded; a write answers with `write`. */
function answer(items: Position[], write: () => Promise<Position>) {
  vi.mocked(apiRequest).mockImplementation(((path: string) =>
    path.startsWith('/positions?')
      ? Promise.resolve({ items })
      : write()) as typeof apiRequest);
}

const viewport = vi.hoisted(() => ({
  desktop: true,
  listeners: new Set<() => void>(),
}));

function setViewport(desktop: boolean) {
  viewport.desktop = desktop;
  viewport.listeners.forEach((listener) => listener());
}

function tree(
  items: Position[],
  managed: readonly { id: string; name: string }[],
  initialLayout: ListLayout,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData<PositionList>(
    positionsQuery(MANAGER_POSITIONS).queryKey,
    {
      items,
    },
  );
  const element = createElement(NextIntlClientProvider, {
    locale: 'uk',
    timeZone: 'Europe/Kyiv',
    messages: positionsClientMessages(messages),
    // The route ships only these namespaces, so any other key read here is a runtime defect.
    onError: (error) => {
      throw error;
    },
    children: createElement(QueryClientProvider, {
      client,
      children: createElement(PositionsView, {
        managedVerticals: managed,
        defaultVertical: 'all',
        initialLayout,
      }),
    }),
  });
  return { client, element };
}

function mount(
  items: Position[],
  managed: readonly { id: string; name: string }[] = both,
  search = '',
  desktop = true,
) {
  window.history.replaceState(null, '', `/vacancies/positions${search}`);
  viewport.desktop = desktop;
  const { client, element } = tree(items, managed, desktop ? 'table' : 'cards');
  render(element);
  return client;
}

const table = () => screen.getByRole('table');
const bandOf = (name: string) =>
  within(table()).getByRole('heading', {
    level: 2,
    name: new RegExp(`^${name} · `),
  });

beforeEach(() => {
  viewport.desktop = true;
  viewport.listeners.clear();
  vi.stubGlobal('matchMedia', (query: string): Partial<MediaQueryList> => ({
    media: query,
    get matches() {
      return viewport.desktop;
    },
    addEventListener: (_type: string, listener: unknown) =>
      viewport.listeners.add(listener as () => void),
    removeEventListener: (_type: string, listener: unknown) =>
      viewport.listeners.delete(listener as () => void),
  }));
  const replaceState = window.history.replaceState.bind(window.history);
  vi.spyOn(window.history, 'replaceState').mockImplementation(
    (...args: Parameters<History['replaceState']>) => {
      replaceState(...args);
      urlListeners.forEach((listener) => listener());
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('grouped bands [wireframe §1.1, §3]', () => {
  it('keeps a vertical whose positions are all inactive as a band with the inactive note and no create shortcut', () => {
    mount([
      position({ name: 'Афілейт', verticalId: GAMBLING, isActive: false }),
      position({ name: 'Трейдер', verticalId: CRYPTO }),
    ]);
    expect(bandOf('Гемблінг').textContent).toBe(
      'Гемблінг · 0 активних, 1 неактивна',
    );
    expect(within(table()).getByText(t.emptyActive.title)).toBeTruthy();
    expect(within(table()).queryByText(t.groupEmpty)).toBeNull();
    expect(
      within(table()).queryByRole('button', {
        name: fill(t.groupAddLabel, { vertical: 'Гемблінг' }),
      }),
    ).toBeNull();
    expect(bandOf('Крипто').textContent).toBe('Крипто · 1 активна');
    expect(
      screen
        .getAllByRole('status')
        .some((node) => node.textContent === 'Показано 1 посаду'),
    ).toBe(true);
  });

  it.each([
    [0, 3, 'Гемблінг · 0 активних, 3 неактивні'],
    [1, 1, 'Гемблінг · 1 активна, 1 неактивна'],
    [2, 5, 'Гемблінг · 2 активні, 5 неактивних'],
    [4, 0, 'Гемблінг · 4 активні'],
    [21, 22, 'Гемблінг · 21 активна, 22 неактивні'],
    [11, 12, 'Гемблінг · 11 активних, 12 неактивних'],
    [0, 0, 'Гемблінг · 0 активних'],
  ])(
    'counts %i active and %i inactive in the band with the inactive toggle off, with Ukrainian plural forms',
    (active, inactive, label) => {
      mount([
        // Keeps the table on screen when the counted vertical has no active row.
        position({ verticalId: CRYPTO }),
        ...Array.from({ length: active }, () =>
          position({ verticalId: GAMBLING }),
        ),
        ...Array.from({ length: inactive }, () =>
          position({ verticalId: GAMBLING, isActive: false }),
        ),
      ]);
      expect(bandOf('Гемблінг').textContent).toBe(label);
    },
  );

  it('keeps the band counts when the inactive toggle is on', () => {
    mount(
      [
        position({ verticalId: CRYPTO }),
        position({ verticalId: CRYPTO, isActive: false }),
      ],
      both,
      '?inactive=1',
    );
    expect(bandOf('Крипто').textContent).toBe(
      'Крипто · 1 активна, 1 неактивна',
    );
  });

  it('shows a vertical without positions with «Додати посаду» that presets that vertical in the dialog', async () => {
    mount([position({ name: 'Афілейт', verticalId: GAMBLING })]);
    expect(bandOf('Крипто')).toBeTruthy();
    expect(within(table()).getByText(t.groupEmpty)).toBeTruthy();
    await userEvent.click(
      within(table()).getByRole('button', {
        name: fill(t.groupAddLabel, { vertical: 'Крипто' }),
      }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      (
        within(dialog).getByLabelText(
          t.dialog.verticalLabel,
        ) as HTMLSelectElement
      ).value,
    ).toBe(CRYPTO);
  });
});

describe('empty and all-inactive states [wireframe §3]', () => {
  it('explains that every position is inactive and the action reveals them and focuses the toggle', async () => {
    mount(
      [position({ name: 'Афілейт', isActive: false, verticalId: GAMBLING })],
      [both[0]!],
    );
    expect(screen.getByText(t.emptyActive.title)).toBeTruthy();
    await userEvent.click(
      screen.getByRole('button', { name: t.emptyActive.action }),
    );
    expect(window.location.search).toBe('?inactive=1');
    await waitFor(() =>
      expect(
        within(table()).getByRole('rowheader', { name: 'Афілейт' }),
      ).toBeTruthy(),
    );
    const toggle = screen.getByLabelText(t.showInactive) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    expect(document.activeElement).toBe(toggle);
  });

  it('shows the initial empty state, naming the vertical only when several are managed', () => {
    mount([], both, `?vertical=${CRYPTO}`);
    expect(
      screen.getByText(fill(t.emptyVertical.title, { vertical: 'Крипто' })),
    ).toBeTruthy();
    cleanup();
    mount([], [both[0]!]);
    expect(screen.getByText(t.empty.title)).toBeTruthy();
  });
});

describe('open vacancies column [ADR-013, owner 2026-11-09]', () => {
  it('prints the count of OPEN vacancies and a dash when the list carries none, in table and cards', () => {
    const items = [
      position({ name: 'Медіабаєр', openVacanciesCount: 2 }),
      position({ name: 'Саппорт', openVacanciesCount: null }),
    ];
    mount(items, [both[0]!]);
    const media = within(table()).getByRole('rowheader', {
      name: 'Медіабаєр',
    }).parentElement!;
    expect(within(media).getByText('2')).toBeTruthy();
    const support = within(table()).getByRole('rowheader', {
      name: 'Саппорт',
    }).parentElement!;
    expect(within(support).getByText(t.openVacanciesUnknown)).toBeTruthy();
    cleanup();
    mount(items, [both[0]!], '', false);
    expect(
      screen.getAllByText(fill(t.openVacanciesLine, { count: 2 })),
    ).toHaveLength(1);
    expect(
      screen.getAllByText(
        fill(t.openVacanciesLine, { count: t.openVacanciesUnknown }),
      ),
    ).toHaveLength(1);
  });
});

describe('one list layout per viewport [PERF follow-up #1]', () => {
  const items = [position({ name: 'Медіабаєр' })];

  it('renders only the table on desktop and only the cards on a phone', () => {
    mount(items, [both[0]!]);
    expect(screen.getAllByRole('rowheader')).toHaveLength(1);
    expect(screen.queryByRole('list')).toBeNull();
    cleanup();
    mount(items, [both[0]!], '', false);
    expect(screen.queryByRole('table')).toBeNull();
    expect(
      within(screen.getByRole('list')).getAllByRole('listitem'),
    ).toHaveLength(1);
  });

  it('switches layout without a refetch when the viewport crosses the breakpoint', () => {
    mount(items, [both[0]!]);
    act(() => setViewport(false));
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('list')).toBeTruthy();
    act(() => setViewport(true));
    expect(screen.getByRole('table')).toBeTruthy();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it.each<[ListLayout, string, string]>([
    ['table', '<table', '<ul'],
    ['cards', '<ul', '<table'],
  ])(
    'server-renders the %s hint with the list in the markup and without the other layout',
    (layout, present, absent) => {
      const html = renderToString(
        tree([position({ name: 'Медіабаєр' })], [both[0]!], layout).element,
      );
      expect(html).toContain('Медіабаєр');
      expect(html).toContain(present);
      expect(html).not.toContain(absent);
    },
  );

  it('hydrates a table hint on a phone viewport into the cards without a hydration mismatch', async () => {
    window.history.replaceState(null, '', '/vacancies/positions');
    const { element } = tree(
      [position({ name: 'Медіабаєр' })],
      [both[0]!],
      'table',
    );
    const container = document.createElement('div');
    container.innerHTML = renderToString(element);
    document.body.append(container);
    expect(container.querySelector('table')).not.toBeNull();
    viewport.desktop = false;
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    let root: Root | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, element);
      });
      expect(container.querySelector('table')).toBeNull();
      expect(within(container).getAllByRole('listitem').length).toBeGreaterThan(
        0,
      );
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });
});

describe('mid-session 401 MFA_REQUIRED [SEC-CORE-09, wireframe §0]', () => {
  const stored = position({
    name: 'Афілейт',
    isActive: false,
    openVacanciesCount: 1,
  });
  const reactivateButton = () =>
    within(table()).getByRole('button', {
      name: fill(t.reactivateLabel, { name: 'Афілейт' }),
    });

  it('keeps the row as it was, shows the 2FA alert with a way back to this exact page and toasts nothing', async () => {
    answer([stored], () => Promise.reject(new ApiError(401, 'MFA_REQUIRED')));
    mount([stored], [both[0]!], '?inactive=1');
    await userEvent.click(reactivateButton());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(t.errors.mfaRequired);
    expect(
      within(alert)
        .getByRole('link', { name: messages.settings.common.mfaVerify })
        .getAttribute('href'),
    ).toBe(
      `/mfa/verify?next=${encodeURIComponent('/vacancies/positions?inactive=1')}`,
    );
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(
      within(table()).getByText(t.status.inactive, { exact: true }),
    ).toBeTruthy();
    expect(reactivateButton()).toBeTruthy();
  });

  it('shows the alert after a create attempt as well, closes the dialog and hides it again after the next success', async () => {
    answer([stored], () => Promise.reject(new ApiError(401, 'MFA_REQUIRED')));
    mount([stored], [both[0]!], '?inactive=1');
    await userEvent.click(
      screen.getAllByRole('button', { name: t.create })[0]!,
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(
      within(dialog).getByLabelText(t.dialog.nameLabel),
      'Нова посада',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: t.dialog.createSubmit }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      t.errors.mfaRequired,
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    answer([stored], () =>
      Promise.resolve({
        ...stored,
        isActive: true,
        version: 2,
        openVacanciesCount: null,
      }),
    );
    await userEvent.click(reactivateButton());
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});

describe('stale writes re-read the row [ADR-013, wireframe §4]', () => {
  const active = position({ name: 'Медіабаєр', openVacanciesCount: 0 });
  const rejectStale = () => Promise.reject(new ApiError(409, 'STALE_STATE'));
  const deactivateButton = () =>
    within(table()).getByRole('button', {
      name: fill(t.deactivateLabel, { name: 'Медіабаєр' }),
    });
  const confirmDeactivation = async () => {
    await userEvent.click(deactivateButton());
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: t.deactivateDialog.submit }),
    );
    return dialog;
  };

  it('deactivate: a stale answer for a row that is already inactive says so and closes the dialog', async () => {
    answer([{ ...active, isActive: false, version: 2 }], rejectStale);
    mount([active], [both[0]!]);
    await confirmDeactivation();
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(t.toast.alreadyInactive),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('deactivate: a stale answer for a row that is still active keeps the dialog open with the stale alert', async () => {
    answer([{ ...active, version: 2, name: 'Медіабаєр' }], rejectStale);
    mount([active], [both[0]!]);
    const dialog = await confirmDeactivation();
    expect((await within(dialog).findByRole('alert')).textContent).toContain(
      t.errors.stale,
    );
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('reactivate: a stale answer for a row that is already active says so', async () => {
    const stored = { ...active, isActive: false };
    answer([{ ...stored, isActive: true, version: 2 }], rejectStale);
    mount([stored], [both[0]!], '?inactive=1');
    await userEvent.click(
      within(table()).getByRole('button', {
        name: fill(t.reactivateLabel, { name: 'Медіабаєр' }),
      }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(t.toast.alreadyActive),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('reactivate: a stale answer for a row that is still inactive reports the conflict', async () => {
    const stored = { ...active, isActive: false };
    answer([{ ...stored, version: 2 }], rejectStale);
    mount([stored], [both[0]!], '?inactive=1');
    await userEvent.click(
      within(table()).getByRole('button', {
        name: fill(t.reactivateLabel, { name: 'Медіабаєр' }),
      }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(t.errors.stale),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe('leaving the page drops the manager data [SEC-POS-10]', () => {
  it('removes the cached list, with its inactive names and counts, on unmount', () => {
    const client = mount([position({ isActive: false })], [both[0]!]);
    const key = positionsQuery(MANAGER_POSITIONS).queryKey;
    expect(client.getQueryData(key)).toBeDefined();
    cleanup();
    expect(client.getQueryData(key)).toBeUndefined();
  });
});

describe('401 on a list refetch drops the manager data [SEC-POS-10]', () => {
  const inactive = position({ name: 'Афілейт', isActive: false });
  const refetchRefused = (code: string) =>
    vi
      .mocked(apiRequest)
      .mockImplementation(() => Promise.reject(new ApiError(401, code)));

  it('removes the cached list, hides inactive names and counts and shows the 2FA alert for MFA_REQUIRED', async () => {
    const client = mount([inactive], [both[0]!], '?inactive=1');
    expect(within(table()).getByText('Афілейт')).toBeTruthy();
    refetchRefused('MFA_REQUIRED');
    await act(() => client.invalidateQueries({ queryKey: ['positions'] }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(t.errors.mfaRequired);
    expect(within(alert).getByRole('link').getAttribute('href')).toBe(
      `/mfa/verify?next=${encodeURIComponent('/vacancies/positions?inactive=1')}`,
    );
    expect(screen.queryByText('Афілейт')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(
      client.getQueryData(positionsQuery(MANAGER_POSITIONS).queryKey),
    ).toBeUndefined();
  });

  it('removes the cached list and reloads, so the server sends the user to sign in, for any other 401', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    try {
      const client = mount([inactive], [both[0]!], '?inactive=1');
      refetchRefused('SESSION_EXPIRED');
      await act(() => client.invalidateQueries({ queryKey: ['positions'] }));
      expect(reload).toHaveBeenCalledTimes(1);
      expect(
        client.getQueryData(positionsQuery(MANAGER_POSITIONS).queryKey),
      ).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
