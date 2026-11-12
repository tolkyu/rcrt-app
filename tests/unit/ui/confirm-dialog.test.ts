// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ConfirmDialog,
  type ConfirmDialogProps,
} from '@/components/ui/confirm-dialog';
import messages from '../../../messages/uk.json' with { type: 'json' };

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

const REQUIRED = messages.common.confirmReasonRequired;
const LABEL = 'Причина скасування';

function mount(props: Partial<ConfirmDialogProps> = {}) {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  const element = (next: Partial<ConfirmDialogProps>) =>
    createElement(NextIntlClientProvider, {
      locale: 'uk',
      messages: { common: messages.common, form: messages.form },
      children: createElement(ConfirmDialog, {
        open: true,
        onOpenChange,
        title: 'Скасувати вакансію?',
        confirmLabel: 'Скасувати вакансію',
        cancelLabel: 'Не скасовувати',
        onConfirm,
        ...props,
        ...next,
      }),
    });
  const view = render(element({}));
  return {
    onConfirm,
    onOpenChange,
    rerender: (next: Partial<ConfirmDialogProps>) =>
      view.rerender(element(next)),
  };
}

const confirm = () =>
  screen.getByRole('button', { name: 'Скасувати вакансію' });
const cancel = () => screen.getByRole('button', { name: 'Не скасовувати' });
const reasonField = () => screen.getByLabelText(new RegExp(LABEL));
const withReason = {
  reason: { label: LABEL, maxLength: 10 },
} as const;

