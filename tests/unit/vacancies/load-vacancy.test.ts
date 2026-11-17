import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadVacancy } from '@/app/(app)/vacancies/_lib/vacancy';
import { getVacancyDetail } from '@/server/services/vacancy';

vi.mock('server-only', () => ({}));
vi.mock('@/app/(app)/_lib/session', () => ({
  requireSession: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/server/services/vacancy', () => ({ getVacancyDetail: vi.fn() }));
// `React.cache` memoises per request only inside a server render; this stands in for one request.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  cache: <A extends string, R>(read: (id: A) => R) => {
    const seen = new Map<A, R>();
    return (id: A) => {
      if (!seen.has(id)) seen.set(id, read(id));
      return seen.get(id)!;
    };
  },
}));

const ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

beforeEach(() => {
  vi.mocked(getVacancyDetail).mockResolvedValue({ id: ID } as never);
});

describe('loadVacancy: one scoped read per request whatever the case of the id [S3.3 review]', () => {
  it('the detail layout, the edit layout, the page and the loading boundary share one read', async () => {
    const results = await Promise.all([
      loadVacancy(ID.toUpperCase()),
      loadVacancy(ID),
      loadVacancy(ID.toUpperCase()),
      loadVacancy(ID),
    ]);
    expect(vi.mocked(getVacancyDetail)).toHaveBeenCalledOnce();
    expect(vi.mocked(getVacancyDetail).mock.calls[0]![1]).toBe(ID);
    expect(new Set(results).size).toBe(1);
  });
});
