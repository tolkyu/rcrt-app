import type { RequestVacancyInput } from '@/lib/schemas/vacancy-request';

export type VacancyRequestValues = Omit<
  Required<RequestVacancyInput>,
  'headcount'
> & { headcount: string };
export const REQUEST_FIELDS = [
  'positionId',
  'headcount',
  'priority',
  'comment',
] as const;
export type RequestField = (typeof REQUEST_FIELDS)[number];
export type RequestError =
  | 'positionRequired'
  | 'positionUnavailable'
  | 'headcountRange'
  | 'priorityInvalid'
  | 'commentLong'
  | 'commentLines'
  | 'commentInvalid';
export type RequestErrors = Partial<Record<RequestField, RequestError>>;
export const REQUEST_FIELD_IDS: Record<RequestField, string> = {
  positionId: 'request-position',
  headcount: 'request-headcount',
  priority: 'request-priority',
  comment: 'request-comment',
};
export const emptyRequest: VacancyRequestValues = {
  positionId: '',
  headcount: '1',
  priority: 'NORMAL',
  comment: '',
};
export type RequestNotice = 'network' | 'failed' | 'rateLimited' | 'forbidden';
