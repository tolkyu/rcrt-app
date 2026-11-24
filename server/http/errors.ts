export interface FieldError {
  readonly path: string;
  readonly code: string;
}

/** Typed domain errors; `code` is a stable enum the UI maps to `messages/uk.json` (docs/architecture.md §5). */
export abstract class DomainError extends Error {
  abstract readonly status: number;
  constructor(readonly code: string) {
    super(code);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  readonly status = 400;
  constructor(
    readonly errors: readonly FieldError[],
    code = 'VALIDATION_FAILED',
  ) {
    super(code);
  }
}

export type UnauthenticatedCode =
  'UNAUTHENTICATED' | 'SESSION_EXPIRED' | 'USER_DEACTIVATED' | 'MFA_REQUIRED';
export class UnauthenticatedError extends DomainError {
  readonly status = 401;
  constructor(code: UnauthenticatedCode = 'UNAUTHENTICATED') {
    super(code);
  }
}

export class ForbiddenError extends DomainError {
  readonly status = 403;
  constructor(
    code:
      'FORBIDDEN' | 'SELF_BENEFIT_FORBIDDEN' | 'CSRF_FORBIDDEN' = 'FORBIDDEN',
  ) {
    super(code);
  }
}

/** Missing, soft-deleted and out-of-scope objects share one response so existence never leaks (VIS-02). */
export class NotFoundError extends DomainError {
  readonly status = 404;
  constructor() {
    super('NOT_FOUND');
  }
}

/**
 * `errors` names the input field behind the conflict when the same code can also describe the target itself;
 * `details` carries ids the Admin-only caller may act on next (e.g. the deactivated holder of an address, D42).
 */
export class ConflictError extends DomainError {
  readonly status = 409;
  constructor(
    code: string,
    readonly errors: readonly FieldError[] = [],
    readonly details: Readonly<Record<string, string>> = {},
  ) {
    super(code);
  }
}

export class InvalidTransitionError extends DomainError {
  readonly status = 409;
}

export class RateLimitedError extends DomainError {
  readonly status = 429;
  constructor(readonly retryAfterSeconds: number) {
    super('RATE_LIMITED');
  }
}

export class PayloadTooLargeError extends DomainError {
  readonly status = 413;
  constructor() {
    super('BODY_TOO_LARGE');
  }
}

export class AuthEmailDeliveryFailedError extends DomainError {
  readonly status = 503;
  constructor() {
    super('AUTH_EMAIL_DELIVERY_FAILED');
  }
}

export class MfaResetIncompleteError extends DomainError {
  readonly status = 503;
  constructor() {
    super('MFA_RESET_INCOMPLETE');
  }
}

export class UserActivationIncompleteError extends DomainError {
  readonly status = 503;
  constructor(code: 'DEACTIVATION_INCOMPLETE' | 'REACTIVATION_INCOMPLETE') {
    super(code);
  }
}
