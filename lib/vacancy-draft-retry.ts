import { normalizeReason } from '@/lib/reason-text';
import {
  isUnsure,
  type CloseKind,
  type CloseOutcome,
} from '@/lib/vacancy-draft-close';

/** What an open close dialog knows about its earlier presses. */
export type RetryState =
  | { readonly kind: 'clear' }
  | { readonly kind: 'uncertain'; readonly reason: string }
  | { readonly kind: 'blocked' };

/** The press about to go out: `retry` repeats a request that may already be stored; `blocked` never adopts a stored result. */
export type Attempt =
  | { readonly kind: 'fresh'; readonly reason: string }
  | { readonly kind: 'retry'; readonly reason: string }
  | { readonly kind: 'blocked' };

export const CLEAR: RetryState = { kind: 'clear' };

/** A changed reason after an unsure press may be a second stored write, so status-only recovery is off for good until the dialog reopens. */
export function planAttempt(
  state: RetryState,
  kind: CloseKind,
  reason: string,
): Attempt {
  const normalized = normalizeReason(reason);
  switch (state.kind) {
    case 'blocked':
      return { kind: 'blocked' };
    case 'clear':
      return { kind: 'fresh', reason: normalized };
    case 'uncertain':
      return kind === 'delete' || state.reason === normalized
        ? { kind: 'retry', reason: normalized }
        : { kind: 'blocked' };
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}

export function settle(attempt: Attempt, outcome: CloseOutcome): RetryState {
  if (attempt.kind === 'blocked') return { kind: 'blocked' };
  const uncertain: RetryState = { kind: 'uncertain', reason: attempt.reason };
  switch (outcome.status) {
    case 'done':
      return CLEAR;
    case 'busy':
      return attempt.kind === 'retry' ? uncertain : CLEAR;
    case 'failed':
      if (outcome.failure === 'notDraft' || outcome.failure === 'stale')
        return { kind: 'blocked' };
      return attempt.kind === 'retry' || isUnsure(outcome.failure)
        ? uncertain
        : CLEAR;
    default: {
      const exhaustive: never = outcome;
      return exhaustive;
    }
  }
}
