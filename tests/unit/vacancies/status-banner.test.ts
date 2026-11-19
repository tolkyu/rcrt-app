// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VacancyOverview } from '@/components/vacancies/vacancy-overview';
import messages from '@/messages/uk.json';
import {
  mountInUk as mount,
  shareVacancy as detail,
} from '@/tests/support/vacancy-share-harness';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) =>
    createElement('a', { href }, children),
}));

const t = messages.vacancies.statusMenu.banner;
const closedAt = { updatedAt: '2026-11-20T09:00:00.000Z' };

afterEach(cleanup);

describe('closed-state notes and banners [STORY-VAC-02-1, D130(4)]', () => {
  it('a paused vacancy that can be resumed says how, and why recruiters do not see a free one', () => {
    mount(
      createElement(VacancyOverview, {
        vacancy: detail({ status: 'ON_HOLD', statusActions: ['RESUME'] }),
      }),
    );
    expect(screen.getByText(`${t.onHold} ${t.onHoldFree}`)).toBeTruthy();
  });

  it('a viewer who cannot resume hears only the fact; an assigned vacancy needs no «free» line', () => {
    const recruiter = {
      id: crypto.randomUUID(),
      fullName: 'Оксана Кравець',
      isActive: true,
    };
    mount(
      createElement(VacancyOverview, {
        vacancy: detail({ status: 'ON_HOLD', recruiters: [recruiter] }),
      }),
    );
    expect(screen.getByText(t.onHoldReadOnly)).toBeTruthy();
  });

  it('FILLED: the closing day', () => {
    mount(
      createElement(VacancyOverview, {
        vacancy: detail({ status: 'FILLED', ...closedAt }),
      }),
    );
    expect(
      screen.getByText('Вакансію закрито 20.11.2026 — Заповнена'),
    ).toBeTruthy();
  });

  it('CANCELLED: the banner and the reason for everyone who reads it', () => {
    mount(
      createElement(VacancyOverview, {
        vacancy: detail({
          status: 'CANCELLED',
          cancelReason: 'Бюджет заморожено\nдо весни',
          ...closedAt,
        }),
      }),
    );
    expect(
      screen.getByText(
        'Вакансію скасовано 20.11.2026. Скасовану вакансію не можна відкрити знову.',
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Бюджет заморожено/).textContent).toContain(
      'до весни',
    );
    expect(
      screen.getByText(messages.vacancies.draft.cancelReasonTitle),
    ).toBeTruthy();
  });

  it('a private cancelled draft keeps its own note and gets no banner', () => {
    mount(
      createElement(VacancyOverview, {
        vacancy: detail({ status: 'CANCELLED', openedAt: null, ...closedAt }),
      }),
    );
    expect(screen.queryByText(/Вакансію скасовано/)).toBeNull();
  });

  it('an open vacancy has none', () => {
    mount(createElement(VacancyOverview, { vacancy: detail() }));
    expect(
      screen.queryByText(/Вакансію (закрито|скасовано|призупинено)/),
    ).toBeNull();
  });
});
