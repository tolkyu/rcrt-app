// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Combobox, type ComboboxProps } from '@/components/ui/combobox';
import messages from '../../../messages/uk.json' with { type: 'json' };

vi.mock('@/components/ui/combobox-popup', () => {
  throw new Error('chunk failed to load');
});

afterEach(cleanup);

const renderCombobox = (props: ComboboxProps) =>
  render(
    createElement(NextIntlClientProvider, {
      locale: 'uk',
      messages: { common: messages.common },
      children: createElement(Combobox, props),
    }),
  );

describe('Combobox with a popup chunk that fails to load [UI foundation F4]', () => {
  it('falls back to a native select with the same value contract and keeps the focus', async () => {
    const onValueChange = vi.fn();
    renderCombobox({
      id: 'field',
      'aria-invalid': true,
      value: 'crypto',
      onValueChange,
      options: [
        { value: 'gambling', label: 'Гемблінг' },
        { value: 'crypto', label: 'Крипто' },
      ],
    });
    await userEvent.tab();
    await waitFor(() =>
      expect(screen.getByRole('combobox').tagName).toBe('SELECT'),
    );
    const native = screen.getByRole<HTMLSelectElement>('combobox');
    expect(native.value).toBe('crypto');
    expect(native).toBe(document.activeElement);
    await userEvent.selectOptions(native, 'gambling');
    expect(onValueChange).toHaveBeenCalledWith('gambling');
  });

  it('keeps the aria attributes, onBlur and id on the native select', async () => {
    const onBlur = vi.fn();
    renderCombobox({
      id: 'field',
      'aria-label': 'Тімлід',
      'aria-describedby': 'field-error',
      'aria-invalid': true,
      'aria-required': true,
      value: '',
      placeholder: 'Оберіть тімліда',
      onValueChange: () => undefined,
      onBlur,
      options: [{ value: 'crypto', label: 'Крипто' }],
    });
    await userEvent.tab();
    await waitFor(() =>
      expect(screen.getByRole('combobox').tagName).toBe('SELECT'),
    );
    const native = screen.getByRole<HTMLSelectElement>('combobox');
    expect(native.id).toBe('field');
    expect(native.getAttribute('aria-label')).toBe('Тімлід');
    expect(native.getAttribute('aria-describedby')).toBe('field-error');
    expect(native.getAttribute('aria-invalid')).toBe('true');
    expect(native.getAttribute('aria-required')).toBe('true');
    await userEvent.tab();
    expect(onBlur).toHaveBeenCalledOnce();
  });

  it('keeps a selected option that the list lacks', async () => {
    renderCombobox({
      value: 'taras',
      selectedOption: { value: 'taras', label: 'Тарас Коваль' },
      onValueChange: () => undefined,
      onSearch: async () => [{ value: 'olena', label: 'Олена' }],
    });
    await userEvent.hover(screen.getByRole('combobox'));
    await waitFor(() =>
      expect(screen.getByRole('combobox').tagName).toBe('SELECT'),
    );
    expect(screen.getByRole<HTMLSelectElement>('combobox').value).toBe('taras');
  });

  it('lists the first page of an async search in the fallback', async () => {
    renderCombobox({
      value: '',
      placeholder: 'Оберіть тімліда',
      onValueChange: () => undefined,
      onSearch: async () => [{ value: 'taras', label: 'Тарас Коваль' }],
    });
    await userEvent.hover(screen.getByRole('combobox'));
    await waitFor(() =>
      expect(screen.getByRole('combobox').tagName).toBe('SELECT'),
    );
    expect(
      await screen.findByRole('option', { name: 'Тарас Коваль' }),
    ).toBeTruthy();
  });
});
