import { expect, test } from '@playwright/test';
import { DEMO_VERTICALS } from '../../server/db/seed';
import { sessionFile } from '../support/e2e-session';
import { openHydrated } from '../support/hydration';
import { problemFulfill } from '../support/problem';
import { chooseOption } from '../support/select';
import messages from '../../messages/uk.json' with { type: 'json' };
import {
  t,
  OWN_DRAFT_PREFIX,
  CREATE_URL,
  field,
  position,
  vertical,
  teamLead,
  LEADS,
  leadOption,
  saveDraft,
  creates,
  sweepOwnDrafts,
  choosePosition,
} from './support/vacancy-create';

test.describe('Team Lead picker [STORY-VAC-01-1, vacancy.team_lead.set]', () => {
  test.describe('Admin', () => {
    test.use({ storageState: sessionFile('admin@demo') });
    test.afterEach(({ page }) => sweepOwnDrafts(page));

    test('picks a Team Lead of the chosen vertical by priority and saves it with the draft', async ({
      page,
    }) => {
      const sent = creates(page);
      await openHydrated(page, '/vacancies/new');
      await expect(teamLead(page)).toBeDisabled();
      await expect(teamLead(page)).toHaveAttribute(
        'placeholder',
        t.position.needVertical,
      );

      await chooseOption(page, vertical(page), 'Гемблінг');
      await expect(teamLead(page)).toBeEnabled();
      await expect(teamLead(page)).toHaveAttribute(
        'placeholder',
        t.teamLead.placeholder,
      );
      await teamLead(page).click();
      await expect(leadOption(page, LEADS.taras)).toBeVisible();
      const names = await page.getByRole('option').allTextContents();
      const at = (name: string) =>
        names.findIndex((text) => text.includes(name));
      expect(at(LEADS.vasyl)).toBeGreaterThanOrEqual(0);
      expect(at(LEADS.vasyl)).toBeLessThan(at(LEADS.taras));
      expect(at(LEADS.dmytro)).toBe(-1);
      await expect(leadOption(page, LEADS.vasyl)).toContainText(
        'Тімлід · Гемблінг · П0',
      );
      await leadOption(page, LEADS.taras).click();
      await expect(teamLead(page)).toHaveValue(LEADS.taras);

      const title = `${OWN_DRAFT_PREFIX} ${Date.now()}`;
      await field(page, t.titleField.label).fill(title);
      await saveDraft(page).click();
      await expect(page).toHaveURL(/\/vacancies\?.*status=DRAFT/);
      expect(sent).toHaveLength(1);
      expect(sent[0]!.postDataJSON()).toEqual({
        mode: 'DRAFT',
        verticalId: DEMO_VERTICALS.gambling,
        title,
        headcount: 1,
        priority: 'NORMAL',
        teamLeadId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        // The Admin sees the probation field with its default, so the default travels.
        probationDays: 90,
      });
      const id = new URL(page.url()).searchParams.get('vacancy');
      const stored = await page.request.get(`/api/v1/vacancies/${id}`);
      expect(
        ((await stored.json()) as { teamLead: { fullName: string } | null })
          .teamLead?.fullName,
      ).toBe(LEADS.taras);
    });

    test('a vertical change clears the Team Lead and the position and says so; the new vertical offers its own Team Leads', async ({
      page,
    }) => {
      await openHydrated(page, '/vacancies/new');
      await chooseOption(page, vertical(page), 'Гемблінг');
      await choosePosition(page);
      await teamLead(page).click();
      await leadOption(page, LEADS.vasyl).click();
      await expect(teamLead(page)).toHaveValue(LEADS.vasyl);

      await chooseOption(page, vertical(page), 'Крипто');
      await expect(teamLead(page)).toHaveValue('');
      await expect(position(page)).toHaveValue('');
      await expect(
        page.getByText(t.vertical.resetBoth, { exact: true }),
      ).toBeVisible();

      await teamLead(page).click();
      await expect(leadOption(page, LEADS.dmytro)).toBeVisible();
      await expect(leadOption(page, LEADS.vasyl)).toHaveCount(0);
      await leadOption(page, LEADS.dmytro).click();
      await chooseOption(page, vertical(page), 'Гемблінг');
      await expect(teamLead(page)).toHaveValue('');
      await expect(
        page.getByText(t.vertical.resetTeamLead, { exact: true }),
      ).toBeVisible();
    });

    test('a Team Lead the server refuses is flagged on its field, which gets the focus; the list is read again [ux §4.1]', async ({
      page,
    }) => {
      let listed = 0;
      await page.route(/\/verticals\/[^/]+\/team-leads$/, (route) => {
        listed += 1;
        return route.fallback();
      });
      await page.route(CREATE_URL, async (route) =>
        route.request().method() === 'POST'
          ? route.fulfill(
              await problemFulfill(400, 'VALIDATION_FAILED', [
                { path: 'body.teamLeadId', code: 'invalid_team_lead' },
              ]),
            )
          : route.fallback(),
      );
      await openHydrated(page, '/vacancies/new');
      await chooseOption(page, vertical(page), 'Гемблінг');
      await teamLead(page).click();
      await leadOption(page, LEADS.vasyl).click();
      await field(page, t.titleField.label).fill('Назва для перевірки');
      await saveDraft(page).click();
      await expect(
        page.getByText(messages.vacancies.draftErrors.teamLeadInvalid, {
          exact: true,
        }),
      ).toBeVisible();
      await expect(teamLead(page)).toBeFocused();
      await expect(teamLead(page)).toHaveValue(LEADS.vasyl);
      await expect(page).toHaveURL(/\/vacancies\/new$/);
      const before = listed;
      await teamLead(page).click();
      await expect(leadOption(page, LEADS.taras)).toBeVisible();
      expect(listed).toBeGreaterThan(before);
    });

    test('a failed list load shows the retry row and the retry loads the list', async ({
      page,
    }) => {
      let fail = true;
      await page.route(/\/verticals\/[^/]+\/team-leads$/, async (route) =>
        fail
          ? route.fulfill(await problemFulfill(403, 'FORBIDDEN'))
          : route.fallback(),
      );
      await openHydrated(page, '/vacancies/new');
      await chooseOption(page, vertical(page), 'Гемблінг');
      await teamLead(page).click();
      await expect(
        page.getByText(messages.common.comboboxFailed, { exact: true }),
      ).toBeVisible();
      fail = false;
      await page
        .getByRole('button', { name: messages.common.retry, exact: true })
        .click();
      await expect(leadOption(page, LEADS.vasyl)).toBeVisible();
    });
  });

  test.describe('Head Recruiter', () => {
    test.use({ storageState: sessionFile('head.recruiter.gambling@demo') });

    test('offers only the Team Leads of the own vertical, which is preset', async ({
      page,
    }) => {
      await openHydrated(page, '/vacancies/new');
      await expect(teamLead(page)).toBeEnabled();
      await teamLead(page).click();
      await expect(leadOption(page, LEADS.vasyl)).toBeVisible();
      await expect(leadOption(page, LEADS.taras)).toBeVisible();
      await expect(leadOption(page, LEADS.dmytro)).toHaveCount(0);
    });
  });

  test.describe('Recruiter', () => {
    test.use({ storageState: sessionFile('recruiter1.gambling@demo') });

    test('has no Team Lead field and the API refuses the list', async ({
      page,
    }) => {
      await openHydrated(page, '/vacancies/new');
      await expect(field(page, t.titleField.label)).toBeVisible();
      await expect(teamLead(page)).toHaveCount(0);
      await expect(page.getByText(t.teamLead.hint)).toHaveCount(0);
      const answer = await page.request.get(
        `/api/v1/verticals/${DEMO_VERTICALS.gambling}/team-leads`,
      );
      expect(answer.status()).toBe(403);
    });
  });
});

