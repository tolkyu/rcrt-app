// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  screen.getByRole('button', { name: messages.vacancies.share });

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('«Поділитися» success path [STORY-UI-09-1 L1]', () => {
  it('copies the clean card link whatever filters, cursor or hash the page has, and confirms once', async () => {
    window.history.replaceState(
      null,
      '',
      '/vacancies?status=OPEN&q=V-0005&cursor=abc#preview',
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    mount(createElement(VacancyOverview, { vacancy: detail() }));
    await userEvent.click(shareButton());
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      `${window.location.origin}/vacancies/${SHARE_ID}`,
    );
    expect(toast.success).toHaveBeenCalledWith(messages.vacancies.shareCopied);
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('copies the same link from the list preview as from the card', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    mount(createElement(VacancyOverview, { vacancy: detail(), preview: true }));
    await userEvent.click(shareButton());
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/vacancies/${SHARE_ID}`,
    );
  });

  it('is a real button with the accessible name and keeps focus after the press', async () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined));
    mount(createElement(VacancyOverview, { vacancy: detail() }));
    const button = shareButton();
    expect(button.tagName).toBe('BUTTON');
    await userEvent.click(button);
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(document.activeElement).toBe(button);
  });

  it('a later success clears the fallback alert of an earlier failure', async () => {
    const writeText = vi
      .fn()
      .mockRejectedValueOnce(new Error('denied'))
      .mockResolvedValueOnce(undefined);
    stubClipboard(writeText);
    mount(createElement(VacancyOverview, { vacancy: detail() }));
    await userEvent.click(shareButton());
    expect(await screen.findByRole('alert')).toBeTruthy();
    await userEvent.click(shareButton());
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('«Поділитися» double press [STORY-UI-09-1 edges]', () => {
  it('two quick presses write once and show one toast', async () => {
    let finish: () => void = () => {};
    const writeText = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    stubClipboard(writeText);
    mount(createElement(VacancyOverview, { vacancy: detail() }));
    const button = shareButton();
    await userEvent.click(button);
    await userEvent.click(button);
    expect(button.hasAttribute('disabled')).toBe(true);
    finish();
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(button.hasAttribute('disabled')).toBe(false);
  });

  it('two presses with a blocked clipboard show one alert and no toast', async () => {
    let fail: (error: Error) => void = () => {};
    const writeText = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          fail = reject;
        }),
    );
    stubClipboard(writeText);
    mount(createElement(VacancyOverview, { vacancy: detail() }));
    const button = shareButton();
    await userEvent.click(button);
    await userEvent.click(button);
    fail(new Error('denied'));
    expect(await screen.findAllByRole('alert')).toHaveLength(1);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
  });
});
