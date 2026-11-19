// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StatusActions from '@/components/vacancies/status-actions';
import messages from '@/messages/uk.json';
import { mountTeam, stubApi, vacancy } from '../../support/team-harness';

// A tab older than the last deploy: neither dialog chunk can load.
vi.mock('@/components/vacancies/cancel-vacancy-dialog', () => {
  throw new Error('Failed to fetch dynamically imported module');
});
vi.mock('@/components/vacancies/reopen-vacancy-dialog', () => {
  throw new Error('Failed to fetch dynamically imported module');
});
const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));
vi.mock('@/lib/toast', () => ({ toast }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('status dialogs when a chunk cannot load', () => {
  it('reopen: tells the user, sends nothing and keeps the card usable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const api = stubApi({});
    mountTeam(
      createElement(StatusActions, {
        vacancy: vacancy({ status: 'FILLED', statusActions: ['REOPEN'] }),
        preview: false,
      }),
    );
    const name = messages.vacancies.statusMenu.reopen;
    await userEvent.click(await screen.findByRole('button', { name }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        messages.vacancies.team.loadFailed,
        expect.anything(),
      ),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.calls).toHaveLength(0);
    expect(screen.getByRole('button', { name })).toBeTruthy();
  });
});
