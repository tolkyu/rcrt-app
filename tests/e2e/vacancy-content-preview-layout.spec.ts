import { expect, type Locator } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { DEMO_VERTICALS } from '../../server/db/seed';
import { sessionFile } from '../support/e2e-session';
import { openHydrated } from '../support/hydration';
import { test } from './support/vacancy-content';

const v = messages.vacancies;
const TEAM_LEAD = 'Василь Мороз';
const RECRUITER_NAME = 'Марія Шевченко';

async function expectChipWhole(chip: Locator) {
  await expect(chip).toBeInViewport({ ratio: 1 });
  const textOverflows = await chip.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const text = range.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    return text.left < box.left - 0.5 || text.right > box.right + 0.5;
  });
  expect(textOverflows).toBe(false);
}

test.describe('list with the preview open at 1440x900 [VAC-02, M5, M6]', () => {
  test.use({
    storageState: sessionFile('head.recruiter.gambling@demo'),
    viewport: { width: 1440, height: 900 },
  });
  test.skip(({ isMobile }) => isMobile, 'the preview starts at 1280 px');

  test('row actions and status chips stay whole, More stays on the action row, and the preview holds every column', async ({
    page,
    vacancy,
  }) => {
    await openHydrated(
      page,
      `/vacancies?vertical=${DEMO_VERTICALS.gambling}&q=${encodeURIComponent(vacancy.title)}&vacancy=${vacancy.id}`,
    );
    const preview = page.getByRole('complementary', { name: v.previewLabel });
    await expect(
      preview.getByRole('heading', { name: vacancy.title }),
    ).toBeVisible();

    const row = page
      .locator('table tbody tr')
      .filter({ hasText: vacancy.number });
    await expect(
      row.getByRole('button', {
        name: v.statusMenu.menuLabel.replace('{title}', vacancy.title),
        exact: true,
      }),
    ).toBeInViewport({ ratio: 1 });
    await expect(
      row.getByRole('button', {
        name: v.previewSelect.replace('{title}', vacancy.title),
        exact: true,
      }),
    ).toBeInViewport({ ratio: 1 });

    const chipIn = (scope: Locator) =>
      scope.locator('[data-slot="badge"]').filter({ hasText: v.status.OPEN });
    await expectChipWhole(chipIn(row));
    await expectChipWhole(chipIn(preview));

    const actions = preview.locator('[data-slot="detail-header-actions"]');
    const openCard = actions.getByRole('link', {
      name: v.openCard,
      exact: true,
    });
    const menu = actions.locator('button[aria-haspopup="menu"]');
    await expect(openCard).toBeVisible();
    await expect(menu).toBeVisible();
    const centre = async (control: Locator) => {
      const box = (await control.boundingBox())!;
      return box.y + box.height / 2;
    };
    expect(
      Math.abs((await centre(menu)) - (await centre(openCard))),
    ).toBeLessThanOrEqual(1);

    for (const text of [
      messages.vacancies.status.OPEN,
      'Гемблінг',
      TEAM_LEAD,
      RECRUITER_NAME,
    ])
      await expect(preview).toContainText(text);
    await expect(
      preview.locator('dt', { hasText: v.fields.openedAt }).locator('+ dd'),
    ).toHaveText(/\b0?2\b.*2026/);
  });
});
