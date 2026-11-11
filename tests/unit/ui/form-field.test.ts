// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactElement } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import messages from '../../../messages/uk.json' with { type: 'json' };

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

const provider = (child: ReactElement) =>
  createElement(NextIntlClientProvider, {
    locale: 'uk',
    messages: { form: messages.form },
    children: child,
  });

type FieldProps = Omit<Parameters<typeof FormField>[0], 'children' | 'id'>;

const field = (props: FieldProps, control: 'input' | 'textarea' = 'input') =>
  provider(
    createElement(FormField, {
      id: 'f',
      ...props,
      children: (aria) =>
        control === 'input'
          ? createElement(Input, aria)
          : createElement(Textarea, aria),
    }),
  );

describe('FormField [UI foundation F5]', () => {
  it('names the control with a real label, never a placeholder', () => {
    render(field({ label: 'Назва' }));
    expect(screen.getByLabelText('Назва')).toBe(document.getElementById('f'));
  });

  it('marks a required field with a visible star hidden from AT, a spoken word and aria-required', () => {
    render(field({ label: 'Назва', required: true }));
    const input = screen.getByRole('textbox', {
      name: 'Назва (обовʼязкове)',
    });
    expect(input.getAttribute('aria-required')).toBe('true');
    expect(screen.getByText('*').getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText('(обовʼязкове)')).toBeTruthy();
  });

  it('describes the control by error, hint and counter in that order, and flags it invalid only with an error', () => {
    const { rerender } = render(
      field({
        label: 'Причина',
        hint: 'Підказка',
        counter: { count: 3, max: 500 },
      }),
    );
    const area = screen.getByLabelText('Причина');
    expect(area.getAttribute('aria-describedby')).toBe('f-hint f-counter');
    expect(area.hasAttribute('aria-invalid')).toBe(false);

    rerender(
      field({
        label: 'Причина',
        hint: 'Підказка',
        error: 'Вкажіть причину.',
        counter: { count: 3, max: 500 },
      }),
    );
    expect(area.getAttribute('aria-describedby')).toBe(
      'f-error f-hint f-counter',
    );
    expect(area.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById('f-error')?.textContent).toBe(
      'Вкажіть причину.',
    );
  });

  it('keeps the polite live region mounted before the error exists so the late text is announced', () => {
    const { container, rerender } = render(field({ label: 'Назва' }));
    const region = container.querySelector('[aria-live="polite"]');
    expect(region).not.toBeNull();
    expect(region?.textContent).toBe('');
    rerender(field({ label: 'Назва', error: 'Помилка' }));
    expect(container.querySelector('[aria-live="polite"]')).toBe(region);
    expect(region?.textContent).toBe('Помилка');
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(0);
  });

  it('has no description attribute at all when there is nothing to describe', () => {
    render(field({ label: 'Назва' }));
    expect(
      screen.getByLabelText('Назва').hasAttribute('aria-describedby'),
    ).toBe(false);
  });

  it('inline layout names a real Radix checkbox inside a form by its label', () => {
    render(
      provider(
        createElement(
          'form',
          null,
          createElement(FormField, {
            id: 'c',
            layout: 'inline',
            label: 'Згода',
            children: (aria) => createElement(Checkbox, aria),
          }),
        ),
      ),
    );
    const box = screen.getByLabelText('Згода');
    expect(box.getAttribute('role')).toBe('checkbox');
    expect(box.id).toBe('c');
    expect(box.nextElementSibling?.tagName).not.toBe('LABEL');
  });

  it('can silence the live region while keeping the error linked', () => {
    const { container } = render(
      field({ label: 'Назва', error: 'Помилка', announce: false }),
    );
    expect(
      container
        .querySelector('#f-error')
        ?.closest('[aria-live]')
        ?.getAttribute('aria-live'),
    ).toBe('off');
    expect(
      screen.getByLabelText('Назва').getAttribute('aria-describedby'),
    ).toBe('f-error');
  });

  it('group layout labels the control through aria-labelledby, not a label element', () => {
    render(
      provider(
        createElement(FormField, {
          id: 'g',
          layout: 'group',
          label: 'Пріоритет',
          required: true,
          error: 'Оберіть',
          children: (aria) =>
            createElement('div', { role: 'radiogroup', ...aria }),
        }),
      ),
    );
    const group = screen.getByRole('radiogroup');
    expect(group.getAttribute('aria-labelledby')).toBe('g-label');
    expect(document.getElementById('g-label')?.tagName).toBe('SPAN');
    expect(group.getAttribute('aria-describedby')).toBe('g-error');
    expect(group.getAttribute('aria-invalid')).toBe('true');
  });
});
