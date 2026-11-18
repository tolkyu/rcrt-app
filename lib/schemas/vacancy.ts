import { z } from 'zod';
import {
  hasNoNul,
  isVacancyCursor,
  VACANCY_PRIORITIES,
  VACANCY_SEARCH_MAX,
  VACANCY_SEARCH_MIN,
  VACANCY_STATUSES,
} from '../vacancy-filters';
import {
  VACANCY_EMPLOYMENT_TYPES,
  VACANCY_LOCATION_MAX,
  VACANCY_PROBATION_DEFAULT,
  VACANCY_PROBATION_MAX,
  VACANCY_PROBATION_MIN,
  VACANCY_SENIORITIES,
  VACANCY_WORK_FORMATS,
} from '../vacancy-options';
import { VACANCY_STATUS_ACTIONS } from '../../server/domain/vacancy-status/transitions';
import { normalizePositionName } from '../position-name';
import { hasOnlyVisibleChars } from '../visible-text';
import {
  VACANCY_DRAFT_LIMIT,
  VACANCY_HEADCOUNT_MAX,
  VACANCY_TITLE_MAX,
  VACANCY_TITLE_MIN,
} from '../vacancy-limits';
import { richTextDocSchema } from './rich-text';
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
    workFormat: z.enum(VACANCY_WORK_FORMATS).nullable(),
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
    /** Server decision for this viewer (broad `vacancy.update` in the vertical, status OPEN/ON_HOLD, D94, D127); the service re-checks on write. */
    canChangeUrgency: z.boolean(),
    /** Server decision for this viewer: covering `vacancy.self_assign` grant, status OPEN, no recruiter yet (D1, D130); the service re-checks under the vacancy lock. */
    canSelfAssign: z.boolean(),
    /** Covering `vacancy.assign_recruiters` grant and status OPEN/ON_HOLD; also gates removal. */
    canAssignRecruiters: z.boolean(),
    /** Covering `vacancy.team_lead.set` grant, status OPEN/ON_HOLD and no Team Lead yet (D130-3). */
    canSetTeamLead: z.boolean(),
    /** Status actions legal from the stored status and granted to this viewer; empty for a DRAFT and a CANCELLED vacancy. */
    statusActions: z.array(z.enum(VACANCY_STATUS_ACTIONS)),
    /** A cancelled draft: only for the user who cancelled it (D123). A cancelled published vacancy: for everyone who reads it (D130-4). Absent otherwise. */
    cancelReason: z.string().optional(),
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

export const vacancyDraftCountSchema = z
  .object({ count: z.number().int().min(0) })
  .meta({ id: 'VacancyDraftCount' });
export type VacancyDraftCount = z.infer<typeof vacancyDraftCountSchema>;

export const formatVacancyNumber = (value: bigint): string =>
  `V-${value.toString().padStart(4, '0')}`;

export const VACANCY_WRITE_RATE_LIMIT = {
  perUser: 30,
  windowSeconds: 60,
} as const;
/** Creates (OPEN or DRAFT) per user per 24 hours; the per-minute limit above is the burst guard. */
export const VACANCY_DAILY_CREATE_LIMIT = {
  perUser: 100,
  windowSeconds: 24 * 60 * 60,
} as const;
/** The E2E suite creates hundreds of vacancies a day under one user; only APP_ENV=test lifts the cap, never a request value. */
export const VACANCY_DAILY_CREATE_LIMIT_TEST = 100_000;
export const vacancyDailyCreateLimit = (appEnv: string | undefined) =>
  appEnv === 'test'
    ? VACANCY_DAILY_CREATE_LIMIT_TEST
    : VACANCY_DAILY_CREATE_LIMIT.perUser;
export {
  VACANCY_DRAFT_LIMIT,
  VACANCY_HEADCOUNT_MAX,
  VACANCY_TITLE_MAX,
  VACANCY_TITLE_MIN,
};
export {
  VACANCY_EMPLOYMENT_TYPES,
  VACANCY_LOCATION_MAX,
  VACANCY_PROBATION_DEFAULT,
  VACANCY_PROBATION_MAX,
  VACANCY_PROBATION_MIN,
  VACANCY_SENIORITIES,
  VACANCY_WORK_FORMATS,
};

/** Same normal form as catalog names: NFC, collapsed whitespace; control, zero-width and bidi characters are rejected before storing. */
const line = (min: number, max: number) =>
  z
    .string()
    .refine(hasOnlyVisibleChars, 'invalid_chars')
    .overwrite(normalizePositionName)
    .min(min)
    .max(max);
const minorUnits = z.string().regex(/^(?:0|[1-9]\d{0,14})$/);

