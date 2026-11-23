import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { vacancyContentQuery } from '@/lib/queries/vacancy-content';
import { vacancyDetailQuery } from '@/lib/queries/vacancy-detail';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
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
};
const cases = [
  ['status', '429', () => Response.json({ code: 'RATE' }, { status: 429 })],
  ['status', 'network', () => Promise.reject(new TypeError('offline'))],
  ['urgency', '429', () => Response.json({ code: 'RATE' }, { status: 429 })],
  ['urgency', 'network', () => Promise.reject(new TypeError('offline'))],
] as const;

afterEach(() => vi.unstubAllGlobals());

describe('a card write cancels only the detail read [VAC-08, ADR-020]', () => {
  it.each(cases)(
    '%s write failing with %s leaves the first content read running',
    async (kind, _name, answer) => {
      const client = new QueryClient();
      const seeded = card();
      client.setQueryData(queryKeys.vacancy(SHARE_ID), seeded);
      let finishContent: (response: Response) => void = () => undefined;
      const contentAnswer = new Promise<Response>((resolve) => {
        finishContent = resolve;
      });
      const fetcher = vi.fn<typeof fetch>((url, init) => {
        if (init?.method === 'PUT') return Promise.resolve(answer());
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
