import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-client';
import {
  emptyVacancyForm,
  verticalResetNote,
  type VacancyFormValues,
} from '@/lib/vacancy-form';
import {
  classifyCreateFailure,
  createAttemptKeys,
  parseVacancyForm,
  planFailure,
  vacancyDraftLandingHref,
} from '@/lib/vacancy-form-submit';
import { parseVacancyPageState } from '@/lib/vacancy-filters';

const VERTICAL = '8b1f5a0e-0c2d-4f6e-9d7a-2b3c4d5e6f70';
const POSITION = '3f1e2d3c-4b5a-4968-8776-655443322110';
const TEAM_LEAD = '5d2c7e90-1f3a-4b8c-9a6d-7e8f90a1b2c3';
const VACANCY = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

const values = (patch: Partial<VacancyFormValues> = {}): VacancyFormValues => ({
  ...emptyVacancyForm(VERTICAL),
  title: 'Медіабаєр — Facebook',
  ...patch,
});
const errorsOf = (input: VacancyFormValues, mode: 'DRAFT' | 'PUBLISH') => {
  const result = parseVacancyForm(input, mode);
  return result.ok ? {} : result.errors;
};

describe('create form → shared create schema [STORY-VAC-01-1, D89]', () => {
  it('saves a draft with only vertical and title', () => {
    expect(parseVacancyForm(values(), 'DRAFT').ok).toBe(true);
  });

  it('needs the position to publish but not to save a draft', () => {
    expect(errorsOf(values(), 'PUBLISH')).toEqual({
      positionId: 'positionRequired',
    });
    expect(errorsOf(values({ positionId: POSITION }), 'PUBLISH')).toEqual({});
  });

  it('sends no probation, bonus or salary keys, and no team lead while none is chosen', () => {
    const result = parseVacancyForm(
      values({ positionId: POSITION, priority: 'URGENT', headcount: ' 3 ' }),
      'PUBLISH',
    );
    expect(result.ok && result.body).toEqual({
      mode: 'PUBLISH',
      verticalId: VERTICAL,
      positionId: POSITION,
      title: 'Медіабаєр — Facebook',
      headcount: 3,
      priority: 'URGENT',
    });
  });

  it.each(['DRAFT', 'PUBLISH'] as const)(
    'sends the chosen Team Lead on %s',
    (mode) => {
      const result = parseVacancyForm(
        values({ positionId: POSITION, teamLeadId: TEAM_LEAD }),
        mode,
      );
      expect(result.ok && result.body).toMatchObject({ teamLeadId: TEAM_LEAD });
    },
  );

  it('flags a Team Lead that is not an id instead of dropping it silently', () => {
    expect(errorsOf(values({ teamLeadId: 'ліда' }), 'DRAFT')).toEqual({
      teamLeadId: 'teamLeadInvalid',
    });
  });

  it('sends the title in its stored form (collapsed whitespace)', () => {
    const result = parseVacancyForm(
      values({ title: '  Медіабаєр    Facebook ' }),
      'DRAFT',
    );
    expect(result.ok && result.body.title).toBe('Медіабаєр Facebook');
  });

  it('asks for a vertical on both actions', () => {
    for (const mode of ['DRAFT', 'PUBLISH'] as const)
      expect(errorsOf(values({ verticalId: '' }), mode)).toMatchObject({
        verticalId: 'verticalRequired',
      });
  });

  it.each([
    ['', 'titleRequired'],
    ['   ', 'titleRequired'],
    ['А', 'titleShort'],
    ['А'.repeat(201), 'titleLong'],
    ['Назва​з нульовою шириною', 'titleChars'],
    ['Назва\u0007', 'titleChars'],
  ])('maps title %j to %s', (title, code) => {
    expect(errorsOf(values({ title }), 'DRAFT')).toEqual({ title: code });
  });

  it('counts the 200-character limit in the characters the server stores', () => {
    expect(errorsOf(values({ title: 'А'.repeat(200) }), 'DRAFT')).toEqual({});
  });

  it.each(['0', '101', '1e3', 'abc', '-1', '2.5', '1 000', '123456'])(
    'rejects headcount %j on both actions',
    (headcount) => {
      for (const mode of ['DRAFT', 'PUBLISH'] as const)
        expect(
          errorsOf(values({ positionId: POSITION, headcount }), mode),
        ).toEqual({ headcount: 'headcountRange' });
    },
  );

  it('accepts 1 and 100 and lets a draft leave the headcount empty', () => {
    for (const headcount of ['1', '100'])
      expect(
        errorsOf(values({ positionId: POSITION, headcount }), 'PUBLISH'),
      ).toEqual({});
    expect(errorsOf(values({ headcount: '' }), 'DRAFT')).toEqual({});
    expect(
      errorsOf(values({ positionId: POSITION, headcount: '' }), 'PUBLISH'),
    ).toEqual({ headcount: 'headcountRange' });
  });

  it('reports every invalid field at once', () => {
    expect(
      errorsOf(
        values({ verticalId: '', title: '', headcount: '0' }),
        'PUBLISH',
      ),
    ).toEqual({
      verticalId: 'verticalRequired',
      positionId: 'positionRequired',
      title: 'titleRequired',
      headcount: 'headcountRange',
    });
  });
});

