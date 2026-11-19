/** Free of Zod so the form page can offer these without bundling the schemas; the vacancy schema imports every constant here except the currencies, which only the form restricts (the API accepts any ISO code). */
export const VACANCY_PROBATION_MIN = 30;
export const VACANCY_PROBATION_MAX = 90;
export const VACANCY_PROBATION_DEFAULT = 90;
export const VACANCY_LOCATION_MAX = 200;
/** Closed lists (D111); the stored value is the label itself, so existing rows need no migration. */
export const VACANCY_SENIORITIES = [
  'Джуніор',
  'Мідл',
  'Сеніор',
  'Лід',
] as const;
export const VACANCY_EMPLOYMENT_TYPES = [
  'Повна зайнятість',
  'Часткова зайнятість',
  'Проєктна зайнятість',
] as const;
export const VACANCY_WORK_FORMATS = ['REMOTE', 'OFFICE', 'HYBRID'] as const;
/** Owner decision D116: USD first, then EUR and UAH; all three have two minor digits. */
export const VACANCY_SALARY_CURRENCIES = ['USD', 'EUR', 'UAH'] as const;
