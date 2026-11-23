import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { vacancyContentQuery } from '@/lib/queries/vacancy-content';
import { vacancyDetailQuery } from '@/lib/queries/vacancy-detail';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import { isVacancyDetailKey } from '@/lib/vacancy-draft-optimistic';
import { publishFromList } from '@/lib/vacancy-draft-publish';
import { createAttemptKeys, submitEdit } from '@/lib/vacancy-edit-submit';
import { toggleStatus } from '@/lib/vacancy-status-change';
import { changeUrgency } from '@/lib/vacancy-urgency-change';
import { SHARE_ID, shareVacancy } from '../../support/vacancy-share-harness';

const card = (): VacancyDetail =>
  shareVacancy({
    status: 'OPEN',
    priority: 'NORMAL',
    statusActions: ['HOLD', 'CANCEL'],
    version: 3,
  });
const draftCard = (): VacancyDetail =>
  shareVacancy({
    status: 'DRAFT',
    openedAt: null,
    position: { id: '3f1e2d3c-4b5a-4968-8776-655443322110', name: 'Медіабаєр' },
    version: 3,
  });
const content = {
  id: SHARE_ID,
  version: 3,
  updatedAt: '2026-11-19T08:00:00Z',
  descriptionDoc: null,
  requirementsDoc: null,
  status: 'OPEN',
  canEditContent: true,
};
const writes = {
  status: (client: QueryClient) =>
    toggleStatus(client, {
      id: SHARE_ID,
      number: 'V-0005',
      action: 'HOLD',
      version: 3,
      unassigned: false,
    }),
  urgency: (client: QueryClient) =>
    changeUrgency(client, {
      id: SHARE_ID,
      number: 'V-0005',
      from: 'NORMAL',
      to: 'URGENT',
      version: 3,
    }),
  publish: (client: QueryClient) =>
    publishFromList(client, SHARE_ID, {
      removed: () => undefined,
      restored: () => undefined,
      settled: () => undefined,
    }),
};
const cases = [
  ['publish', '429', () => Response.json({ code: 'RATE' }, { status: 429 })],
  ['publish', 'network', () => Promise.reject(new TypeError('offline'))],
  ['status', '429', () => Response.json({ code: 'RATE' }, { status: 429 })],
  ['status', 'network', () => Promise.reject(new TypeError('offline'))],
  ['urgency', '429', () => Response.json({ code: 'RATE' }, { status: 429 })],
  ['urgency', 'network', () => Promise.reject(new TypeError('offline'))],
] as const;

const publishers = {
  list: (client: QueryClient) => writes.publish(client),
  form: (client: QueryClient) =>
    submitEdit(client, createAttemptKeys(), {
      id: SHARE_ID,
      version: 3,
      action: 'PUBLISH',
      changes: null,
      everything: {},
      hasSalaryAmount: false,
    }),
};
const contentBody = (status: 'DRAFT' | 'OPEN') => ({
  ...content,
  status,
  version: status === 'DRAFT' ? 3 : 4,
});

function publishHarness(mode: 'settled' | 'in-flight', post: () => Response) {
  const client = new QueryClient();
  const seeded = draftCard();
  client.setQueryData(queryKeys.vacancy(SHARE_ID), seeded);
  let finishFirst: (response: Response) => void = () => undefined;
  const first = new Promise<Response>((resolve) => {
    finishFirst = resolve;
  });
  let reads = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>((url, init) => {
      if (init?.method === 'POST') return Promise.resolve(post());
      if (!String(url).endsWith('/content'))
        return Promise.resolve(Response.json({ items: [] }));
      reads += 1;
      if (reads > 1) return Promise.resolve(Response.json(contentBody('OPEN')));
      return mode === 'in-flight'
        ? first
        : Promise.resolve(Response.json(contentBody('DRAFT')));
    }),
  );
  const observer = new QueryObserver(client, vacancyContentQuery(SHARE_ID));
  const stop = observer.subscribe(() => undefined);
  return {
    client,
    seeded,
    observer,
    stop,
    reads: () => reads,
    finishFirst: () => finishFirst(Response.json(contentBody('DRAFT'))),
  };
}