describe('server answer → form [STORY-VAC-01-1, ux §4.1–4.2]', () => {
  const problem = (
    status: number,
    code: string,
    fieldErrors: { path: string; code: string }[] = [],
  ) => new ApiError(status, code, fieldErrors);

  it.each([
    [429, 'RATE_LIMITED', 'rateLimited'],
    [403, 'FORBIDDEN', 'forbidden'],
    [404, 'NOT_FOUND', 'verticalUnavailable'],
    [409, 'DRAFT_LIMIT_REACHED', 'draftLimit'],
    [409, 'IDEMPOTENCY_KEY_REUSED', 'keyReused'],
    [500, 'INTERNAL', 'failed'],
    [503, 'AUTH_EMAIL_DELIVERY_FAILED', 'failed'],
  ])('%i %s is %s', (status, code, kind) => {
    expect(classifyCreateFailure(problem(status, code))).toEqual({ kind });
  });

  it('treats a request that never got an answer as a lost connection', () => {
    expect(classifyCreateFailure(new TypeError('Failed to fetch'))).toEqual({
      kind: 'network',
    });
  });

  it('flags the position when it is inactive or not owned by the vertical', () => {
    expect(
      classifyCreateFailure(
        problem(409, 'POSITION_INACTIVE', [
          { path: 'body.positionId', code: 'position_inactive' },
        ]),
      ),
    ).toEqual({ kind: 'fields', errors: { positionId: 'positionInactive' } });
    expect(
      classifyCreateFailure(
        problem(400, 'VALIDATION_FAILED', [
          { path: 'body.positionId', code: 'invalid_position' },
        ]),
      ),
    ).toEqual({ kind: 'fields', errors: { positionId: 'positionInvalid' } });
  });

  it('maps the Zod issue codes the server returns to the codes the client uses', () => {
    expect(
      classifyCreateFailure(
        problem(400, 'VALIDATION_FAILED', [
          { path: 'body.positionId', code: 'invalid_type' },
          { path: 'body.title', code: 'too_big' },
          { path: 'body.headcount', code: 'too_small' },
          { path: 'body.verticalId', code: 'invalid_format' },
        ]),
      ),
    ).toEqual({
      kind: 'fields',
      errors: {
        positionId: 'positionRequired',
        title: 'titleLong',
        headcount: 'headcountRange',
        verticalId: 'verticalRequired',
      },
    });
  });

  it('flags the Team Lead the server no longer accepts', () => {
    const refused = problem(400, 'VALIDATION_FAILED', [
      { path: 'body.teamLeadId', code: 'invalid_team_lead' },
    ]);
    expect(classifyCreateFailure(refused)).toEqual({
      kind: 'fields',
      errors: { teamLeadId: 'teamLeadInvalid' },
    });
    expect(planFailure(refused, false)).toEqual({
      type: 'fields',
      errors: { teamLeadId: 'teamLeadInvalid' },
    });
  });

  it('falls back to the generic failure for a field this form does not own', () => {
    expect(
      classifyCreateFailure(
        problem(400, 'VALIDATION_FAILED', [
          { path: 'body.descriptionDoc', code: 'too_big' },
        ]),
      ),
    ).toEqual({ kind: 'failed' });
  });
});

