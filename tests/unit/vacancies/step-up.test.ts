// @vitest-environment jsdom
import { act, cleanup, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusHeaderActions } from '@/components/vacancies/status-header-actions';
import { TeamPanel } from '@/components/vacancies/team-panel';
import messages from '@/messages/uk.json';
import { mountTeam, stubApi, vacancy } from '../../support/team-harness';

vi.mock('next/navigation', () => ({
  usePathname: () => '/vacancies/abc',
  useSearchParams: () => new URLSearchParams('tab=team'),
}));
vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const step = messages.vacancies.stepUp;
const team = messages.vacancies.team;
const menu = messages.vacancies.statusMenu;
const HREF = `/mfa/verify?next=${encodeURIComponent('/vacancies/abc?tab=team')}`;

const panel = (changes: Parameters<typeof vacancy>[0]) =>
  mountTeam(
    createElement(TeamPanel, { vacancy: vacancy(changes), preview: false }),
  );
const header = (changes: Parameters<typeof vacancy>[0], preview = false) =>
  mountTeam(
    createElement(StatusHeaderActions, { vacancy: vacancy(changes), preview }),
  );

afterEach(cleanup);

describe('step-up reason for Admin actions at aal1 [D63, STORY-VAC-02-1, VAC-03-1, VAC-03-2]', () => {
  it('«Команда» shows both team buttons disabled with the reason and a link back to the card', () => {
    stubApi({});
    panel({ needsMfa: true, status: 'OPEN' });
    for (const name of [team.setTeamLead, team.assign]) {
      const button = screen.getByRole('button', { name });
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(button.getAttribute('aria-describedby')).toBeTruthy();
    }
    const links = screen.getAllByRole('link', { name: step.verify });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link.getAttribute('href')).toBe(HREF);
    expect(screen.getAllByText(step.reason).length).toBeGreaterThan(0);
  });

  it('keeps a granted control enabled and adds a reason only for the missing one', () => {
    stubApi({});
    panel({ needsMfa: true, status: 'OPEN', canAssignRecruiters: true });
    expect(
      screen
        .getByRole('button', { name: team.assign })
        .getAttribute('aria-disabled'),
    ).toBeNull();
    expect(
      screen
        .getByRole('button', { name: team.setTeamLead })
        .getAttribute('aria-disabled'),
    ).toBe('true');
    expect(screen.getAllByRole('link', { name: step.verify })).toHaveLength(1);
  });

  it('shows nothing extra without the flag, and nothing on a closed vacancy', () => {
    stubApi({});
    panel({ needsMfa: false });
    expect(screen.queryByRole('link')).toBeNull();
    cleanup();
    panel({ needsMfa: true, status: 'FILLED' });
    expect(screen.queryByRole('link')).toBeNull();
  });

  it.each([
    ['OPEN', menu.hold],
    ['ON_HOLD', menu.resume],
    ['FILLED', menu.reopen],
  ] as const)(
    'the card header shows %s «%s» disabled with the step-up link',
    async (status, label) => {
      stubApi({});
      header({ needsMfa: true, status, statusActions: [] });
      const button = await screen.findByRole('button', { name: label });
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(
        (await screen.findByRole('link', { name: step.verify })).getAttribute(
          'href',
        ),
      ).toBe(HREF);
    },
  );

  it('does not mount for a viewer with neither a status action nor a step-up', () => {
    stubApi({});
    header({ needsMfa: false, statusActions: [] });
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('the preview menu has no place for a reason, so it adds no link', async () => {
    stubApi({});
    header({ needsMfa: true, status: 'OPEN', statusActions: [] }, true);
    await act(() => new Promise((done) => setTimeout(done, 50)));
    expect(screen.queryByRole('link')).toBeNull();
  });
});
