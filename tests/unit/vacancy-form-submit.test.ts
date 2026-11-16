import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { activePositionsQuery } from '@/lib/queries/positions';
import { assignableTeamLeadsQuery } from '@/lib/queries/team-leads';
import { queryKeys } from '@/lib/query-keys';
import type { PositionList } from '@/lib/schemas/position';
import type { CreateVacancyBody } from '@/lib/schemas/vacancy';
import { emptyVacancyForm } from '@/lib/vacancy-form';
import {
  createAttemptKeys,
  applyPosition,
  fetchActivePositions,
  fetchAssignableTeamLeads,
  planFailure,
  refreshAssignableTeamLeads,
  resolveVacancyForm,
  submitCreate,
  type FailureEffect,
} from '@/lib/vacancy-form-submit';

const VERTICAL = '8b1f5a0e-0c2d-4f6e-9d7a-2b3c4d5e6f70';
const OTHER_VERTICAL = '9c2a6b1f-1d3e-4a7f-8e8b-3c4d5e6f7081';
const POSITION = '3f1e2d3c-4b5a-4968-8776-655443322110';
const VACANCY = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

afterEach(() => vi.unstubAllGlobals());

const problem = (status: number, code: string) =>
  new ApiError(status, code, []);
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const positionList = (verticalId: string, name: string): PositionList => ({
  items: [
    {
      id: POSITION,
      verticalId,
      name,
      isActive: true,
      version: 1,
      createdAt: '2026-11-01T08:00:00.000Z',
      openVacanciesCount: null,
    },
  ],
});

const detail = {
  id: VACANCY,
  number: 'V-0015',
  title: 'Медіабаєр',
  vertical: { id: VERTICAL, name: 'Гемблінг' },
  position: null,
  teamLead: null,
  recruiters: [],
  status: 'DRAFT',
  priority: 'NORMAL',
  source: 'APP',
  openedAt: null,
  createdAt: '2026-11-16T08:00:00.000Z',
  updatedAt: '2026-11-16T08:00:00.000Z',
  headcount: 1,
  seniority: null,
  workFormat: null,
  employmentType: null,
  location: null,
  salaryMinMinor: null,
  salaryMaxMinor: null,
  salaryCurrency: null,
  probationDays: 90,
  recruiterInitiated: true,
  version: 1,
};

const body = {
  mode: 'DRAFT',
  verticalId: VERTICAL,
  title: 'Медіабаєр',
} as CreateVacancyBody;

describe('planFailure: what the form does with every failed create [ux §4.2]', () => {
  const generic: FailureEffect = {
    type: 'toast',
    tone: 'error',
    title: 'failed',
    description: 'failedDescription',
    retry: true,
  };
  const cases: [string, unknown, boolean, FailureEffect][] = [
    [
      'draft limit',
      problem(409, 'DRAFT_LIMIT_REACHED'),
      false,
      { type: 'alert', alert: 'draftLimit' },
    ],
    [
      'vertical gone',
      problem(404, 'NOT_FOUND'),
      false,
      { type: 'alert', alert: 'verticalUnavailable' },
    ],
    [
      'rate limit',
      problem(429, 'RATE_LIMITED'),
      false,
      { type: 'toast', tone: 'warning', title: 'rateLimited', retry: false },
    ],
    [
      'forbidden',
      problem(403, 'FORBIDDEN'),
      false,
      { type: 'toast', tone: 'error', title: 'forbidden', retry: false },
    ],
    [
      'no connection',
      new TypeError('Failed to fetch'),
      false,
      {
        type: 'toast',
        tone: 'error',
        title: 'noConnection',
        description: 'noConnectionDescription',
        retry: true,
      },
    ],
    ['server error', problem(500, 'INTERNAL'), false, generic],
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
    [
      'inactive position',
      problem(409, 'POSITION_INACTIVE'),
      false,
      { type: 'fields', errors: { positionId: 'positionInactive' } },
    ],
    [
      'unknown 400 field',
      new ApiError(400, 'VALIDATION_FAILED', [
        { path: 'body.probationDays', code: 'too_big' },
      ]),
      false,
      generic,
    ],
    [
      'refused Team Lead',
      new ApiError(400, 'VALIDATION_FAILED', [
        { path: 'body.teamLeadId', code: 'invalid_team_lead' },
      ]),
      false,
      { type: 'fields', errors: { teamLeadId: 'teamLeadInvalid' } },
    ],
  ];

  it.each(cases)('%s', (_name, error, retried, expected) => {
    expect(planFailure(error, retried)).toEqual(expected);
  });
});

