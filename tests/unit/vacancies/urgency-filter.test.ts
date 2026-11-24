// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { UrgencyFilter } from '@/components/vacancies/urgency-filter';
import messages from '@/messages/uk.json';

beforeAll(async () => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  await import('@/components/ui/select-content');
});
afterEach(cleanup);

const renderFilter = (
  value: 'URGENT' | 'NORMAL' | undefined,
  onChange = vi.fn(),
) => {
  render(
    createElement(NextIntlClientProvider, {
      locale: 'uk',
      messages: { vacancies: messages.vacancies, common: messages.common },
      children: createElement(UrgencyFilter, { value, onChange }),
    }),
  );
  return onChange;
};
const trigger = () => screen.getByRole('combobox', { name: 'Терміновість' });

describe('urgency filter [VAC-04-4]', () => {
  it.each([
    [undefined, 'Усі'],
    ['URGENT', 'Термінова'],
    ['NORMAL', 'Звичайна'],
  ] as const)(
    'shows %s as «%s» under the label «Терміновість»',
    (value, text) => {
      renderFilter(value);
      expect(trigger().textContent).toContain(text);
    },
  );

  it('offers Усі, Термінова, Звичайна in that order and reports the choice', async () => {
    const user = userEvent.setup();
    const onChange = renderFilter(undefined);
    await user.click(trigger());
    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Усі',
      'Термінова',
      'Звичайна',
    ]);
    await user.click(screen.getByRole('option', { name: 'Термінова' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('URGENT'));
  });

  it('reports undefined for «Усі»', async () => {
    const user = userEvent.setup();
    const onChange = renderFilter('NORMAL');
    await user.click(trigger());
    await user.click(await screen.findByRole('option', { name: 'Усі' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(undefined));
  });
});
