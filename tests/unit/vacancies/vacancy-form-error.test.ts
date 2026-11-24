// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { VacancyBasicsGroup } from '@/components/vacancies/vacancy-basics-group';
import { VacancyFormError } from '@/components/vacancies/vacancy-form-error';
import type { useVacancyPickers } from '@/components/vacancies/use-vacancy-pickers';
import {
  emptyVacancyForm,
  VACANCY_FIELD_IDS,
  VACANCY_FIELD_LABEL_KEYS,
  VACANCY_FORM_FIELDS,
  type VacancyFormValues,
} from '@/lib/vacancy-form';
import messages from '../../../messages/uk.json' with { type: 'json' };

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

const provider = (child: ReactElement) =>
  createElement(NextIntlClientProvider, {
    locale: 'uk',
    timeZone: 'Europe/Kyiv',
    messages,
    onError: (error) => {
      throw error;
    },
    children: child,
  });

const lookup = (path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        typeof node === 'object' && node !== null
          ? (node as Record<string, unknown>)[key]
          : undefined,
      messages.vacancyForm,
    );

describe('VACANCY_FIELD_LABEL_KEYS [S3.6, ux 7]', () => {
  it('names every form field, and every key resolves to Ukrainian text', () => {
    expect(Object.keys(VACANCY_FIELD_LABEL_KEYS).sort()).toEqual(
      [...VACANCY_FORM_FIELDS].sort(),
    );
    for (const field of VACANCY_FORM_FIELDS) {
      const text = lookup(VACANCY_FIELD_LABEL_KEYS[field]);
      expect(typeof text, field).toBe('string');
      expect((text as string).length, field).toBeGreaterThan(0);
    }
  });
});

describe('VacancyFormError [S3.6, ux 7]', () => {
  it('links the invalid fields by label, once for the three salary fields', () => {
    render(
      provider(
        createElement(VacancyFormError, {
          summary: {
            count: 4,
            attempt: 1,
            fields: ['title', 'salaryMin', 'salaryMax', 'salaryCurrency'],
          },
        }),
      ),
    );
    expect(screen.getByRole('alert').textContent).toBe('Виправте 4 поля');
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      messages.vacancyForm.titleField.label,
      messages.vacancyForm.salary.legend,
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      `#${VACANCY_FIELD_IDS.title}`,
      `#${VACANCY_FIELD_IDS.salaryMin}`,
    ]);
  });

  it('a link focuses the first control of its field', () => {
    const input = document.createElement('input');
    input.id = VACANCY_FIELD_IDS.title;
    document.body.append(input);
    render(
      provider(
        createElement(VacancyFormError, {
          summary: { count: 1, attempt: 1, fields: ['title'] },
        }),
      ),
    );
    fireEvent.click(screen.getByRole('link'));
    expect(document.activeElement).toBe(input);
    input.remove();
  });
});

const picker = {
  choosePosition: vi.fn(),
  chooseTeamLead: vi.fn(),
  chooseVertical: vi.fn(),
  searchPositions: vi.fn(),
  searchTeamLeads: vi.fn(),
  catalogEmpty: false,
  teamLeadsEmpty: false,
  verticalNote: null,
  autoTitle: '',
} as unknown as ReturnType<typeof useVacancyPickers>;

function BasicsHarness({
  verticals,
  lockedVertical = false,
}: {
  verticals: readonly { id: string; name: string }[];
  lockedVertical?: boolean;
}) {
  const form = useForm<VacancyFormValues>({
    defaultValues: emptyVacancyForm(verticals[0]!.id),
  });
  return createElement(VacancyBasicsGroup, {
    control: form.control,
    register: form.register,
    errors: {},
    fieldError: () => undefined,
    announce: true,
    pending: false,
    verticals,
    verticalId: verticals[0]!.id,
    title: '',
    titleLength: 0,
    picker,
    showTeamLead: false,
    canManagePositions: false,
    feedback: null,
    lockedVertical,
  });
}

const ONE = [{ id: 'v1', name: 'Гемблінг' }];
const TWO = [...ONE, { id: 'v2', name: 'Крипто' }];

describe('vertical hint under the select [S3.6, ux 4]', () => {
  it('explains a single, disabled vertical', () => {
    render(provider(createElement(BasicsHarness, { verticals: ONE })));
    expect(screen.getByText(messages.vacancyForm.vertical.single)).toBeTruthy();
  });

  it('says nothing when the user may pick', () => {
    render(provider(createElement(BasicsHarness, { verticals: TWO })));
    expect(screen.queryByText(messages.vacancyForm.vertical.single)).toBeNull();
  });

  it('a saved draft keeps its own, stronger note', () => {
    render(
      provider(
        createElement(BasicsHarness, { verticals: ONE, lockedVertical: true }),
      ),
    );
    expect(
      screen.getByText(messages.vacancyForm.edit.verticalLocked),
    ).toBeTruthy();
    expect(screen.queryByText(messages.vacancyForm.vertical.single)).toBeNull();
  });
});