describe('resolveVacancyForm: the shape react-hook-form expects', () => {
  it('returns the values when the action is valid', () => {
    const values = { ...emptyVacancyForm(VERTICAL), title: 'Назва' };
    expect(resolveVacancyForm(values, 'DRAFT')).toEqual({
      values,
      errors: {},
    });
  });

  it('carries the field code in the error message, per field, and no values', () => {
    const result = resolveVacancyForm(emptyVacancyForm(VERTICAL), 'PUBLISH');
    expect(result.values).toEqual({});
    expect(result.errors).toEqual({
      positionId: { type: 'validate', message: 'positionRequired' },
      title: { type: 'validate', message: 'titleRequired' },
    });
  });

  it('flags only what the pressed action needs', () => {
    expect(
      resolveVacancyForm(emptyVacancyForm(VERTICAL), 'DRAFT').errors,
    ).toEqual({ title: { type: 'validate', message: 'titleRequired' } });
  });
});

describe('fetchActivePositions: the server-loaded list seeds the cache [PERF-04]', () => {
  const seed = (verticalId: string) => ({
    list: positionList(verticalId, 'З сервера'),
    loadedAt: Date.now(),
  });

  it('serves the preset vertical from the seed without a request', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const client = new QueryClient();
    const list = await fetchActivePositions(
      client,
      VERTICAL,
      VERTICAL,
      seed(VERTICAL),
    );
    expect(list.items[0]?.name).toBe('З сервера');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps a warm cache: the seed never overwrites a list already held', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const client = new QueryClient();
    client.setQueryData(
      activePositionsQuery(VERTICAL).queryKey,
      positionList(VERTICAL, 'З кешу'),
    );
    const list = await fetchActivePositions(
      client,
      VERTICAL,
      VERTICAL,
      seed(VERTICAL),
    );
    expect(list.items[0]?.name).toBe('З кешу');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('ignores the seed for another vertical and asks the server', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(json(200, positionList(OTHER_VERTICAL, 'З мережі')));
    vi.stubGlobal('fetch', fetchSpy);
    const client = new QueryClient();
    const list = await fetchActivePositions(
      client,
      OTHER_VERTICAL,
      VERTICAL,
      seed(VERTICAL),
    );
    expect(list.items[0]?.name).toBe('З мережі');
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(
      client.getQueryData(activePositionsQuery(VERTICAL).queryKey),
    ).toBeUndefined();
  });

  it('counts staleness from the page load: an old seed is refetched', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(json(200, positionList(VERTICAL, 'Свіжий')));
    vi.stubGlobal('fetch', fetchSpy);
    const list = await fetchActivePositions(
      new QueryClient(),
      VERTICAL,
      VERTICAL,
      {
        list: positionList(VERTICAL, 'Старий'),
        loadedAt: Date.now() - 120_000,
      },
    );
    expect(list.items[0]?.name).toBe('Свіжий');
  });
});

describe('fetchAssignableTeamLeads: the Team Lead picker list [STORY-VAC-01-1]', () => {
  const LEAD = '5d2c7e90-1f3a-4b8c-9a6d-7e8f90a1b2c3';
  const leads = {
    items: [{ id: LEAD, fullName: 'Василь Мороз', priority: 0 }],
  };

  it('asks the vertical’s endpoint once and serves a fresh list from the cache', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(json(200, leads));
    vi.stubGlobal('fetch', fetchSpy);
    const client = new QueryClient();
    expect(await fetchAssignableTeamLeads(client, VERTICAL)).toEqual(leads);
    expect(await fetchAssignableTeamLeads(client, VERTICAL)).toEqual(leads);
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      `/api/v1/verticals/${VERTICAL}/team-leads`,
    );
  });

  it('keeps one list per vertical, whatever the case of the id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, leads)));
    const client = new QueryClient();
    await fetchAssignableTeamLeads(client, VERTICAL);
    expect(
      client.getQueryData(
        assignableTeamLeadsQuery(VERTICAL.toUpperCase()).queryKey,
      ),
    ).toEqual(leads);
    expect(
      client.getQueryData(assignableTeamLeadsQuery(OTHER_VERTICAL).queryKey),
    ).toBeUndefined();
  });

  it.each([
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
  ])(
    'a %i answer is not retried and reaches the picker as an error',
    async (status, code) => {
      const fetchSpy = vi.fn().mockResolvedValue(json(status, { code }));
      vi.stubGlobal('fetch', fetchSpy);
      await expect(
        fetchAssignableTeamLeads(new QueryClient(), VERTICAL),
      ).rejects.toMatchObject({ status, code });
      expect(fetchSpy).toHaveBeenCalledOnce();
    },
  );

  it('rejects an answer that does not match the contract, e-mail included', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json(200, {
          items: [{ id: LEAD, fullName: 'Василь', email: 'a@b.c' }],
        }),
      ),
    );
    await expect(
      fetchAssignableTeamLeads(new QueryClient(), VERTICAL),
    ).rejects.toThrow();
  });

  it('a refused Team Lead makes every cached list stale', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, leads)));
    const client = new QueryClient();
    await fetchAssignableTeamLeads(client, VERTICAL);
    await refreshAssignableTeamLeads(client);
    expect(
      client.getQueryState(assignableTeamLeadsQuery(VERTICAL).queryKey)
        ?.isInvalidated,
    ).toBe(true);
  });
});

