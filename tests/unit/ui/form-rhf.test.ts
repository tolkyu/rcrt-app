// @vitest-environment jsdom
import { zodResolver } from '@hookform/resolvers/zod';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import {
  createElement,
  useEffect,
  useState,
  type FormHTMLAttributes,
} from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Checkbox } from '@/components/ui/checkbox';
import { FormError } from '@/components/ui/form-error';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Textarea } from '@/components/ui/textarea';
import { normalizePositionName } from '@/lib/position-name';
import { serverTextLength } from '@/lib/text-length';
import messages from '../../../messages/uk.json' with { type: 'json' };

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

const MAX = 20;
const schema = z.object({
  title: z.string().overwrite(normalizePositionName).min(2, 'Закоротка назва'),
  reason: z
    .string()
    .overwrite(normalizePositionName)
    .min(1, 'Вкажіть причину')
    .max(MAX, 'Задовга причина'),
  priority: z.enum(['normal', 'urgent']),
  consent: z.boolean().refine(Boolean, 'Потрібна згода'),
});
type Values = z.output<typeof schema>;

const options = [
  { value: 'normal', label: 'Звичайна' },
  { value: 'urgent', label: 'Термінова' },
];

function Form({ onValid }: { onValid: (values: Values) => void }) {
  const {
    register,
    control,
    handleSubmit,
    subscribe,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      title: '',
      reason: '',
      priority: 'normal',
      consent: false,
    },
  });
  const reason = useWatch({ control, name: 'reason' });
  const [announce, setAnnounce] = useState(true);
  useEffect(
    () =>
      subscribe({
        formState: { values: true },
        callback: ({ type }) => {
          if (type === 'change') setAnnounce(true);
        },
      }),
    [subscribe],
  );
  const [summary, setSummary] = useState({ count: 0, attempt: 0 });
  return createElement<FormHTMLAttributes<HTMLFormElement>, HTMLFormElement>(
    'form',
    {
      noValidate: true,
      onSubmit: handleSubmit(onValid, (invalid) => {
        setAnnounce(false);
        setSummary((current) => ({
          count: Object.keys(invalid).length,
          attempt: current.attempt + 1,
        }));
      }),
    },
    createElement(FormField, {
      id: 'title',
      label: 'Назва',
      required: true,
      error: errors.title?.message,
      announce,
      children: (field) =>
        createElement(Input, { ...field, ...register('title') }),
    }),
    createElement(FormField, {
      id: 'reason',
      label: 'Причина',
      required: true,
      error: errors.reason?.message,
      announce,
      counter: { count: serverTextLength(reason), max: MAX },
      children: (field) =>
        createElement(Textarea, { ...field, ...register('reason') }),
    }),
    createElement(Controller<Values, 'priority', Values>, {
      control,
      name: 'priority',
      render: ({ field }) =>
        createElement(FormField, {
          id: 'priority',
          layout: 'group',
          label: 'Пріоритет',
          children: (props) =>
            createElement(SegmentedControl, {
              ...props,
              ref: field.ref,
              options,
              value: field.value,
              onValueChange: field.onChange,
              onBlur: field.onBlur,
            }),
        }),
    }),
    createElement(Controller<Values, 'consent', Values>, {
      control,
      name: 'consent',
      render: ({ field, fieldState }) =>
        createElement(FormField, {
          id: 'consent',
          layout: 'inline',
          label: 'Згода',
          required: true,
          error: fieldState.error?.message,
          announce,
          children: (props) =>
            createElement(Checkbox, {
              ...props,
              ref: field.ref,
              checked: field.value,
              onCheckedChange: field.onChange,
              onBlur: field.onBlur,
            }),
        }),
    }),
    createElement(FormError, {
      count: summary.count,
      attempt: summary.attempt,
    }),
    createElement('button', { type: 'submit' }, 'Надіслати'),
  );
}

const renderForm = (onValid = vi.fn()) => {
  render(
    createElement(NextIntlClientProvider, {
      locale: 'uk',
      messages: { form: messages.form },
      children: createElement(Form, { onValid }),
    }),
  );
  return { onValid, user: userEvent.setup() };
};

