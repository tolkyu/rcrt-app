import { z } from 'zod';
import {
  hasNoNul,
  isVacancyCursor,
  VACANCY_PRIORITIES,
  VACANCY_SEARCH_MAX,
  VACANCY_SEARCH_MIN,
  VACANCY_STATUSES,
} from '../vacancy-filters';
import { uuid } from './uuid';

const cursor = z.string().max(19).refine(isVacancyCursor, 'invalid_cursor');
const identity = z.object({ id: z.uuid(), name: z.string() });
const participant = z.object({
  id: z.uuid(),
  fullName: z.string(),
  isActive: z.boolean(),
});

export const vacancyListQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .min(VACANCY_SEARCH_MIN)
      .max(VACANCY_SEARCH_MAX)
      .refine(hasNoNul, 'invalid_chars')
      .optional(),
    vertical: uuid.optional(),
    status: z.enum(VACANCY_STATUSES).optional(),
    priority: z.enum(VACANCY_PRIORITIES).optional(),
    cursor: cursor.optional(),
    direction: z.enum(['older', 'newer']).optional(),
    limit: z.coerce
      .number()
      .pipe(z.union([z.literal(25), z.literal(50), z.literal(100)]))
      .default(25),
  })
  .refine((value) => !value.direction || !!value.cursor, {
    path: ['direction'],
    message: 'cursor_required',
  })
  .meta({ id: 'VacancyListQuery' });
export type ResolvedVacancyListQuery = z.output<typeof vacancyListQuerySchema>;
export type VacancyListQuery = Omit<ResolvedVacancyListQuery, 'limit'> & {
  readonly limit?: 25 | 50 | 100;
};

export const vacancyIdParamsSchema = z.object({ vacancyId: uuid });

export const vacancySummarySchema = z
  .object({
    id: z.uuid(),
    number: z.string().regex(/^V-\d{4,19}$/),
    title: z.string(),
    vertical: identity,
    position: identity.nullable(),
    teamLead: participant.nullable(),
    recruiters: z.array(participant),
    status: z.enum(VACANCY_STATUSES),
    priority: z.enum(VACANCY_PRIORITIES),
    source: z.enum(['APP', 'TELEGRAM_BOT']),
    openedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'VacancySummary' });
export type VacancySummary = z.infer<typeof vacancySummarySchema>;

export const vacancyDetailSchema = vacancySummarySchema
  .extend({
    headcount: z.number().int().positive(),
    seniority: z.string().nullable(),
    workFormat: z.enum(['REMOTE', 'OFFICE', 'HYBRID']).nullable(),
    employmentType: z.string().nullable(),
    location: z.string().nullable(),
    salaryMinMinor: z
      .string()
      .regex(/^\d{1,19}$/)
      .nullable(),
    salaryMaxMinor: z
      .string()
      .regex(/^\d{1,19}$/)
      .nullable(),
    salaryCurrency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    probationDays: z.number().int().min(30).max(90),
    recruiterInitiated: z.boolean(),
    version: z.number().int().positive(),
  })
  .meta({ id: 'VacancyDetail' });
export type VacancyDetail = z.infer<typeof vacancyDetailSchema>;

export const vacancyPageSchema = z
  .object({
    items: z.array(vacancySummarySchema).max(100),
    nextCursor: cursor.nullable(),
    prevCursor: cursor.nullable(),
  })
  .meta({ id: 'VacancyPage' });
export type VacancyPage = z.infer<typeof vacancyPageSchema>;

export const formatVacancyNumber = (value: bigint): string =>
  `V-${value.toString().padStart(4, '0')}`;