describe('submitCreate: one attempt, one key [STORY-VAC-01-1]', () => {
  it('updates the caches before it returns, so a form that unmounted meanwhile still refreshes the lists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(201, detail)));
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const outcome = await submitCreate(client, createAttemptKeys(), body);
    expect(outcome.status).toBe('created');
    expect(client.getQueryData(queryKeys.vacancy(VACANCY))).toMatchObject({
      number: 'V-0015',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['vacancies'] });
  });

  it('sends the same key for the same body and retries a reused key once under a fresh one', async () => {
    const keys: string[] = [];
    const fetchSpy = vi.fn(async (_url: string, init: RequestInit) => {
      keys.push(
        (init.headers as Record<string, string>)['Idempotency-Key'] ?? '',
      );
      return keys.length === 1
        ? json(409, { code: 'IDEMPOTENCY_KEY_REUSED' })
        : json(201, detail);
    });
    vi.stubGlobal('fetch', fetchSpy);
    let next = 0;
    const outcome = await submitCreate(
      new QueryClient(),
      createAttemptKeys(() => `key-${(next += 1)}-0000000000000`),
      body,
    );
    expect(outcome.status).toBe('created');
    expect(keys).toEqual(['key-1-0000000000000', 'key-2-0000000000000']);
  });

  it('gives up after that one retry and reports the generic failure', async () => {
    const fetchSpy = vi
      .fn()
      .mockImplementation(async () =>
        json(409, { code: 'IDEMPOTENCY_KEY_REUSED' }),
      );
    vi.stubGlobal('fetch', fetchSpy);
    const client = new QueryClient();
    const outcome = await submitCreate(client, createAttemptKeys(), body);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(outcome).toMatchObject({
      status: 'failed',
      effect: { type: 'toast', title: 'failed' },
    });
    expect(client.getQueryData(queryKeys.vacancy(VACANCY))).toBeUndefined();
  });

  it('keeps the key of a failed attempt for the retry of the same body', async () => {
    const keys: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        keys.push(
          (init.headers as Record<string, string>)['Idempotency-Key'] ?? '',
        );
        throw new TypeError('Failed to fetch');
      }),
    );
    const attempts = createAttemptKeys();
    const first = await submitCreate(new QueryClient(), attempts, body);
    await submitCreate(new QueryClient(), attempts, body);
    expect(first).toMatchObject({
      status: 'failed',
      effect: { title: 'noConnection' },
    });
    expect(keys[0]).toBe(keys[1]);
  });
});

describe('applyPosition: the title follows the position only while untouched', () => {
  const field = (title: string) => {
    const state = { positionId: '', title };
    return {
      state,
      form: {
        getValues: ((name: 'title') => state[name]) as never,
        setValue: ((name: 'positionId' | 'title', value: string) => {
          state[name] = value;
        }) as never,
      },
    };
  };

  it('fills an empty title with the position name', () => {
    const { form, state } = field('');
    expect(applyPosition(form, {}, '', POSITION, 'Медіабаєр')).toBe(
      'Медіабаєр',
    );
    expect(state).toEqual({ positionId: POSITION, title: 'Медіабаєр' });
  });

  it('replaces a title that is still the earlier auto-filled one', () => {
    const { form, state } = field('Медіабаєр');
    expect(applyPosition(form, {}, 'Медіабаєр', POSITION, 'Крео')).toBe('Крео');
    expect(state.title).toBe('Крео');
  });

  it('never overwrites a title the user typed', () => {
    const { form, state } = field('Моя назва');
    expect(applyPosition(form, {}, 'Медіабаєр', POSITION, 'Крео')).toBe(
      'Медіабаєр',
    );
    expect(state.title).toBe('Моя назва');
  });

  it('clears an untouched auto-filled title when the position is cleared, and keeps a typed one', () => {
    const untouched = field('Медіабаєр');
    expect(applyPosition(untouched.form, {}, 'Медіабаєр', '', undefined)).toBe(
      '',
    );
    expect(untouched.state).toEqual({ positionId: '', title: '' });
    const typed = field('Моя назва');
    expect(applyPosition(typed.form, {}, 'Медіабаєр', '', undefined)).toBe(
      'Медіабаєр',
    );
    expect(typed.state.title).toBe('Моя назва');
  });
});
