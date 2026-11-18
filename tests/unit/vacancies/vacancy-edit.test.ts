import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import { vacancyFormValues } from '@/lib/vacancy-edit-form';
import {
  buildPatch,
  createAttemptKeys,
  parseVacancyForm,
  planEditFailure,
  submitEdit,
  type EditRequest,
} from '@/lib/vacancy-edit-submit';
import type { VacancyFormMode, VacancyFormValues } from '@/lib/vacancy-form';

const VERTICAL = '8b1f5a0e-0c2d-4f6e-9d7a-2b3c4d5e6f70';
const POSITION = '3f1e2d3c-4b5a-4968-8776-655443322110';
const OTHER_POSITION = '4a2f3e4d-5c6b-4a79-9887-766554433221';
const LEAD = '5d2c7e90-1f3a-4b8c-9a6d-7e8f90a1b2c3';
const VACANCY = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

afterEach(() => vi.unstubAllGlobals());

const draft = (changes: Partial<VacancyDetail> = {}): VacancyDetail => ({
  id: VACANCY,
  number: 'V-0015',
  title: 'Медіабаєр — Facebook',
  vertical: { id: VERTICAL, name: 'Гемблінг' },
  position: { id: POSITION, name: 'Медіабаєр — Facebook' },
  teamLead: null,
  recruiters: [],
  status: 'DRAFT',
  priority: 'NORMAL',
  source: 'APP',
  openedAt: null,
  createdAt: '2026-11-16T08:00:00.000Z',
  updatedAt: '2026-11-16T08:00:00.000Z',
  headcount: 2,
  seniority: 'Мідл',
  workFormat: null,
  employmentType: null,
  location: 'Київ',
  salaryMinMinor: '250000',
  salaryMaxMinor: '400050',
  salaryCurrency: 'USD',
  probationDays: 90,
  recruiterInitiated: true,
  version: 3,
  canChangeUrgency: false,
  canSelfAssign: false,
  canAssignRecruiters: false,
  canSetTeamLead: false,
  statusActions: [],
  ...changes,
});

const filledFor = (shown: { probation: boolean }) =>
  shown.probation
    ? (['headcount', 'probationDays'] as const)
    : (['headcount'] as const);

const SHOWN_ALL = { teamLead: true, probation: true };
const SHOWN_NONE = { teamLead: false, probation: false };

/** What the pipeline does for one press: the baseline is the stored draft, `edit` is what the user typed over it. */
function patchFor(
  edit: Partial<VacancyFormValues>,
  {
    shown = SHOWN_ALL,
    mode = 'DRAFT',
    stored = draft(),
  }: {
    shown?: typeof SHOWN_ALL;
    mode?: VacancyFormMode;
    stored?: VacancyDetail;
  } = {},
) {
  const baseline = vacancyFormValues(stored, shown.probation);
  const values = { ...baseline, ...edit };
  const parsed = parseVacancyForm(values, mode, filledFor(shown));
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  const plan = buildPatch(baseline, values, parsed.body, shown);
  if (!plan.ok) throw new Error(JSON.stringify(plan.errors));
  return plan.changes;
}

describe('vacancyFormValues: a saved draft as form text [STORY-VAC-01-1]', () => {
  it('shows every stored value, salary in its normal form, probation only when the field is shown', () => {
    expect(vacancyFormValues(draft(), true)).toEqual({
      verticalId: VERTICAL,
      positionId: POSITION,
      title: 'Медіабаєр — Facebook',
      headcount: '2',
      priority: 'NORMAL',
      teamLeadId: '',
      seniority: 'Мідл',
      workFormat: '',
      employmentType: '',
      location: 'Київ',
      salaryMin: '2 500',
      salaryMax: '4 000,5',
      salaryCurrency: 'USD',
      probationDays: '90',
    });
    expect(vacancyFormValues(draft(), false).probationDays).toBe('');
  });

  it('turns absent values into empty text, never «null»', () => {
    const values = vacancyFormValues(
      draft({
        position: null,
        seniority: null,
        location: null,
        salaryMinMinor: null,
        salaryMaxMinor: null,
        salaryCurrency: null,
        teamLead: { id: LEAD, fullName: 'Василь Мороз', isActive: true },
      }),
      false,
    );
    expect(values).toMatchObject({
      positionId: '',
      seniority: '',
      location: '',
      salaryMin: '',
      salaryMax: '',
      salaryCurrency: '',
      teamLeadId: LEAD,
    });
  });
});

