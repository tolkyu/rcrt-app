import { describe, expect, it } from 'vitest';
import type { CloseFailure, CloseOutcome } from '@/lib/vacancy-draft-close';
import {
  CLEAR,
  planAttempt,
  settle,
  type Attempt,
  type RetryState,
} from '@/lib/vacancy-draft-retry';

const uncertain = (reason: string): RetryState => ({
  kind: 'uncertain',
  reason,
});
const blocked: RetryState = { kind: 'blocked' };
const failed = (failure: CloseFailure): CloseOutcome => ({
  status: 'failed',
  failure,
});
const done: CloseOutcome = { status: 'done', vacancy: null };
const busy: CloseOutcome = { status: 'busy' };

describe('planAttempt: what the next press may assume', () => {
  const cases: [string, RetryState, 'cancel' | 'delete', string, Attempt][] = [
    [
      'first press',
      CLEAR,
      'cancel',
      '  Дубль ',
      { kind: 'fresh', reason: 'Дубль' },
    ],
    [
      'same reason after an unsure press (spaces and line endings ignored)',
      uncertain('Дубль\nвакансії'),
      'cancel',
      'Дубль\r\n  вакансії ',
      { kind: 'retry', reason: 'Дубль\nвакансії' },
    ],
    [
      'changed reason after an unsure press',
      uncertain('Дубль'),
      'cancel',
      'Потреба зникла',
      { kind: 'blocked' },
    ],
    [
      'a delete has no reason to change',
      uncertain(''),
      'delete',
      '',
      { kind: 'retry', reason: '' },
    ],
    ['blocked stays blocked', blocked, 'cancel', 'Дубль', { kind: 'blocked' }],
    ['blocked delete', blocked, 'delete', '', { kind: 'blocked' }],
  ];
  it.each(cases)('%s', (_name, state, kind, reason, expected) => {
    expect(planAttempt(state, kind, reason)).toEqual(expected);
  });
});

describe('settle: what the answer teaches the dialog', () => {
  const fresh: Attempt = { kind: 'fresh', reason: 'Дубль' };
  const retry: Attempt = { kind: 'retry', reason: 'Дубль' };
  const none: Attempt = { kind: 'blocked' };
  const cases: [string, Attempt, CloseOutcome, RetryState][] = [
    ['fresh, done', fresh, done, CLEAR],
    ['retry, done', retry, done, CLEAR],
    ['blocked, done', none, done, blocked],
    ['fresh, busy', fresh, busy, CLEAR],
    ['retry, busy', retry, busy, uncertain('Дубль')],
    ['blocked, busy', none, busy, blocked],
    ['fresh, lost answer', fresh, failed('network'), uncertain('Дубль')],
    ['fresh, 500', fresh, failed('failed'), uncertain('Дубль')],
    ['fresh, 429', fresh, failed('rateLimited'), CLEAR],
    ['fresh, 403', fresh, failed('forbidden'), CLEAR],
    ['fresh, 400', fresh, failed('invalid'), CLEAR],
    ['fresh, gone', fresh, failed('gone'), CLEAR],
    ['fresh, conflict', fresh, failed('notDraft'), blocked],
    ['fresh, stale', fresh, failed('stale'), blocked],
    [
      'retry, 429 keeps the doubt',
      retry,
      failed('rateLimited'),
      uncertain('Дубль'),
    ],
    [
      'retry, 403 keeps the doubt',
      retry,
      failed('forbidden'),
      uncertain('Дубль'),
    ],
    ['retry, lost again', retry, failed('network'), uncertain('Дубль')],
    ['retry, conflict', retry, failed('notDraft'), blocked],
    ['retry, stale', retry, failed('stale'), blocked],
    ['blocked, lost answer', none, failed('network'), blocked],
    ['blocked, 429', none, failed('rateLimited'), blocked],
  ];
  it.each(cases)('%s', (_name, attempt, outcome, expected) => {
    expect(settle(attempt, outcome)).toEqual(expected);
  });
});

describe('a dialog session: plan and settle together', () => {
  const press = (
    state: RetryState,
    kind: 'cancel' | 'delete',
    reason: string,
    outcome: CloseOutcome,
  ) => {
    const attempt = planAttempt(state, kind, reason);
    return {
      retrying: attempt.kind === 'retry',
      state: settle(attempt, outcome),
    };
  };

  it('two different unsure writes leave no retry able to adopt a stored cancellation', () => {
    let step = press(CLEAR, 'cancel', 'Дубль', failed('network'));
    expect(step.retrying).toBe(false);
    step = press(step.state, 'cancel', 'Потреба зникла', failed('network'));
    expect(step.retrying).toBe(false);
    for (const reason of ['Потреба зникла', 'Дубль']) {
      step = press(step.state, 'cancel', reason, failed('network'));
      expect(step.retrying).toBe(false);
    }
  });

  it('an intervening 429 cannot erase the doubt about the original reason', () => {
    let step = press(CLEAR, 'cancel', 'Дубль', failed('network'));
    step = press(step.state, 'cancel', 'Дубль', failed('rateLimited'));
    expect(step.retrying).toBe(true);
    step = press(step.state, 'cancel', 'Потреба зникла', failed('network'));
    expect(step.retrying).toBe(false);
    step = press(step.state, 'cancel', 'Потреба зникла', failed('notDraft'));
    expect(step.retrying).toBe(false);
  });

  it('the same reason retried after a lost answer is a retry until it succeeds', () => {
    const lost = press(CLEAR, 'cancel', 'Дубль', failed('network'));
    const retried = press(lost.state, 'cancel', 'Дубль', done);
    expect(retried).toEqual({ retrying: true, state: CLEAR });
  });
});