describe('what the form does with a failed create [STORY-VAC-01-1, ux §4.2]', () => {
  const retryToast = {
    type: 'toast',
    tone: 'error',
    title: 'failed',
    description: 'failedDescription',
    retry: true,
  };

  it('shows the draft limit and a lost vertical as inline alerts, not toasts', () => {
    expect(
      planFailure(new ApiError(409, 'DRAFT_LIMIT_REACHED', []), false),
    ).toEqual({ type: 'alert', alert: 'draftLimit' });
    expect(planFailure(new ApiError(404, 'NOT_FOUND', []), false)).toEqual({
      type: 'alert',
      alert: 'verticalUnavailable',
    });
  });

  it('warns on 429 and refuses on 403 without offering a retry', () => {
    expect(planFailure(new ApiError(429, 'RATE_LIMITED', []), false)).toEqual({
      type: 'toast',
      tone: 'warning',
      title: 'rateLimited',
      retry: false,
    });
    expect(planFailure(new ApiError(403, 'FORBIDDEN', []), false)).toEqual({
      type: 'toast',
      tone: 'error',
      title: 'forbidden',
      retry: false,
    });
  });

  it('offers a retry after a lost connection and after a server error', () => {
    expect(planFailure(new TypeError('Failed to fetch'), false)).toEqual({
      type: 'toast',
      tone: 'error',
      title: 'noConnection',
      description: 'noConnectionDescription',
      retry: true,
    });
    expect(planFailure(new ApiError(500, 'INTERNAL', []), false)).toEqual(
      retryToast,
    );
  });

  it('retries a reused key once, then reports the generic failure', () => {
    const reused = new ApiError(409, 'IDEMPOTENCY_KEY_REUSED', []);
    expect(planFailure(reused, false)).toEqual({ type: 'retry' });
    expect(planFailure(reused, true)).toEqual(retryToast);
  });

  it('hands field errors to the form untouched', () => {
    expect(
      planFailure(
        new ApiError(400, 'VALIDATION_FAILED', [
          { path: 'body.title', code: 'too_big' },
        ]),
        false,
      ),
    ).toEqual({ type: 'fields', errors: { title: 'titleLong' } });
  });
});

describe('what a vertical change tells the user [ux §2.1]', () => {
  it.each([
    [false, false, null],
    [true, false, 'position'],
    [false, true, 'teamLead'],
    [true, true, 'both'],
  ] as const)(
    'cleared position %s, cleared Team Lead %s → %s',
    (position, teamLead, note) => {
      expect(verticalResetNote(position, teamLead)).toBe(note);
    },
  );
});

describe('idempotency key per attempt [STORY-VAC-01-1]', () => {
  const sequence = () => {
    let next = 0;
    return () => `key-${(next += 1).toString().padStart(16, '0')}`;
  };

  it('reuses the key for a retry of the same body and issues a new one when a value changes', () => {
    const keys = createAttemptKeys(sequence());
    const first = keys.keyFor({ title: 'A', mode: 'DRAFT' });
    expect(keys.keyFor({ title: 'A', mode: 'DRAFT' })).toBe(first);
    expect(keys.keyFor({ title: 'B', mode: 'DRAFT' })).not.toBe(first);
  });

  it('gives draft and publish different keys, and reset forgets the key', () => {
    const keys = createAttemptKeys(sequence());
    const draft = keys.keyFor({ mode: 'DRAFT' });
    expect(keys.keyFor({ mode: 'PUBLISH' })).not.toBe(draft);
    const again = keys.keyFor({ mode: 'PUBLISH' });
    keys.reset();
    expect(keys.keyFor({ mode: 'PUBLISH' })).not.toBe(again);
  });

  it('generates keys the API accepts', () => {
    expect(createAttemptKeys().keyFor({ mode: 'DRAFT' })).toMatch(
      /^[A-Za-z0-9_-]{16,64}$/,
    );
  });
});

describe('draft landing [STORY-VAC-01-3, D83]', () => {
  it('opens «Чернетки» of the draft vertical with the new draft selected', () => {
    const href = vacancyDraftLandingHref(VERTICAL, VACANCY);
    expect(href.startsWith('/vacancies?')).toBe(true);
    const state = parseVacancyPageState(
      new URLSearchParams(href.slice('/vacancies?'.length)),
    );
    expect(state.filters).toMatchObject({
      status: 'DRAFT',
      vertical: VERTICAL,
    });
    expect(state.selected).toBe(VACANCY);
  });
});
