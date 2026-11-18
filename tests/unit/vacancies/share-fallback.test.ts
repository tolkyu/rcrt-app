// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VacancyOverview } from '@/components/vacancies/vacancy-overview';
import messages from '@/messages/uk.json';
import {
  SHARE_ID,
  mountInUk as mount,
  shareVacancy as detail,
  stubClipboard,
} from '@/tests/support/vacancy-share-harness';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) =>
    createElement('a', { href }, children),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/toast', () => ({ toast }));

const shareButton = () =>
  screen.queryByRole('button', { name: messages.vacancies.share });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('«Поділитися» clipboard failure [STORY-UI-09-1 L5]', () => {
  it.each([
    ['a denied permission', () => Promise.reject(new Error('denied'))],
    [
      'an insecure context without a clipboard',
      () => {
        throw new TypeError('clipboard is undefined');
      },
    ],
  ])(
    'shows the alert with the message and the link for %s, no success toast, focus on the button',
    async (_name, writeText) => {
      stubClipboard(writeText as () => Promise<void>);
      mount(createElement(VacancyOverview, { vacancy: detail() }));
      const button = shareButton()!;
      await userEvent.click(button);
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toContain(messages.vacancies.shareFailed);
      expect(messages.vacancies.shareFailed).toBe(
        'Не вдалося скопіювати посилання. Скопіюйте його вручну:',
      );
      const link = within(alert).getByRole('link');
      expect(link.textContent).toBe(`/vacancies/${SHARE_ID}`);
      expect(link.getAttribute('href')).toBe(`/vacancies/${SHARE_ID}`);
      expect(toast.success).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(button);
    },
  );

  it('does not put filters, tokens or personal data into the shown link', async () => {
    window.history.replaceState(null, '', '/vacancies?q=Іван&cursor=abc#x');
    stubClipboard(() => Promise.reject(new Error('denied')));
    mount(createElement(VacancyOverview, { vacancy: detail() }));
    await userEvent.click(shareButton()!);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('link').textContent).toBe(
      `/vacancies/${SHARE_ID}`,
    );
  });
});

describe('«Поділитися» visibility [STORY-UI-09-1 L6]', () => {
  it.each([
    ['a private DRAFT', { status: 'DRAFT', openedAt: null }],
    ['a never-opened CANCELLED draft', { status: 'CANCELLED', openedAt: null }],
  ] as const)('renders no button for %s', (_name, overrides) => {
    mount(createElement(VacancyOverview, { vacancy: detail(overrides) }));
    expect(shareButton()).toBeNull();
  });

  it.each(['OPEN', 'ON_HOLD', 'FILLED'] as const)(
    'renders the button for %s',
    (status) => {
      mount(createElement(VacancyOverview, { vacancy: detail({ status }) }));
      expect(shareButton()).not.toBeNull();
    },
  );

  it('renders the button for a cancelled vacancy that was opened once', () => {
    mount(
      createElement(VacancyOverview, {
        vacancy: detail({ status: 'CANCELLED' }),
      }),
    );
    expect(shareButton()).not.toBeNull();
  });

  it('renders no button in the preview of a private draft either', () => {
    mount(
      createElement(VacancyOverview, {
        vacancy: detail({ status: 'DRAFT', openedAt: null }),
        preview: true,
      }),
    );
    expect(shareButton()).toBeNull();
  });
});
