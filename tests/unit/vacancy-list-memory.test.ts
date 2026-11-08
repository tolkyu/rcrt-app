// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  rememberVacancyList,
  savedVacancyListSearch,
  vacancyListHref,
} from '@/lib/vacancy-list-memory';

const VACANCY = '22222222-2222-4222-8222-222222222222';

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('vacancy list memory [VAC-04, UI-09]', () => {
  it('links to the plain list when nothing was visited', () => {
    expect(vacancyListHref(savedVacancyListSearch())).toBe('/vacancies');
  });

  it('returns to the remembered filters, page and selection', () => {
    rememberVacancyList(
      `q=Face&status=OPEN&cursor=9&direction=newer&vacancy=${VACANCY}`,
    );
    expect(vacancyListHref(savedVacancyListSearch())).toBe(
      `/vacancies?q=Face&status=OPEN&cursor=9&direction=newer&vacancy=${VACANCY}`,
    );
  });

  it('drops unknown or malformed parameters from a tampered value', () => {
    rememberVacancyList(
      'q=Face&redirect=https%3A%2F%2Fevil.test&status=ARCHIVED&cursor=abc&vacancy=1',
    );
    expect(savedVacancyListSearch()).toBe('q=Face');
  });

  it('falls back to the plain list when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(() => rememberVacancyList('q=Face')).not.toThrow();
    expect(savedVacancyListSearch()).toBe('');
  });
});
