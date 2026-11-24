import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/api-client';
import {
  priorityVerticalsQuery,
  teamLeadPrioritiesQuery,
} from '../../lib/queries/team-lead-priority';
import { retryServerErrors } from '../../lib/queries/vacancy-detail';

describe('Priority reads survive one transient 401 [ADR-020]', () => {
  it.each([
    ['verticals', priorityVerticalsQuery()],
    ['priorities', teamLeadPrioritiesQuery('vertical-id')],
  ])('%s use the shared read retry policy', (_name, query) => {
    expect(query.retry).toBe(retryServerErrors);
  });

  it('retries a session 401 once and never a 403', () => {
    const unauthorized = new ApiError(401, 'UNAUTHORIZED');
    const forbidden = new ApiError(403, 'FORBIDDEN');

    expect(retryServerErrors(0, unauthorized)).toBe(true);
    expect(retryServerErrors(1, unauthorized)).toBe(false);
    expect(retryServerErrors(0, forbidden)).toBe(false);
  });
});
