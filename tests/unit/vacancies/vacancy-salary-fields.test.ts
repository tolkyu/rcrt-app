// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, it } from 'vitest';
import { useVacancyErrorText } from '@/components/vacancies/use-vacancy-error-text';
import { VacancyConditionsGroup } from '@/components/vacancies/vacancy-conditions-group';
import { emptyVacancyForm, type VacancyFormValues } from '@/lib/vacancy-form';
import { resolveVacancyForm } from '@/lib/vacancy-form-submit';
import messages from '@/messages/uk.json';

afterEach(cleanup);

const t = messages.vacancyForm;
const GAMBLING = '8b1f5a0e-0c2d-4f6e-9d7a-2b3c4d5e6f70';

/** The real group with the real resolver and the form's validation mode, plus a button that stands for a failed submit. */
function Harness({ currency }: { currency: string }) {
  const fieldError = useVacancyErrorText();
  const form = useForm<VacancyFormValues>({
    resolver: async (values) => resolveVacancyForm(values, 'DRAFT'),
    mode: 'onTouched',
    defaultValues: {
      ...emptyVacancyForm(GAMBLING),
      title: 'Назва',
      salaryCurrency: currency,
    },
  });
  const { control, register, setValue, trigger, getFieldState, formState } =
    form;
  return createElement(
    'div',
    null,
    createElement(VacancyConditionsGroup, {
      control,
      register,
      setValue,
      trigger,
      getFieldState,
      errors: formState.errors,
      fieldError,
      announce: true,
      pending: false,
      showProbation: false,
      normalizeSalary: undefined,
    }),
    createElement(
      'button',
      { type: 'button', onClick: () => void trigger() },
      'check',
    ),
  );
}

const view = (currency: string) =>
  render(
    createElement(NextIntlClientProvider, {
      locale: 'uk',
      timeZone: 'Europe/Kyiv',
      messages,
      children: createElement(Harness, { currency }),
    }),
  );
const from = () =>
  screen.getByRole('textbox', { name: new RegExp(`^${t.salary.from}`) });
const to = () =>
  screen.getByRole('textbox', { name: new RegExp(`^${t.salary.to}`) });

describe('a salary error that depends on another field follows its fix [ux §4.1]', () => {
  it('the «maximum below minimum» error on «До» goes when «Від» is lowered, without touching «До»', async () => {
    const user = userEvent.setup();
    view('USD');
    await user.type(from(), '500');
    await user.type(to(), '400');
    await user.tab();
    expect(await screen.findByText(t.errors.salaryMaxBelowMin)).toBeTruthy();

    await user.clear(from());
    await user.type(from(), '300');
    await waitFor(() =>
      expect(screen.queryByText(t.errors.salaryMaxBelowMin)).toBeNull(),
    );
    expect(to().getAttribute('aria-invalid')).toBeNull();
  });

  it('the «currency without an amount» error goes once an amount is typed', async () => {
    const user = userEvent.setup();
    view('USD');
    await user.click(screen.getByRole('button', { name: 'check' }));
    expect(
      await screen.findByText(t.errors.salaryCurrencyNoAmount),
    ).toBeTruthy();

    await user.type(from(), '100');
    await waitFor(() =>
      expect(screen.queryByText(t.errors.salaryCurrencyNoAmount)).toBeNull(),
    );
  });

  it('the «choose a currency» error goes once the amount is removed', async () => {
    const user = userEvent.setup();
    view('');
    await user.type(from(), '100');
    await user.click(screen.getByRole('button', { name: 'check' }));
    expect(
      await screen.findByText(t.errors.salaryCurrencyRequired),
    ).toBeTruthy();

    await user.clear(from());
    await waitFor(() =>
      expect(screen.queryByText(t.errors.salaryCurrencyRequired)).toBeNull(),
    );
  });

  it('a field without an error is not validated early: a half-typed pair shows nothing', async () => {
    const user = userEvent.setup();
    view('USD');
    await user.type(from(), '500');
    await user.type(to(), '4');
    expect(screen.queryByText(t.errors.salaryMaxBelowMin)).toBeNull();
  });
});