const landings = {
  status: {
    seed: card,
    during: { status: 'ON_HOLD' },
    done: (seeded: VacancyDetail): VacancyDetail => ({
      ...seeded,
      status: 'ON_HOLD',
      statusActions: ['RESUME', 'CANCEL'],
      version: 4,
    }),
    before: 'OPEN',
    after: 'ON_HOLD',
  },
  urgency: {
    seed: card,
    during: { priority: 'URGENT' },
    done: (seeded: VacancyDetail): VacancyDetail => ({
      ...seeded,
      priority: 'URGENT',
      version: 4,
    }),
    before: 'OPEN',
    after: 'OPEN',
  },
  publish: {
    seed: draftCard,
    during: { status: 'OPEN' },
    done: (seeded: VacancyDetail): VacancyDetail => ({
      ...seeded,
      status: 'OPEN',
      openedAt: '2026-11-20T08:00:00.000Z',
      version: 4,
    }),
    before: 'DRAFT',
    after: 'OPEN',
  },
} as const;

afterEach(() => vi.unstubAllGlobals());

describe('a content read landing during a write stays out of the detail key [VAC-08, ADR-020]', () => {
  it.each([
    ['the detail key', queryKeys.vacancy(SHARE_ID), true],
    ['the content key', queryKeys.vacancyContent(SHARE_ID), false],
    ['the picker key', queryKeys.vacancyAssignableRecruiters(SHARE_ID), false],
    ['another vacancy', queryKeys.vacancy(crypto.randomUUID()), false],
  ] as const)('isVacancyDetailKey: %s', (_name, key, expected) => {
    expect(isVacancyDetailKey(key, SHARE_ID)).toBe(expected);
  });

  it.each([
    ['status', 'success'],
    ['status', 'failure'],
    ['urgency', 'success'],
    ['urgency', 'failure'],
    ['publish', 'success'],
    ['publish', 'failure'],
  ] as const)('%s write ending in %s', async (kind, ending) => {
    const landing = landings[kind];
    const client = new QueryClient();
    const seeded = landing.seed();
    client.setQueryData(queryKeys.vacancy(SHARE_ID), seeded);
    let finishContent: (response: Response) => void = () => undefined;
    const firstContent = new Promise<Response>((resolve) => {
      finishContent = resolve;
    });
    let finishWrite: (response: Response) => void = () => undefined;
    const writeAnswer = new Promise<Response>((resolve) => {
      finishWrite = resolve;
    });
    let reads = 0;
    let writing = false;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>((url, init) => {
        if (init?.method === 'PUT' || init?.method === 'POST') {
          writing = true;
          return writeAnswer;
        }
        if (!String(url).endsWith('/content'))
          return new Promise<Response>(() => undefined);
        reads += 1;
        return reads === 1
          ? firstContent
          : Promise.resolve(
              Response.json({ ...content, status: landing.after, version: 4 }),
            );
      }),
    );
    const observer = new QueryObserver(client, vacancyContentQuery(SHARE_ID));
    const stop = observer.subscribe(() => undefined);
    await vi.waitFor(() => expect(reads).toBe(1));

    const running = writes[kind](client);
    await vi.waitFor(() => expect(writing).toBe(true));
    finishContent(Response.json({ ...content, status: landing.before }));
    await vi.waitFor(() =>
      expect(observer.getCurrentResult().data?.status).toBe(landing.before),
    );

    const during = client.getQueryData(queryKeys.vacancy(SHARE_ID));
    expect(during).toMatchObject({ title: seeded.title, ...landing.during });
    expect(during).not.toHaveProperty('descriptionDoc');

    finishWrite(
      ending === 'success'
        ? Response.json(landing.done(seeded))
        : Response.json({ code: 'RATE' }, { status: 429 }),
    );
    await running;

    expect(client.getQueryData(queryKeys.vacancy(SHARE_ID))).toEqual(
      ending === 'success' ? landing.done(seeded) : seeded,
    );
    const contentStatus = ending === 'success' ? landing.after : landing.before;
    await vi.waitFor(() => {
      const result = observer.getCurrentResult();
      expect(result.data?.status).toBe(contentStatus);
      expect(result.fetchStatus).toBe('idle');
    });
    const stored = client.getQueryData(queryKeys.vacancyContent(SHARE_ID));
    expect(stored).toHaveProperty('descriptionDoc');
    expect(stored).not.toHaveProperty('title');
    stop();
    client.clear();
  });
});

