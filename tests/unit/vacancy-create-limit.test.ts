import { describe, expect, it } from 'vitest';
import {
  VACANCY_DAILY_CREATE_LIMIT,
  VACANCY_DAILY_CREATE_LIMIT_TEST,
  vacancyDailyCreateLimit,
} from '../../lib/schemas/vacancy';

describe('daily vacancy create limit [SEC-VC-01]', () => {
  it('stays at 100 per user per 24 hours', () => {
    expect(VACANCY_DAILY_CREATE_LIMIT).toEqual({
      perUser: 100,
      windowSeconds: 86_400,
    });
  });

  it.each(['production', 'preview', 'local', '', undefined, 'TEST', 'test '])(
    'is 100 for APP_ENV=%j',
    (appEnv) => {
      expect(vacancyDailyCreateLimit(appEnv)).toBe(100);
    },
  );

  it('is raised only for APP_ENV=test', () => {
    expect(vacancyDailyCreateLimit('test')).toBe(
      VACANCY_DAILY_CREATE_LIMIT_TEST,
    );
    expect(VACANCY_DAILY_CREATE_LIMIT_TEST).toBeGreaterThan(
      VACANCY_DAILY_CREATE_LIMIT.perUser,
    );
  });
});