describe('ConfirmDialog [UI foundation F8, G16]', () => {
  it('gives Cancel the initial focus, for a destructive action too', async () => {
    mount({ tone: 'destructive', ...withReason });
    await waitFor(() => expect(document.activeElement).toBe(cancel()));
  });

  it('is an alertdialog named by its title and described by its description', () => {
    mount({ description: 'Дію не можна скасувати.' });
    const dialog = screen.getByRole('alertdialog', {
      name: 'Скасувати вакансію?',
    });
    expect(
      document.getElementById(dialog.getAttribute('aria-describedby') ?? '')
        ?.textContent,
    ).toBe('Дію не можна скасувати.');
  });

  it('lists the consequences as list items', () => {
    mount({ consequence: ['Чернетка зникне.', 'Запис лишиться в журналі.'] });
    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual(['Чернетка зникне.', 'Запис лишиться в журналі.']);
  });

  it('paints a destructive confirm with --destructive and a neutral one with the primary colour', () => {
    mount({ tone: 'destructive' });
    expect(confirm().classList.contains('bg-destructive')).toBe(true);
    cleanup();
    mount();
    expect(confirm().classList.contains('bg-primary')).toBe(true);
    expect(confirm().classList.contains('bg-destructive')).toBe(false);
  });

  it('confirms at once without a reason field', async () => {
    const { onConfirm } = mount();
    await userEvent.click(confirm());
    expect(onConfirm).toHaveBeenCalledWith('');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  describe('required reason', () => {
    it('keeps confirm aria-disabled, focusable and explained until a visible character is typed', async () => {
      const { onConfirm } = mount(withReason);
      const button = confirm();
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(button.hasAttribute('disabled')).toBe(false);
      expect(
        document.getElementById(button.getAttribute('aria-describedby') ?? '')
          ?.textContent,
      ).toBe(REQUIRED);
      await userEvent.click(button);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('does nothing on Enter or Space while confirm is blocked', async () => {
      const { onConfirm } = mount(withReason);
      confirm().focus();
      await userEvent.keyboard('{Enter}');
      await userEvent.keyboard(' ');
      expect(onConfirm).not.toHaveBeenCalled();
      expect(screen.getByRole('alertdialog')).toBeTruthy();
    });

    it.each([
      ['spaces and line breaks', '   \n  \n '],
      ['zero-width characters', '\u200B\u200D\uFEFF'],
      ['non-breaking spaces', '\u00A0\u00A0'],
    ])('stays blocked for %s only', async (_name, value) => {
      const { onConfirm } = mount(withReason);
      fireEvent.change(reasonField(), { target: { value } });
      expect(confirm().getAttribute('aria-disabled')).toBe('true');
      await userEvent.click(confirm());
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('enables confirm for text with outer whitespace and passes it trimmed', async () => {
      const { onConfirm } = mount(withReason);
      fireEvent.change(reasonField(), { target: { value: '  Закрито\n  ' } });
      expect(confirm().getAttribute('aria-disabled')).toBeNull();
      await userEvent.click(confirm());
      expect(onConfirm).toHaveBeenCalledOnce();
      expect(onConfirm).toHaveBeenCalledWith('Закрито');
    });

    it('accepts a multi-line reason', async () => {
      const { onConfirm } = mount({
        reason: { label: LABEL, maxLength: 50 },
      });
      fireEvent.change(reasonField(), {
        target: { value: 'Перший рядок\nДругий рядок' },
      });
      await userEvent.click(confirm());
      expect(onConfirm).toHaveBeenCalledWith('Перший рядок\nДругий рядок');
    });

    it('blocks a reason over the limit with its own message and counts what the caller says', async () => {
      const { onConfirm } = mount(withReason);
      fireEvent.change(reasonField(), { target: { value: 'Дванадцять сим' } });
      expect(confirm().getAttribute('aria-disabled')).toBe('true');
      expect(
        document.getElementById(
          confirm().getAttribute('aria-describedby') ?? '',
        )?.textContent,
      ).toBe('Скоротіть причину до 10 символів');
      await userEvent.click(confirm());
      expect(onConfirm).not.toHaveBeenCalled();
      cleanup();
      const counted = mount({
        reason: { label: LABEL, maxLength: 10, countLength: () => 1 },
      });
      fireEvent.change(reasonField(), { target: { value: 'Дванадцять сим' } });
      expect(confirm().getAttribute('aria-disabled')).toBeNull();
      expect(counted.onConfirm).not.toHaveBeenCalled();
    });

    it('marks the field required and shows the counter in code points', () => {
      mount(withReason);
      expect(reasonField().getAttribute('aria-required')).toBe('true');
      fireEvent.change(reasonField(), { target: { value: 'Так 😀' } });
      expect(screen.getByText('5/10')).toBeTruthy();
    });

    it('forgets the text when the dialog is closed and opened again', () => {
      const view = mount(withReason);
      fireEvent.change(reasonField(), { target: { value: 'Закрито' } });
      view.rerender({ open: false });
      view.rerender({ open: true });
      expect((reasonField() as HTMLTextAreaElement).value).toBe('');
    });
  });

  describe('cancelling', () => {
    it('cancels with Escape and with the Cancel button', async () => {
      const { onOpenChange } = mount();
      await userEvent.keyboard('{Escape}');
      expect(onOpenChange).toHaveBeenLastCalledWith(false);
      onOpenChange.mockClear();
      await userEvent.click(cancel());
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('cancels with a press on the overlay', async () => {
      const { onOpenChange } = mount();
      await userEvent.click(document.querySelector('.motion-fade') as Element);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('pending', () => {
    it('shows the spinner on the 150 ms delayed fade and keeps the label', () => {
      mount({ pending: true });
      const spinner = document.querySelector('.skeleton-delayed');
      expect(spinner?.getAttribute('aria-hidden')).toBe('true');
      expect(spinner?.closest('button')).toBe(confirm());
      expect(confirm().textContent).toBe('Скасувати вакансію');
      expect(confirm().getAttribute('aria-busy')).toBe('true');
      expect(screen.getByRole('status').textContent).toBe(
        messages.common.confirmPending,
      );
    });

    it('renders no spinner and no busy state when idle', () => {
      mount();
      expect(document.querySelector('.skeleton-delayed')).toBeNull();
      expect(confirm().getAttribute('aria-busy')).toBeNull();
      expect(screen.getByRole('status').textContent).toBe('');
    });

    it('keeps the reason focusable and read-only while the request runs', () => {
      mount({ ...withReason, pending: true });
      const field = reasonField() as HTMLTextAreaElement;
      expect(field.disabled).toBe(false);
      expect(field.readOnly).toBe(true);
      expect(field.getAttribute('aria-readonly')).toBe('true');
    });

    it('ignores a second confirm, Escape, Cancel and the overlay while the request runs', async () => {
      const { onConfirm, onOpenChange } = mount({ pending: true });
      await userEvent.click(confirm());
      await userEvent.keyboard('{Escape}');
      await userEvent.click(cancel());
      await userEvent.click(document.querySelector('.motion-fade') as Element);
      expect(onConfirm).not.toHaveBeenCalled();
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(cancel().getAttribute('aria-disabled')).toBe('true');
    });
  });

  it('lets long labels wrap instead of overflowing the footer', () => {
    mount();
    for (const button of [confirm(), cancel()]) {
      expect(button.classList.contains('whitespace-normal')).toBe(true);
      expect(button.classList.contains('min-h-12')).toBe(true);
      expect(button.classList.contains('h-auto')).toBe(true);
      expect(button.classList.contains('whitespace-nowrap')).toBe(false);
    }
  });

  it('reserves the helper line on touch once the reason is given, and only then', () => {
    mount(withReason);
    const spacer = () =>
      confirm()
        .closest('span.inline-flex')
        ?.querySelector('span[aria-hidden="true"].invisible') ?? null;
    expect(spacer()).toBeNull();
    fireEvent.change(reasonField(), { target: { value: 'Причина' } });
    expect(spacer()).not.toBeNull();
  });

  it('shows an inline failure as an alert inside the dialog', () => {
    mount({ error: 'Вакансію вже змінено.' });
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Вакансію вже змінено.');
    expect(screen.getByRole('alertdialog').contains(alert)).toBe(true);
  });
});