describe('kit with react-hook-form [UI foundation F5]', () => {
  it('on a failed submit announces one summary and focuses the first invalid field', async () => {
    const { user, onValid } = renderForm();
    await user.click(screen.getByRole('button', { name: 'Надіслати' }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('textbox', { name: 'Назва (обовʼязкове)' }),
      ),
    );
    expect(onValid).not.toHaveBeenCalled();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert').textContent).toBe('Виправте 3 поля');
    expect(
      screen
        .getByRole('textbox', { name: 'Назва (обовʼязкове)' })
        .getAttribute('aria-invalid'),
    ).toBe('true');
  });

  it('speaks once on a failed submit: field errors are not in an active live region, only the summary alerts', async () => {
    const { user } = renderForm();
    const region = (id: string) =>
      document
        .getElementById(id)
        ?.closest('[aria-live]')
        ?.getAttribute('aria-live');
    await user.click(screen.getByRole('button', { name: 'Надіслати' }));
    await waitFor(() =>
      expect(document.getElementById('title-error')).not.toBeNull(),
    );
    expect(region('title-error')).toBe('off');
    expect(region('reason-error')).toBe('off');
    expect(region('consent-error')).toBe('off');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('silences the field regions only until the next edit, then they announce again', async () => {
    const { user } = renderForm();
    const region = (id: string) =>
      document
        .getElementById(id)
        ?.closest('[aria-live]')
        ?.getAttribute('aria-live');
    await user.click(screen.getByRole('button', { name: 'Надіслати' }));
    await waitFor(() => expect(region('title-error')).toBe('off'));
    expect(region('reason-error')).toBe('off');
    await user.type(screen.getByLabelText(/Назва/), 'М');
    await waitFor(() => expect(region('title-error')).toBe('polite'));
    expect(region('reason-error')).toBe('polite');
    expect(region('consent-error')).toBe('polite');
  });

  it('keeps the polite region for a blur error before any submit', async () => {
    const { user } = renderForm();
    await user.type(screen.getByLabelText(/Назва/), 'М');
    await user.tab();
    await waitFor(() =>
      expect(document.getElementById('title-error')).not.toBeNull(),
    );
    expect(
      document
        .getElementById('title-error')
        ?.closest('[aria-live]')
        ?.getAttribute('aria-live'),
    ).toBe('polite');
  });

  it('focuses the next invalid field in DOM order once the first is fixed, including a Controller checkbox', async () => {
    const { user } = renderForm();
    await user.type(screen.getByLabelText(/Назва/), 'Медіабаєр');
    await user.type(screen.getByLabelText(/Причина/), 'Набір закрито');
    await user.click(screen.getByRole('button', { name: 'Надіслати' }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('checkbox', { name: 'Згода (обовʼязкове)' }),
      ),
    );
    expect(screen.getByRole('alert').textContent).toBe('Виправте 1 поле');
  });

  it('shows a field error in its live region only after blur, linked to the control', async () => {
    const { user } = renderForm();
    const title = screen.getByLabelText(/Назва/);
    await user.type(title, 'М');
    expect(document.getElementById('title-error')).toBeNull();
    await user.tab();
    await waitFor(() =>
      expect(document.getElementById('title-error')?.textContent).toBe(
        'Закоротка назва',
      ),
    );
    expect(title.getAttribute('aria-describedby')).toBe('title-error');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('counts code points like the server, so emoji fill the limit one each, and reports the overflow while typing', async () => {
    const { user } = renderForm();
    const reason = screen.getByLabelText(/Причина/);
    await user.click(reason);
    await user.paste('😀'.repeat(MAX));
    const counter = document.getElementById('reason-counter')!;
    expect(counter.textContent).toContain('20/20');
    expect(counter.hasAttribute('data-over')).toBe(false);
    await user.paste('а');
    expect(counter.textContent).toContain('21/20');
    expect(counter.hasAttribute('data-over')).toBe(true);
    await user.tab();
    await waitFor(() =>
      expect(document.getElementById('reason-error')?.textContent).toBe(
        'Задовга причина',
      ),
    );
  });

  it('submits the typed, valid values and shows no summary', async () => {
    const { user, onValid } = renderForm();
    await user.type(screen.getByLabelText(/Назва/), '  Медіабаєр  ');
    await user.type(screen.getByLabelText(/Причина/), 'Набір закрито');
    await user.click(screen.getByRole('radio', { name: 'Термінова' }));
    await user.click(screen.getByRole('checkbox', { name: /Згода/ }));
    await user.click(screen.getByRole('button', { name: 'Надіслати' }));
    await waitFor(() => expect(onValid).toHaveBeenCalledTimes(1));
    expect(onValid.mock.calls[0]![0]).toEqual({
      title: 'Медіабаєр',
      reason: 'Набір закрито',
      priority: 'urgent',
      consent: true,
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