describe('buildPatch: only what the user changed is sent [ux §5]', () => {
  const cases: [string, Partial<VacancyFormValues>, object | null][] = [
    ['nothing typed', {}, null],
    ['a title', { title: 'Нова назва' }, { title: 'Нова назва' }],
    [
      'the same title with stray spaces (the contract normalises it)',
      { title: '  Медіабаєр —  Facebook ' },
      { title: 'Медіабаєр — Facebook' },
    ],
    [
      'a position',
      { positionId: OTHER_POSITION },
      { positionId: OTHER_POSITION },
    ],
    ['the position cleared', { positionId: '' }, { positionId: null }],
    ['headcount', { headcount: '5' }, { headcount: 5 }],
    ['urgency', { priority: 'URGENT' }, { priority: 'URGENT' }],
    ['a level', { seniority: 'Сеніор' }, { seniority: 'Сеніор' }],
    ['a level cleared', { seniority: '' }, { seniority: null }],
    ['the location cleared', { location: '' }, { location: null }],
    [
      'the salary minimum',
      { salaryMin: '3 000' },
      { salaryMinMinor: '300000' },
    ],
    [
      'the whole salary cleared',
      { salaryMin: '', salaryMax: '', salaryCurrency: '' },
      { salaryMinMinor: null, salaryMaxMinor: null, salaryCurrency: null },
    ],
    ['the currency', { salaryCurrency: 'EUR' }, { salaryCurrency: 'EUR' }],
    ['probation', { probationDays: '60' }, { probationDays: 60 }],
    ['a Team Lead', { teamLeadId: LEAD }, { teamLeadId: LEAD }],
    [
      'two fields',
      { title: 'Інша назва', location: 'Львів' },
      { title: 'Інша назва', location: 'Львів' },
    ],
  ];

  it.each(cases)('%s', (_name, edit, expected) => {
    expect(patchFor(edit)).toEqual(expected);
  });

  it.each([
    [
      'probation cleared',
      { probationDays: '' },
      { probationDays: 'probationRange' },
    ],
    ['headcount cleared', { headcount: '' }, { headcount: 'headcountRange' }],
    [
      'both cleared',
      { headcount: ' ', probationDays: ' ' },
      { headcount: 'headcountRange', probationDays: 'probationRange' },
    ],
  ])(
    '%s on edit is a required-field error in either mode, so nothing is sent [S3.3 review]',
    (_name, edit, errors) => {
      const baseline = vacancyFormValues(draft(), true);
      for (const mode of ['DRAFT', 'PUBLISH'] as const)
        expect(
          parseVacancyForm(
            { ...baseline, ...edit },
            mode,
            filledFor(SHOWN_ALL),
          ),
        ).toEqual({ ok: false, errors });
    },
  );

  it('create keeps its defaults: a blank headcount and no probation text are fine without the edit rule', () => {
    const values = {
      ...vacancyFormValues(draft(), true),
      headcount: '',
      probationDays: '',
    };
    expect(parseVacancyForm(values, 'DRAFT')).toMatchObject({ ok: true });
  });

  it('a probation field the role cannot see is not required', () => {
    expect(patchFor({ title: 'Інша назва' }, { shown: SHOWN_NONE })).toEqual({
      title: 'Інша назва',
    });
  });

  it('a changed field that has no patch is refused, never dropped', () => {
    const baseline = vacancyFormValues(draft(), true);
    const values = { ...baseline, headcount: '', probationDays: '' };
    const parsed = parseVacancyForm(values, 'DRAFT');
    if (!parsed.ok) throw new Error('create rules accept this');
    expect(buildPatch(baseline, values, parsed.body, SHOWN_ALL)).toEqual({
      ok: false,
      errors: { headcount: 'headcountRange' },
    });
    const withHeadcount = { ...values, headcount: '3' };
    const reparsed = parseVacancyForm(withHeadcount, 'DRAFT');
    if (!reparsed.ok) throw new Error('create rules accept this');
    expect(
      buildPatch(baseline, withHeadcount, reparsed.body, SHOWN_ALL),
    ).toEqual({ ok: false, errors: { probationDays: 'probationRange' } });
  });

  it('never sends a Team Lead or probation key the role may not set, even when the text differs', () => {
    expect(
      patchFor(
        { teamLeadId: LEAD, probationDays: '60', title: 'Інша назва' },
        { shown: SHOWN_NONE },
      ),
    ).toEqual({ title: 'Інша назва' });
  });
});

