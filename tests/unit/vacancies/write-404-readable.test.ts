import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeDraft } from '@/lib/vacancy-draft-close';
import { publishFromList } from '@/lib/vacancy-draft-publish';
import { createAttemptKeys, submitEdit } from '@/lib/vacancy-edit-submit';
import { toggleStatus } from '@/lib/vacancy-status-change';
import { assignRecruitersRequest, attemptTeamWrite } from '@/lib/vacancy-team';
import { changeUrgency } from '@/lib/vacancy-urgency-change';
import {
  ID,
  json,
  problem,
  stubApi,
  vacancy,
} from '../../support/team-harness';

vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

afterEach(() => vi.unstubAllGlobals());

const client = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });
const READ = `GET /vacancies/${ID}`;
const notFound = () => problem(404, 'NOT_FOUND');
/** The card read after the refused write: still readable, or gone too. */
const cardRead = {
  readable: () =>
    json(
      vacancy({
        status: 'DRAFT',
        version: 3,
        position: {
          id: '5d2c1b0a-9e8f-4a7b-8c6d-5e4f3a2b1c0d',
          name: 'Медіабаєр',
        },
      }),
    ),
  gone: notFound,
};
const CASES = [
  ['readable', 'forbidden'],
  ['gone', 'gone'],
] as const;

describe('a write 404 is judged by the card read that follows [ADR-020 access loss, VAC-02, VAC-03, VAC-08]', () => {
  it.each(CASES)('urgency: card %s → %s', async (read, kind) => {
    stubApi({
      [`PUT /vacancies/${ID}/urgency`]: notFound,
      [READ]: cardRead[read],
    });
    const outcome = await changeUrgency(client(), {
      id: ID,
      number: 'V-0007',
      from: 'NORMAL',
      to: 'URGENT',
      version: 3,
    });
    expect(outcome).toEqual({ status: 'failed', failure: { kind } });
  });

  it.each(CASES)('status pause: card %s → %s', async (read, kind) => {
    stubApi({
      [`PUT /vacancies/${ID}/status`]: notFound,
      [READ]: cardRead[read],
    });
    const outcome = await toggleStatus(client(), {
      id: ID,
      number: 'V-0007',
      action: 'HOLD',
      version: 3,
      unassigned: false,
    });
    expect(outcome).toMatchObject({ status: 'failed', failure: kind });
  });

  it.each(CASES)('team write: card %s → %s', async (read, kind) => {
    stubApi({
      [`POST /vacancies/${ID}/recruiters`]: notFound,
      [READ]: cardRead[read],
    });
    const outcome = await attemptTeamWrite(client(), ID, () =>
      assignRecruitersRequest(ID, ['u1'], 3),
    );
    expect(outcome).toEqual({ ok: false, failure: kind });
  });

  it.each(CASES)('draft cancel: card %s → %s', async (read, kind) => {
    stubApi({
      [`POST /vacancies/${ID}/cancel`]: notFound,
      [READ]: cardRead[read],
    });
    const draft = {
      id: ID,
      number: 'V-0007',
      title: 'Медіабаєр — Facebook',
      status: 'DRAFT',
      vertical: { id: 'v1' },
    } as const;
    await expect(
      closeDraft(client(), 'cancel', draft, 'Позиція вже не потрібна', false),
    ).resolves.toEqual({ status: 'failed', failure: kind });
  });

  it.each(CASES)('draft delete: card %s → %s', async (read, kind) => {
    stubApi({
      [`DELETE /vacancies/${ID}`]: notFound,
      [READ]: cardRead[read],
    });
    const draft = {
      id: ID,
      number: 'V-0007',
      title: 'Медіабаєр — Facebook',
      status: 'CANCELLED',
      vertical: { id: 'v1' },
    } as const;
    await expect(
      closeDraft(client(), 'delete', draft, '', false),
    ).resolves.toEqual({ status: 'failed', failure: kind });
  });

  it('own delete: the retry of a delete whose answer was lost keeps «gone» at once, without a card read', async () => {
    const { calls } = stubApi({
      [`DELETE /vacancies/${ID}`]: notFound,
      [READ]: cardRead.readable,
    });
    const draft = {
      id: ID,
      number: 'V-0007',
      title: 'Медіабаєр — Facebook',
      status: 'DRAFT',
      vertical: { id: 'v1' },
    } as const;
    await expect(
      closeDraft(client(), 'delete', draft, '', true),
    ).resolves.toEqual({ status: 'failed', failure: 'gone' });
    expect(calls.map(({ method }) => method)).toEqual(['DELETE']);
  });

  const forbiddenToast = {
    type: 'toast',
    tone: 'error',
    title: 'forbidden',
    retry: false,
  };
  const expectedEffect = (kind: 'forbidden' | 'gone') =>
    kind === 'forbidden' ? forbiddenToast : { type: 'gone' };

  it.each(CASES)('draft save (PATCH): card %s → %s', async (read, kind) => {
    stubApi({
      [`PATCH /vacancies/${ID}`]: notFound,
      [READ]: cardRead[read],
    });
    const outcome = await submitEdit(client(), createAttemptKeys(), {
      id: ID,
      version: 3,
      action: 'DRAFT',
      changes: { title: 'Медіабаєр — TikTok' },
      everything: { title: 'Медіабаєр — TikTok' },
      hasSalaryAmount: false,
    });
    expect(outcome).toEqual({
      status: 'failed',
      effect: expectedEffect(kind),
      stage: 'patch',
      saved: null,
    });
  });

  it.each(CASES)('draft publish: card %s → %s', async (read, kind) => {
    stubApi({
      [`POST /vacancies/${ID}/publish`]: notFound,
      [READ]: cardRead[read],
    });
    const outcome = await submitEdit(client(), createAttemptKeys(), {
      id: ID,
      version: 3,
      action: 'PUBLISH',
      changes: null,
      everything: {},
      hasSalaryAmount: false,
    });
    expect(outcome).toMatchObject({
      status: 'failed',
      effect: expectedEffect(kind),
      stage: 'publish',
    });
  });

  it('publish from a list row: a readable card turns the 404 into the forbidden toast', async () => {
    const queryClient = client();
    stubApi({
      [`POST /vacancies/${ID}/publish`]: notFound,
      [READ]: cardRead.readable,
    });
    const outcome = await publishFromList(queryClient, ID, {
      removed: () => undefined,
      restored: () => undefined,
      settled: () => undefined,
    });
    expect(outcome).toEqual({ status: 'failed', effect: forbiddenToast });
  });
});
