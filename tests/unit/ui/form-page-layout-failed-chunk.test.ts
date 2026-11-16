// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FormPageLayout } from '@/components/ui/form-page-layout';
import messages from '../../../messages/uk.json' with { type: 'json' };

const { replace, push } = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push }) }));
vi.mock('@/components/ui/confirm-dialog', () => {
  throw new Error('chunk failed to load');
});

const PAGE = '/vacancies/new';

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  window.history.replaceState(null, '', PAGE);
  vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  replace.mockReset();
  push.mockReset();
});

function renderForm() {
  render(
    createElement(NextIntlClientProvider, {
      locale: 'uk',
      messages: { common: messages.common },
      children: createElement(FormPageLayout, {
        title: 'Нова вакансія',
        back: { href: '/vacancies', label: 'Вакансії' },
        dirty: true,
        onSubmit: () => undefined,
        footer: null,
        children: createElement('input', {
          'aria-label': 'Назва',
          defaultValue: 'x',
        }),
      }),
    }),
  );
}

async function clickOtherPage() {
  const link = document.createElement('a');
  link.href = '/candidates';
  document.body.append(link);
  await act(async () => {
    link.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
    );
  });
}

describe('FormPageLayout with a leave dialog chunk that fails to load [UI foundation F9]', () => {
  it('keeps the form and asks with the browser question; OK follows the link', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderForm();
    await clickOtherPage();
    await waitFor(() =>
      expect(confirmSpy).toHaveBeenCalledExactlyOnceWith(
        messages.common.leaveTitle,
      ),
    );
    expect(screen.getByLabelText('Назва')).toBeTruthy();
    await waitFor(() =>
      expect(replace).toHaveBeenCalledExactlyOnceWith('/candidates'),
    );
  });

  it('Cancel stays on the page with the input intact', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderForm();
    await clickOtherPage();
    await waitFor(() => expect(confirmSpy).toHaveBeenCalledTimes(1));
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByLabelText<HTMLInputElement>('Назва').value).toBe('x');
  });
});