const title = line(VACANCY_TITLE_MIN, VACANCY_TITLE_MAX);
const editableFields = {
  teamLeadId: uuid.nullish(),
  headcount: z.number().int().min(1).max(VACANCY_HEADCOUNT_MAX).optional(),
  seniority: z.enum(VACANCY_SENIORITIES).nullish(),
  workFormat: z.enum(VACANCY_WORK_FORMATS).nullish(),
  employmentType: z.enum(VACANCY_EMPLOYMENT_TYPES).nullish(),
  location: line(1, VACANCY_LOCATION_MAX).nullish(),
  salaryMinMinor: minorUnits.nullish(),
  salaryMaxMinor: minorUnits.nullish(),
  salaryCurrency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullish(),
  priority: z.enum(VACANCY_PRIORITIES).optional(),
  probationDays: z
    .number()
    .int()
    .min(VACANCY_PROBATION_MIN)
    .max(VACANCY_PROBATION_MAX)
    .optional()
    .meta({
      description: `30..90 days (default 90). Refused with 403 unless the caller holds vacancy.probation_length.set in the vertical (Admin, Head HR; D78).`,
    }),
  descriptionDoc: richTextDocSchema.nullish(),
  requirementsDoc: richTextDocSchema.nullish(),
};
const baseFields = { verticalId: uuid, title, ...editableFields };

type SalaryFields = {
  readonly salaryMinMinor?: string | null | undefined;
  readonly salaryMaxMinor?: string | null | undefined;
  readonly salaryCurrency?: string | null | undefined;
};

/** Currency is required exactly when a bound is set and min never exceeds max (VAC-01, DB check vacancy_salary_chk). */
export function salaryIssues(value: SalaryFields, add: (path: string) => void) {
  const { salaryMinMinor: min, salaryMaxMinor: max, salaryCurrency } = value;
  const hasBound = min != null || max != null;
  if (hasBound !== (salaryCurrency != null)) add('salaryCurrency');
  if (min != null && max != null && BigInt(min) > BigInt(max))
    add('salaryMaxMinor');
}

const checkSalary = (value: SalaryFields, ctx: z.RefinementCtx) =>
  salaryIssues(value, (path) =>
    ctx.addIssue({ code: 'custom', path: [path], message: 'invalid_salary' }),
  );

const publishVacancySchema = z
  .object({ mode: z.literal('PUBLISH'), positionId: uuid, ...baseFields })
  .strict()
  .superRefine(checkSalary);
const draftVacancySchema = z
  .object({
    mode: z.literal('DRAFT'),
    positionId: uuid.nullish(),
    ...baseFields,
  })
  .strict()
  .superRefine(checkSalary);

export const createVacancySchema = z
  .discriminatedUnion('mode', [publishVacancySchema, draftVacancySchema])
  .meta({
    id: 'CreateVacancy',
    description:
      'PUBLISH creates an OPEN vacancy and needs an active position of the vertical; DRAFT saves the author’s private draft where only vertical and title are required (D89, D92). Bonus fields do not exist on this contract: unknown keys answer 400. `teamLeadId` needs vacancy.team_lead.set (Admin, Head Recruiter) and a Team Lead of the same vertical; without it the vacancy is recruiter-initiated (D77).',
  });
export type CreateVacancyInput = z.input<typeof createVacancySchema>;
export type CreateVacancyBody = z.output<typeof createVacancySchema>;

const expectedVersion = z.number().int().positive().meta({
  description:
    'Version the client last read; a different current version answers 409 STALE_STATE and nothing is saved.',
});

export const patchVacancySchema = z
  .object({
    expectedVersion,
    title: title.optional(),
    positionId: uuid.nullish(),
    ...editableFields,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (Object.keys(value).length < 2)
      ctx.addIssue({ code: 'custom', path: [], message: 'empty_patch' });
  })
  .meta({
    id: 'PatchVacancy',
    description:
      'Partial update of the author’s own DRAFT: a missing key keeps the stored value, `null` clears an optional field. The vertical, the status and the author cannot be changed (unknown keys answer 400). A change of `teamLeadId` needs vacancy.team_lead.set, a change of `probationDays` needs vacancy.probation_length.set (403). A salary bound needs the currency and min ≤ max once merged with the stored values.',
  });
export type PatchVacancyInput = z.input<typeof patchVacancySchema>;
export type PatchVacancyBody = z.output<typeof patchVacancySchema>;

export const publishDraftSchema = z.object({ expectedVersion }).strict().meta({
  id: 'PublishDraft',
  description:
    'Publishes exactly the draft the author last saw: when the stored version differs the answer is 409 STALE_STATE and the draft stays a draft.',
});
export type PublishDraftInput = z.input<typeof publishDraftSchema>;

export const setVacancyUrgencySchema = z
  .object({ priority: z.enum(VACANCY_PRIORITIES), expectedVersion })
  .strict()
  .meta({
    id: 'SetVacancyUrgency',
    description:
      'Sets the vacancy urgency flag (NORMAL or URGENT; not the Team Lead priority). Needs a vacancy-wide `vacancy.update` grant (Head Recruiter of the vertical, Admin); a Team Lead is refused with 403 even on own vacancies (D94). Only OPEN and ON_HOLD change (409 VACANCY_URGENCY_LOCKED otherwise, D127); a stale `expectedVersion` answers 409 STALE_STATE; a request for the value already stored writes nothing and answers 200.',
  });
export type SetVacancyUrgencyInput = z.input<typeof setVacancyUrgencySchema>;

export const vacancyDeletedSchema = z
  .object({ id: z.uuid() })
  .meta({ id: 'VacancyDeleted' });
