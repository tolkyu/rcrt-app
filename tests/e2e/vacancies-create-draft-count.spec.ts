import { expect, test } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { sessionFile } from '../support/e2e-session';
import { openHydrated } from '../support/hydration';
import { chooseOption } from '../support/select';
import { VISIBLE_VACANCIES } from '../support/vacancy-demo';
import {
  DRAFT_CHIP,
  OWN_DRAFT_PREFIX,
  field,
  heading,
  saveDraft,
  statusChips,
  sweepOwnDrafts,
  t,
  vertical,
} from './support/vacancy-create';

const AUTHORS = (
  Object.keys(VISIBLE_VACANCIES) as (keyof typeof VISIBLE_VACANCIES)[]
).filter((user) => /^(admin|head\.recruiter|recruiter)/.test(user));

for (const user of AUTHORS) {
  test.describe(`«Чернетки» on landing, ${user} [STORY-VAC-01-3 AC1]`, () => {
    test.use({ storageState: sessionFile(user) });

    test('the chip shows exactly the own-drafts API count', async ({
      page,
    }) => {
      const response = await page.goto(
        user === 'admin@demo' ? '/vacancies' : '/',
      );
      expect(response?.status()).toBe(200);
      await expect(page).toHaveURL(/\/vacancies$/);
      const answer = await page.request.get('/api/v1/vacancies/drafts/count');
      expect(answer.status()).toBe(200);
      const { count } = (await answer.json()) as { count: number };
      await expect(
        statusChips(page)
          .getByRole('radio', { name: DRAFT_CHIP })
          .locator('.tabular-nums'),
      ).toHaveText(String(count));
    });
  });
}

for (const [user, picksVertical] of [
  ['admin@demo', true],
  ['head.recruiter.gambling@demo', false],
  ['recruiter2.gambling@demo', false],
] as const) {
  test.describe(`own draft in the list after saving, ${user} [STORY-VAC-01-3, D110]`, () => {
    test.use({ storageState: sessionFile(user) });
    test.afterEach(({ page }) => sweepOwnDrafts(page));

    test('the «Чернетки» count follows the save and the new row is a draft row, selected on a wide screen', async ({
      page,
      isMobile,
    }) => {
      const title = `${OWN_DRAFT_PREFIX} ${Date.now()}`;
      await openHydrated(page, '/vacancies');
      const count = statusChips(page)
        .getByRole('radio', { name: DRAFT_CHIP })
        .locator('.tabular-nums');
      await expect(count).toHaveText(/^\d+$/);
      const before = Number(await count.innerText());

      await page
        .locator(
          isMobile ? '[data-sticky-action-bar] a' : 'a[href="/vacancies/new"]',
        )
        .filter({ visible: true })
        .first()
        .click();
      await expect(heading(page)).toBeVisible();
      if (picksVertical) await chooseOption(page, vertical(page), 'Гемблінг');
      await field(page, t.titleField.label).fill(title);
      await saveDraft(page).click();
      await expect(page).toHaveURL(/\/vacancies\?.*status=DRAFT/);

      await expect(
        page.getByRole('link', { name: title }).filter({ visible: true }),
      ).toHaveCount(1);
      await expect(count).toHaveText(String(before + 1));
      await expect(
        page.getByText(messages.vacancies.draft.empty.title),
      ).toHaveCount(0);

      const row = (
        isMobile
          ? page
              .getByRole('list', {
                name: messages.vacancies.caption,
                exact: true,
              })
              .getByRole('listitem')
          : page
              .getByRole('table', {
                name: messages.vacancies.caption,
                exact: true,
              })
              .getByRole('row')
      ).filter({ hasText: title });
      await expect(row).toHaveCount(1);
      const badge = row.getByText(messages.vacancies.status.DRAFT, {
        exact: true,
      });
      await expect(badge).toBeVisible();
      await expect(badge).toHaveCSS('border-top-style', 'dashed');
      await expect(row).toContainText(messages.vacancies.draft.noPosition);
      await expect(row).toContainText(messages.vacancies.notOpenedYet);
      if (isMobile) {
        const card = (await row.boundingBox())!;
        expect(card.x).toBeGreaterThanOrEqual(0);
        expect(card.x + card.width).toBeLessThanOrEqual(
          page.viewportSize()!.width,
        );
      } else {
        await expect(
          row.getByRole('button', {
            name: messages.vacancies.previewSelect.replace('{title}', title),
          }),
        ).toHaveAttribute('aria-pressed', 'true');
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    });
  });
}
