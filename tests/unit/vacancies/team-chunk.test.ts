// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TeamPanel } from '@/components/vacancies/team-panel';
import messages from '@/messages/uk.json';
import { mountTeam, stubApi, vacancy } from '../../support/team-harness';

// A tab older than the last deploy: none of the dialog chunks can load.
vi.mock('@/components/vacancies/assign-recruiters-dialog', () => {
  throw new Error('Failed to fetch dynamically imported module');
});
vi.mock('@/components/vacancies/claim-vacancy-dialog', () => {
  throw new Error('Failed to fetch dynamically imported module');
});
vi.mock('@/components/vacancies/team-lead-dialog', () => {
  throw new Error('Failed to fetch dynamically imported module');
});
const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));
vi.mock('@/lib/toast', () => ({ toast }));

const t = messages.vacancies.team;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('«Команда» when a dialog chunk cannot load', () => {
  it.each([
    ['claim', t.claim],
    ['assign', t.assign],
    ['teamLead', t.setTeamLead],
  ])(
    '%s: tells the user, sends nothing and keeps the card usable',
    async (_kind, label) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const api = stubApi({});
      mountTeam(
        createElement(TeamPanel, {
          vacancy: vacancy({
            canSelfAssign: true,
            canAssignRecruiters: true,
            canSetTeamLead: true,
          }),
          preview: false,
        }),
      );
      await userEvent.click(screen.getByRole('button', { name: label }));
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          t.loadFailed,
          expect.anything(),
        ),
      );
      expect(api.calls).toHaveLength(0);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
      expect(screen.getByRole('heading', { name: t.recruiters })).toBeTruthy();
    },
  );
});
