// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { useRoleLabels } from '@/components/shell/role-summary';
import messages from '@/messages/uk.json';

const gambling = { id: 'v-gambling', name: 'Гемблінг' };
const crypto = { id: 'v-crypto', name: 'Крипто' };

function labels() {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(NextIntlClientProvider, {
      locale: 'uk',
      timeZone: 'Europe/Kyiv',
      messages,
      children,
    });
  return renderHook(() => useRoleLabels(), { wrapper }).result.current;
}

describe('useRoleLabels: top-bar «Роль · Вертикаль +N» in Ukrainian [D64, UI-04]', () => {
  it('labels a vertical role with its vertical and a global role alone', () => {
    const { label } = labels();
    expect(label({ role: 'RECRUITER', vertical: gambling })).toBe(
      'Рекрутер · Гемблінг',
    );
    expect(label({ role: 'FINANCE', vertical: null })).toBe('Фінансист');
    expect(label({ role: 'custom:sourcer', vertical: crypto })).toBe(
      'Особлива роль · Крипто',
    );
  });

  it('summarises the widest assignment and counts the rest', () => {
    const { summary } = labels();
    expect(summary([])).toBe('');
    expect(summary([{ role: 'TEAM_LEAD', vertical: gambling }])).toBe(
      'Тімлід · Гемблінг',
    );
    expect(
      summary([
        { role: 'HR', vertical: crypto },
        { role: 'HR', vertical: gambling },
        { role: 'HEAD_HR', vertical: crypto },
      ]),
    ).toBe('Керівник HR · Крипто +2');
    expect(
      summary([
        { role: 'RECRUITER', vertical: gambling },
        { role: 'ADMIN', vertical: null },
      ]),
    ).toBe('Адміністратор +1');
  });
});
