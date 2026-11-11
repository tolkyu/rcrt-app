// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { AppToast } from '@/components/ui/app-toast';
import ToastRuntime from '@/components/ui/sonner-runtime';
import { toast as appToast } from '@/lib/toast';
import messages from '@/messages/uk.json';

const sonner = vi.hoisted(() => ({
  dismiss: vi.fn(),
  custom: vi.fn(),
  toasterProps: [] as Record<string, unknown>[],
}));
vi.mock('sonner', () => ({
  toast: { dismiss: sonner.dismiss, custom: sonner.custom },
  Toaster: (props: Record<string, unknown>) => {
    sonner.toasterProps.push(props);
    return null;
  },
}));

const withIntl = (node: ReactElement) =>
  createElement(NextIntlClientProvider, {
    locale: 'uk',
    timeZone: 'Europe/Kyiv',
    messages,
    children: node,
  });

beforeEach(() => {
  sonner.dismiss.mockReset();
  sonner.custom.mockClear();
  sonner.toasterProps.length = 0;
});
afterEach(cleanup);

describe('AppToast [UI foundation F7]', () => {
  it.each([
    ['success', null, 'lucide-circle-check', 'bg-success-subtle'],
    ['info', null, 'lucide-info', 'bg-info-subtle'],
    ['warning', null, 'lucide-triangle-alert', 'bg-warning-subtle'],
    ['error', 'alert', 'lucide-circle-x', 'bg-destructive-subtle'],
  ] as const)(
    'renders the %s tone with role %s (the Sonner region is already polite) and its icon in a tinted circle',
    (tone, role, icon, tint) => {
      render(
        withIntl(
          createElement(AppToast, {
            id: 't1',
            tone,
            title: 'Вакансію опубліковано',
            description: 'V-0015 · Медіабаєр — Facebook',
          }),
        ),
      );
      const element = document.querySelector<HTMLElement>(
        '[data-slot="toast"]',
      )!;
      expect(element.getAttribute('role')).toBe(role);
      expect(screen.queryAllByRole('status')).toHaveLength(0);
      expect(element.getAttribute('data-tone')).toBe(tone);
      expect(within(element).getByText('Вакансію опубліковано')).toBeTruthy();
      expect(
        within(element).getByText('V-0015 · Медіабаєр — Facebook'),
      ).toBeTruthy();
      const svg = element.querySelector('svg.' + icon);
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
      expect(svg?.parentElement?.className).toContain(tint);
      expect(svg?.parentElement?.className).toContain('rounded-full');
    },
  );

  it('omits the description and the action when they are not given', () => {
    render(
      withIntl(
        createElement(AppToast, { id: 't2', tone: 'info', title: 'Готово' }),
      ),
    );
    const element = document.querySelector<HTMLElement>('[data-slot="toast"]')!;
    expect(element.querySelectorAll('p')).toHaveLength(1);
    expect(within(element).getAllByRole('button')).toHaveLength(1);
  });

  it('clamps a long description to two lines and lets the title wrap', () => {
    render(
      withIntl(
        createElement(AppToast, {
          id: 't3',
          tone: 'error',
          title: 'Дуже довгий заголовок',
          description: 'Дуже довгий опис',
        }),
      ),
    );
    expect(screen.getByText('Дуже довгий опис').className).toContain(
      'line-clamp-2',
    );
    expect(screen.getByText('Дуже довгий заголовок').className).toContain(
      'overflow-wrap:anywhere',
    );
    expect(screen.getByRole('alert').className).toContain('max-w-full');
  });

  it('runs the action once and then dismisses the toast', async () => {
    const onAction = vi.fn();
    render(
      withIntl(
        createElement(AppToast, {
          id: 't4',
          tone: 'warning',
          title: 'Дані вже змінилися',
          action: { label: 'Оновити', onAction },
        }),
      ),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Оновити' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(sonner.dismiss).toHaveBeenCalledExactlyOnceWith('t4');
  });

  it('dismisses before it runs the action and ignores a second click while Sonner is still removing the toast', async () => {
    const calls: string[] = [];
    sonner.dismiss.mockImplementation(() => calls.push('dismiss'));
    const onAction = vi.fn(() => calls.push('action'));
    render(
      withIntl(
        createElement(AppToast, {
          id: 't5',
          tone: 'warning',
          title: 'Дані вже змінилися',
          action: { label: 'Оновити', onAction },
        }),
      ),
    );
    const button = screen.getByRole('button', { name: 'Оновити' });
    await userEvent.click(button);
    await userEvent.click(button);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(sonner.dismiss).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['dismiss', 'action']);
  });

  it('closes from the labelled × button without running the action', async () => {
    const onAction = vi.fn();
    render(
      withIntl(
        createElement(AppToast, {
          id: 7,
          tone: 'success',
          title: 'Збережено',
          action: { label: 'Відкрити', onAction },
        }),
      ),
    );
    await userEvent.click(
      screen.getByRole('button', { name: messages.common.close }),
    );
    expect(sonner.dismiss).toHaveBeenCalledExactlyOnceWith(7);
    expect(onAction).not.toHaveBeenCalled();
  });
});

describe('ToastRuntime [UI foundation F7]', () => {
  it.each(['light', 'dark', 'system'] as const)(
    'gives Sonner the app theme (%s) and the Ukrainian region label',
    (theme) => {
      render(
        withIntl(
          createElement(ThemeProvider, {
            initialTheme: theme,
            children: createElement(ToastRuntime),
          }),
        ),
      );
      const props = sonner.toasterProps.at(-1);
      expect(props).toMatchObject({
        theme,
        customAriaLabel: messages.common.notifications,
        position: 'bottom-right',
        visibleToasts: 3,
        style: { zIndex: 'var(--z-toast)' },
      });
    },
  );

  it('lifts the toaster above the bottom chrome on desktop and mobile', () => {
    render(
      withIntl(
        createElement(ThemeProvider, {
          initialTheme: 'light',
          children: createElement(ToastRuntime),
        }),
      ),
    );
    expect(sonner.toasterProps.at(-1)).toMatchObject({
      offset: {
        right: 24,
        bottom:
          'calc(var(--chrome-bottom) + var(--sticky-bar-bottom, 0px) + 24px)',
      },
      mobileOffset: {
        bottom:
          'calc(var(--chrome-bottom) + var(--sticky-bar-bottom, 0px) + 12px)',
      },
    });
  });

  it('turns every lib/toast notification into a custom Sonner toast with its id and duration', () => {
    render(
      withIntl(
        createElement(ThemeProvider, {
          initialTheme: 'light',
          children: createElement(ToastRuntime),
        }),
      ),
    );
    appToast.warning('Дані вже змінилися', {
      description: 'Повторіть дію',
      id: 'stale:vacancy:1',
    });
    appToast.success('Збережено');

    expect(sonner.custom).toHaveBeenCalledTimes(2);
    const [render0, options0] = sonner.custom.mock.calls[0] as [
      (id: string) => ReactElement,
      unknown,
    ];
    expect(options0).toEqual({ id: 'stale:vacancy:1', duration: 8000 });
    expect(sonner.custom.mock.calls[1]?.[1]).toEqual({
      id: undefined,
      duration: 4000,
    });

    cleanup();
    render(withIntl(render0('stale:vacancy:1')));
    const element = document.querySelector<HTMLElement>('[data-slot="toast"]')!;
    expect(element.getAttribute('data-tone')).toBe('warning');
    expect(within(element).getByText('Повторіть дію')).toBeTruthy();
  });
});