describe('planEditFailure: what the edit form does with every failed call [ux §4.2, §5]', () => {
  const problem = (status: number, code: string) =>
    new ApiError(status, code, []);
  const generic = {
    type: 'toast',
    tone: 'error',
    title: 'failed',
    description: 'failedDescription',
    retry: true,
  };
  const cases: [string, unknown, boolean, object][] = [
    [
      'another tab saved first',
      problem(409, 'STALE_STATE'),
      true,
      { type: 'stale' },
    ],
    [
      'published or cancelled elsewhere',
      problem(409, 'VACANCY_NOT_DRAFT'),
      true,
      { type: 'notDraft' },
    ],
    [
      'deleted or access lost',
      problem(404, 'NOT_FOUND'),
      true,
      { type: 'gone' },
    ],
    [
      'the position was deactivated',
      problem(409, 'POSITION_INACTIVE'),
      true,
      { type: 'fields', errors: { positionId: 'positionInactive' } },
    ],
    [
      'publish without a position',
      new ApiError(400, 'VALIDATION_FAILED', [
        { path: 'body.positionId', code: 'required' },
      ]),
      true,
      { type: 'fields', errors: { positionId: 'positionRequired' } },
    ],
    [
      'the Team Lead is no longer eligible',
      new ApiError(400, 'VALIDATION_FAILED', [
        { path: 'body.teamLeadId', code: 'invalid_team_lead' },
      ]),
      true,
      { type: 'fields', errors: { teamLeadId: 'teamLeadInvalid' } },
    ],
    [
      'a salary without currency',
      new ApiError(400, 'VALIDATION_FAILED', [
        { path: 'body.salaryCurrency', code: 'invalid_salary' },
      ]),
      true,
      { type: 'fields', errors: { salaryCurrency: 'salaryCurrencyNoAmount' } },
    ],
    [
      'rate limit',
      problem(429, 'RATE_LIMITED'),
      true,
      { type: 'toast', tone: 'warning', title: 'rateLimited', retry: false },
    ],
    [
      'forbidden',
      problem(403, 'FORBIDDEN'),
      true,
      { type: 'toast', tone: 'error', title: 'forbidden', retry: false },
    ],
    [
      'no connection',
      new TypeError('Failed to fetch'),
      true,
      {
        type: 'toast',
        tone: 'error',
        title: 'noConnection',
        description: 'noConnectionDescription',
        retry: true,
      },
    ],
    ['server error', problem(500, 'INTERNAL'), true, generic],
    [
      'a create-only answer reads as a generic failure',
      problem(409, 'DRAFT_LIMIT_REACHED'),
      true,
      generic,
    ],
    [
      'reused key, first time',
      problem(409, 'IDEMPOTENCY_KEY_REUSED'),
      false,
      { type: 'retry' },
    ],
    [
      'reused key, after the retry',
      problem(409, 'IDEMPOTENCY_KEY_REUSED'),
      true,
      generic,
    ],
  ];

  it.each(cases)('%s', (_name, error, retried, expected) => {
    expect(planEditFailure(error, retried)).toEqual(expected);
  });
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const problemBody = (code: string, errors?: unknown) => ({ code, errors });

function setup(answers: Response[]) {
  const fetchSpy = vi.fn<typeof fetch>();
  for (const answer of answers) fetchSpy.mockResolvedValueOnce(answer);
  vi.stubGlobal('fetch', fetchSpy);
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const sent = () =>
    fetchSpy.mock.calls.map(([url, init]) => ({
      url,
      method: init?.method,
      body: init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : undefined,
      key: (init?.headers as Record<string, string>)['Idempotency-Key'],
    }));
  return { queryClient, invalidate, sent };
}

const request = (changes: Partial<EditRequest> = {}): EditRequest => ({
  id: VACANCY,
  version: 3,
  action: 'DRAFT',
  changes: { title: 'Нова назва' },
  everything: { title: 'Нова назва', location: 'Київ' },
  hasSalaryAmount: true,
  ...changes,
});

describe('submitEdit: PATCH, then publish [ux §5]', () => {
  it('a save with nothing to send makes no request', async () => {
    const { queryClient, sent } = setup([]);
    const outcome = await submitEdit(
      queryClient,
      createAttemptKeys(),
      request({ changes: null }),
    );
    expect(outcome).toEqual({ status: 'saved', vacancy: null });
    expect(sent()).toEqual([]);
  });

  it('a save sends the changed keys with the version, seeds the card and refreshes every list', async () => {
    const saved = draft({ title: 'Нова назва', version: 4 });
    const { queryClient, invalidate, sent } = setup([json(200, saved)]);
    const outcome = await submitEdit(
      queryClient,
      createAttemptKeys(),
      request(),
    );
    expect(outcome).toEqual({ status: 'saved', vacancy: saved });
    expect(sent()).toEqual([
      {
        url: `/api/v1/vacancies/${VACANCY}`,
        method: 'PATCH',
        body: { title: 'Нова назва', expectedVersion: 3 },
        key: undefined,
      },
    ]);
    expect(queryClient.getQueryData(queryKeys.vacancy(VACANCY))).toEqual(saved);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['vacancies'] });
  });

  it('a publish saves first and publishes the version the save returned, under one idempotency key', async () => {
    const saved = draft({ title: 'Нова назва', version: 4 });
    const published = { ...saved, status: 'OPEN', version: 5 };
    const { queryClient, sent } = setup([
      json(200, saved),
      json(200, published),
    ]);
    const outcome = await submitEdit(
      queryClient,
      createAttemptKeys(),
      request({ action: 'PUBLISH' }),
    );
    expect(outcome).toEqual({ status: 'published', vacancy: published });
    const [patch, publish] = sent();
    expect(patch?.method).toBe('PATCH');
    expect(publish).toMatchObject({
      url: `/api/v1/vacancies/${VACANCY}/publish`,
      method: 'POST',
      body: { expectedVersion: 4 },
    });
    expect(publish?.key).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(queryClient.getQueryData(queryKeys.vacancy(VACANCY))).toEqual(
      published,
    );
  });

  it('a publish without changes skips the PATCH and publishes the stored version', async () => {
    const published = { ...draft(), status: 'OPEN', version: 4 };
    const { queryClient, sent } = setup([json(200, published)]);
    await submitEdit(
      queryClient,
      createAttemptKeys(),
      request({ action: 'PUBLISH', changes: null }),
    );
    expect(sent().map(({ method, body }) => [method, body])).toEqual([
      ['POST', { expectedVersion: 3 }],
    ]);
  });

  it('a stale version on the save is reported (after one look at the stored draft) and no publish is sent', async () => {
    const { queryClient, sent } = setup([
      json(409, problemBody('STALE_STATE')),
      json(200, draft({ title: 'Інша вкладка', version: 4 })),
    ]);
    const outcome = await submitEdit(
      queryClient,
      createAttemptKeys(),
      request({ action: 'PUBLISH' }),
    );
    expect(outcome).toEqual({
      status: 'failed',
      effect: { type: 'stale' },
      stage: 'patch',
      saved: null,
    });
    expect(sent().map(({ method }) => method)).toEqual(['PATCH', 'GET']);
  });

  describe('a PATCH retry after a lost answer [BUG-S3-5]', () => {
    const stale = () => json(409, problemBody('STALE_STATE'));

    it('is a success when the stored draft already holds the change', async () => {
      const stored = draft({ title: 'Нова назва', version: 4 });
      const { queryClient, sent } = setup([stale(), json(200, stored)]);
      const outcome = await submitEdit(
        queryClient,
        createAttemptKeys(),
        request(),
      );
      expect(outcome).toEqual({ status: 'saved', vacancy: stored });
      expect(sent().map(({ method }) => method)).toEqual(['PATCH', 'GET']);
      expect(queryClient.getQueryData(queryKeys.vacancy(VACANCY))).toEqual(
        stored,
      );
    });

    it('publishes the stored version after it when the action was a publish', async () => {
      const stored = draft({ title: 'Нова назва', version: 4 });
      const { queryClient, sent } = setup([
        stale(),
        json(200, stored),
        json(200, { ...stored, status: 'OPEN', version: 5 }),
      ]);
      const outcome = await submitEdit(
        queryClient,
        createAttemptKeys(),
        request({ action: 'PUBLISH' }),
      );
      expect(outcome.status).toBe('published');
      expect(sent()[2]?.body).toEqual({ expectedVersion: 4 });
    });

    it('stays a stale warning when another tab stored something else', async () => {
      const other = draft({ title: 'Інша вкладка', version: 4 });
      const { queryClient } = setup([stale(), json(200, other)]);
      expect(
        await submitEdit(queryClient, createAttemptKeys(), request()),
      ).toMatchObject({ status: 'failed', effect: { type: 'stale' } });
    });

    it('stays a stale warning on a partial match: the changed key is stored, another field on screen is not', async () => {
      const partial = draft({
        title: 'Нова назва',
        location: 'Одеса',
        version: 4,
      });
      const { queryClient } = setup([stale(), json(200, partial)]);
      expect(
        await submitEdit(queryClient, createAttemptKeys(), request()),
      ).toMatchObject({ status: 'failed', effect: { type: 'stale' } });
    });

    it('stays a stale warning when the version moved by more than one write', async () => {
      const moved = draft({ title: 'Нова назва', version: 5 });
      const { queryClient } = setup([stale(), json(200, moved)]);
      expect(
        await submitEdit(queryClient, createAttemptKeys(), request()),
      ).toMatchObject({ status: 'failed', effect: { type: 'stale' } });
    });

    it('stays a stale warning when the stored draft cannot be read or is no draft', async () => {
      const unreadable = setup([stale(), json(500, problemBody('INTERNAL'))]);
      expect(
        await submitEdit(
          unreadable.queryClient,
          createAttemptKeys(),
          request(),
        ),
      ).toMatchObject({ effect: { type: 'stale' } });
      const published = setup([
        stale(),
        json(200, draft({ title: 'Нова назва', status: 'OPEN', version: 4 })),
      ]);
      expect(
        await submitEdit(published.queryClient, createAttemptKeys(), request()),
      ).toMatchObject({ effect: { type: 'stale' } });
    });

    it('compares keys that live in nested fields: position, Team Lead and salary', async () => {
      const stored = draft({
        version: 4,
        position: { id: OTHER_POSITION, name: 'Інша' },
        salaryMinMinor: '300000',
      });
      const { queryClient } = setup([stale(), json(200, stored)]);
      const outcome = await submitEdit(
        queryClient,
        createAttemptKeys(),
        request({
          changes: { positionId: OTHER_POSITION, salaryMinMinor: '300000' },
          everything: { positionId: OTHER_POSITION, salaryMinMinor: '300000' },
        }),
      );
      expect(outcome.status).toBe('saved');
    });
  });

  it('a stale version on the publish keeps the saved draft for the form', async () => {
    const saved = draft({ title: 'Нова назва', version: 4 });
    const { queryClient } = setup([
      json(200, saved),
      json(409, problemBody('STALE_STATE')),
    ]);
    const outcome = await submitEdit(
      queryClient,
      createAttemptKeys(),
      request({ action: 'PUBLISH' }),
    );
    expect(outcome).toEqual({
      status: 'failed',
      effect: { type: 'stale' },
      stage: 'publish',
      saved,
    });
  });

  it('a refused publish after a good save maps to the field codes and hands back the saved draft', async () => {
    const saved = draft({ version: 4 });
    const { queryClient } = setup([
      json(200, saved),
      json(409, problemBody('POSITION_INACTIVE')),
    ]);
    const outcome = await submitEdit(
      queryClient,
      createAttemptKeys(),
      request({ action: 'PUBLISH' }),
    );
    expect(outcome).toEqual({
      status: 'failed',
      effect: { type: 'fields', errors: { positionId: 'positionInactive' } },
      stage: 'publish',
      saved,
    });
  });

  it('a refused field on the save is a patch-stage failure with nothing saved', async () => {
    const { queryClient } = setup([
      json(
        400,
        problemBody('VALIDATION_FAILED', [
          { path: 'body.teamLeadId', code: 'invalid_team_lead' },
        ]),
      ),
    ]);
    const outcome = await submitEdit(
      queryClient,
      createAttemptKeys(),
      request(),
    );
    expect(outcome).toMatchObject({
      status: 'failed',
      effect: { type: 'fields', errors: { teamLeadId: 'teamLeadInvalid' } },
      stage: 'patch',
      saved: null,
    });
  });

  it('a reused idempotency key gets one silent retry under a new key', async () => {
    const published = { ...draft(), status: 'OPEN', version: 4 };
    const { queryClient, sent } = setup([
      json(409, problemBody('IDEMPOTENCY_KEY_REUSED')),
      json(200, published),
    ]);
    const outcome = await submitEdit(
      queryClient,
      createAttemptKeys(),
      request({ action: 'PUBLISH', changes: null }),
    );
    expect(outcome.status).toBe('published');
    const [first, second] = sent();
    expect(second?.key).not.toBe(first?.key);
  });

  it('a retry of the same publish reuses its key, a new version gets a new one', async () => {
    const { queryClient, sent } = setup([
      new Response('', { status: 502 }),
      json(200, { ...draft(), status: 'OPEN', version: 4 }),
      new Response('', { status: 502 }),
    ]);
    const attempts = createAttemptKeys();
    const publish = (version: number) =>
      submitEdit(
        queryClient,
        attempts,
        request({ action: 'PUBLISH', changes: null, version }),
      );
    expect((await publish(3)).status).toBe('failed');
    expect((await publish(3)).status).toBe('published');
    expect((await publish(4)).status).toBe('failed');
    const keys = sent().map(({ key }) => key);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it('a lost connection on the save is a retryable toast and sends no publish', async () => {
    const fetchSpy = vi
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchSpy);
    const outcome = await submitEdit(
      new QueryClient(),
      createAttemptKeys(),
      request({ action: 'PUBLISH' }),
    );
    expect(outcome).toMatchObject({
      status: 'failed',
      effect: { type: 'toast', title: 'noConnection', retry: true },
      stage: 'patch',
    });
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('a failed call leaves the lists and the card cache alone', async () => {
    const { queryClient, invalidate } = setup([
      json(500, problemBody('INTERNAL')),
    ]);
    await submitEdit(queryClient, createAttemptKeys(), request());
    expect(invalidate).not.toHaveBeenCalled();
    expect(
      queryClient.getQueryData(queryKeys.vacancy(VACANCY)),
    ).toBeUndefined();
  });
});