describe('a successful publish refreshes the content read [VAC-08, ADR-020]', () => {
  it.each([
    ['list', 'settled'],
    ['list', 'in-flight'],
    ['form', 'settled'],
    ['form', 'in-flight'],
  ] as const)(
    '%s publish over a %s DRAFT read ends with the published content',
    async (entry, mode) => {
      const run = publishHarness(mode, () =>
        Response.json({
          ...draftCard(),
          status: 'OPEN',
          openedAt: '2026-11-20T08:00:00.000Z',
          version: 4,
        }),
      );
      await vi.waitFor(() => expect(run.reads()).toBe(1));
      if (mode === 'settled')
        await vi.waitFor(() =>
          expect(run.observer.getCurrentResult().data?.status).toBe('DRAFT'),
        );
      await expect(publishers[entry](run.client)).resolves.toMatchObject({
        status: 'published',
      });
      run.finishFirst();
      await vi.waitFor(() =>
        expect(run.observer.getCurrentResult().data?.status).toBe('OPEN'),
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(run.observer.getCurrentResult().data?.status).toBe('OPEN');
      expect(run.reads()).toBe(2);
      run.stop();
      run.client.clear();
    },
  );

  it.each(['list', 'form'] as const)(
    'a failed %s publish does not refresh the content read',
    async (entry) => {
      const run = publishHarness('settled', () =>
        Response.json({ code: 'RATE' }, { status: 429 }),
      );
      await vi.waitFor(() =>
        expect(run.observer.getCurrentResult().data?.status).toBe('DRAFT'),
      );
      const invalidate = vi.spyOn(run.client, 'invalidateQueries');
      await expect(publishers[entry](run.client)).resolves.toMatchObject({
        status: 'failed',
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(invalidate).not.toHaveBeenCalled();
      expect(run.reads()).toBe(1);
      expect(run.observer.getCurrentResult().data?.status).toBe('DRAFT');
      run.stop();
      run.client.clear();
    },
  );
});

describe('a card write cancels only the detail read [VAC-08, ADR-020]', () => {
  it.each(cases)(
    '%s write failing with %s leaves the first content read running',
    async (kind, _name, answer) => {
      const client = new QueryClient();
      const seeded = kind === 'publish' ? draftCard() : card();
      client.setQueryData(queryKeys.vacancy(SHARE_ID), seeded);
      let finishContent: (response: Response) => void = () => undefined;
      const contentAnswer = new Promise<Response>((resolve) => {
        finishContent = resolve;
      });
      const fetcher = vi.fn<typeof fetch>((url, init) => {
        if (init?.method === 'PUT' || init?.method === 'POST')
          return Promise.resolve(answer());
        return String(url).endsWith('/content')
          ? contentAnswer
          : new Promise<Response>(() => undefined);
      });
      vi.stubGlobal('fetch', fetcher);
      const contentRead = client.prefetchQuery(vacancyContentQuery(SHARE_ID));
      void client.prefetchQuery(vacancyDetailQuery(SHARE_ID));

      await expect(writes[kind](client)).resolves.toMatchObject({
        status: 'failed',
      });

      expect(
        client.getQueryState(queryKeys.vacancyContent(SHARE_ID))?.fetchStatus,
      ).toBe('fetching');
      expect(
        client.getQueryState(queryKeys.vacancy(SHARE_ID))?.fetchStatus,
      ).toBe('idle');
      expect(client.getQueryData(queryKeys.vacancy(SHARE_ID))).toEqual(seeded);
      finishContent(Response.json(content));
      await contentRead;
      expect(
        client.getQueryState(queryKeys.vacancyContent(SHARE_ID))?.status,
      ).toBe('success');
      client.clear();
    },
  );
});