test.describe('Head Recruiter names the Team Lead of the own vertical [STORY-VAC-01-1, vacancy.team_lead.set]', () => {
  test.use({ storageState: sessionFile('head.recruiter.gambling@demo') });
  test.afterEach(({ page }) => sweepOwnDrafts(page));

  test('the chosen Team Lead travels with the draft, and clearing it sends none', async ({
    page,
  }) => {
    const sent = creates(page);
    await openHydrated(page, '/vacancies/new');
    await teamLead(page).click();
    await leadOption(page, LEADS.vasyl).click();
    await expect(teamLead(page)).toHaveValue(LEADS.vasyl);
    await page
      .getByRole('button', { name: messages.common.comboboxClear, exact: true })
      .click();
    await expect(teamLead(page)).toHaveValue('');
    await teamLead(page).click();
    await leadOption(page, LEADS.taras).click();

    await field(page, t.titleField.label).fill(
      `${OWN_DRAFT_PREFIX} ${Date.now()}`,
    );
    await saveDraft(page).click();
    await expect(page).toHaveURL(/\/vacancies\?.*status=DRAFT/);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.postDataJSON()).toMatchObject({
      mode: 'DRAFT',
      verticalId: DEMO_VERTICALS.gambling,
      teamLeadId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    const id = new URL(page.url()).searchParams.get('vacancy');
    const stored = await page.request.get(`/api/v1/vacancies/${id}`);
    expect(
      ((await stored.json()) as { teamLead: { fullName: string } | null })
        .teamLead?.fullName,
    ).toBe(LEADS.taras);
  });
});

test.describe('Team Lead field layout, Admin [STORY-VAC-01-1, ux §3]', () => {
  test.use({ storageState: sessionFile('admin@demo') });

  test('it is a full-width row after the urgency control, readable without zoom; its list stays on the screen', async ({
    page,
    isMobile,
  }) => {
    await openHydrated(page, '/vacancies/new');
    await chooseOption(page, vertical(page), 'Гемблінг');
    const lead = (await teamLead(page).boundingBox())!;
    const title = (await field(page, t.titleField.label).boundingBox())!;
    const urgency = (await page
      .getByRole('radio', { name: t.priority.URGENT })
      .boundingBox())!;
    const { width: screenWidth, height: screenHeight } = page.viewportSize()!;
    expect(Math.abs(lead.width - title.width)).toBeLessThanOrEqual(1);
    expect(lead.y).toBeGreaterThan(urgency.y + urgency.height - 1);
    expect(lead.height).toBeGreaterThanOrEqual(isMobile ? 44 : 40);
    expect(lead.x + lead.width).toBeLessThanOrEqual(screenWidth);
    if (isMobile) await expect(teamLead(page)).toHaveCSS('font-size', '16px');
    await expect(
      page.getByText(t.teamLead.hint, { exact: true }),
    ).toBeVisible();

    await teamLead(page).click();
    const list = (await page.getByRole('listbox').boundingBox())!;
    expect(list.x).toBeGreaterThanOrEqual(0);
    expect(list.x + list.width).toBeLessThanOrEqual(screenWidth);
    expect(list.y).toBeGreaterThanOrEqual(0);
    expect(list.height).toBeLessThanOrEqual(screenHeight * 0.6 + 1);
    const option = (await leadOption(page, LEADS.vasyl).boundingBox())!;
    expect(option.height).toBeGreaterThanOrEqual(isMobile ? 44 : 36);
    await leadOption(page, LEADS.vasyl).click();
    await expect(teamLead(page)).toHaveValue(LEADS.vasyl);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
});
