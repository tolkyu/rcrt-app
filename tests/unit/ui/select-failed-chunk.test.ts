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
import { createElement, type ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Select } from '@/components/ui/select';
import messages from '../../../messages/uk.json' with { type: 'json' };

vi.mock('@/components/ui/select-content', () => {
  throw new Error('chunk failed to load');
});

afterEach(cleanup);

const renderSelect = (props: ComponentProps<typeof Select>) =>
  render(
    createElement(NextIntlClientProvider, {
      locale: 'uk',
      messages: { common: messages.common },
      children: createElement(Select, props),
    }),
  );

describe('Select with a chunk that fails to load [UI foundation F3]', () => {
  it('falls back to a native select with the same value contract', async () => {
    const onValueChange = vi.fn();
    renderSelect({
      id: 'field',
      'aria-invalid': true,
      value: '',
      onValueChange,
      options: [
        { value: '', label: 'Усі' },
        { value: 'crypto', label: 'Крипто' },
      ],
    });
    await userEvent.hover(screen.getByRole('combobox'));
    await waitFor(() =>
      expect(screen.getByRole('combobox').tagName).toBe('SELECT'),
    );
    const native = screen.getByRole<HTMLSelectElement>('combobox');
    expect(native.getAttribute('aria-invalid')).toBe('true');
    expect(native.value).toBe('');
    await userEvent.selectOptions(native, 'crypto');
    expect(onValueChange).toHaveBeenCalledWith('crypto');
    await userEvent.selectOptions(native, '');
    expect(onValueChange).toHaveBeenLastCalledWith('');
  });

  it('a keyboard-focused field keeps its focus when it becomes the native fallback', async () => {
    renderSelect({
      value: 'crypto',
      onValueChange: () => undefined,
      options: [{ value: 'crypto', label: 'Крипто' }],
    });
    await userEvent.tab();
    await waitFor(() =>
      expect(screen.getByRole('combobox').tagName).toBe('SELECT'),
    );
    const native = screen.getByRole('combobox');
    expect(document.activeElement).toBe(native);
  });

  it('a press that asked for the chunk, with no hover before it, ends in a focused native fallback that keeps the id', async () => {
    const onValueChange = vi.fn();
    renderSelect({
      id: 'field',
      value: 'crypto',
      onValueChange,
      options: [
        { value: 'crypto', label: 'Крипто' },
        { value: 'gambling', label: 'Гемблінг' },
      ],
    });
    fireEvent.pointerDown(screen.getByRole('combobox'), {
      pointerType: 'mouse',
      button: 0,
    });
    await waitFor(() =>
      expect(screen.getByRole('combobox').tagName).toBe('SELECT'),
    );
    const native = screen.getByRole<HTMLSelectElement>('combobox');
    expect(native.id).toBe('field');
    expect(document.activeElement).toBe(native);
    await userEvent.selectOptions(native, 'gambling');
    expect(onValueChange).toHaveBeenCalledWith('gambling');
  });
});
