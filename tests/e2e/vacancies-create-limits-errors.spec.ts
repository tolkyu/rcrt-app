import { expect, test, type Page } from '@playwright/test';
import { sessionFile } from '../support/e2e-session';
import { openHydrated } from '../support/hydration';
import { problemFulfill } from '../support/problem';
import messages from '../../messages/uk.json' with { type: 'json' };
import {
  t,
  OWN_DRAFT_PREFIX,
  CREATE_URL,
  field,
  saveDraft,
  publish,
  creates,
  sweepOwnDrafts,
  choosePosition,
  level,
  draftLimitReason,
  COUNT_URL,
  startDraft,
} from './support/vacancy-create';

test.describe('50-draft limit on «Зберегти чернетку» [D98, ux §4.2]', () => {
  test.use({ storageState: sessionFile('head.recruiter.gambling@demo') });
  test.afterEach(({ page }) => sweepOwnDrafts(page));

  /** The page starts with the server's real count and trusts it for 30 s; the stub is read once the clock has moved past that and the tab «regains focus». */
  const stubCount = async (page: Page, count: number) => {
    await page.addInitScript(() => {
      const realNow = Date.now.bind(Date);
      let skew = 0;
      Date.now = () => realNow() + skew;
      window.addEventListener('e2e-skew', (event) => {
        skew = (event as CustomEvent<number>).detail;
      });
    });
    await page.route(COUNT_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count }),
      }),
    );
  };
  const revalidateCount = async (page: Page) => {
    const asked = page.waitForRequest(COUNT_URL);
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('e2e-skew', { detail: 31_000 }));
      window.dispatchEvent(new Event('visibilitychange'));
    });
    await asked;
  };
  const helper = (page: Page) =>
    page
      .locator('[data-slot="form-page-footer"] span[id]')
      .filter({ hasText: draftLimitReason });

  test('at 50 drafts the button stays focusable, explains itself (tooltip on hover, text on touch) and sends nothing; publishing is not blocked', async ({
    page,
    isMobile,
  }) => {
    const sent = creates(page);
    await stubCount(page, 50);
    // Publishing is not blocked, so the press that proves it is answered by a stub instead of a real vacancy.
    await page.route(CREATE_URL, async (route) =>
      route.request().method() === 'POST'
        ? route.fulfill(await problemFulfill(500, 'INTERNAL'))
        : route.fallback(),
    );
    await openHydrated(page, '/vacancies/new');
    await choosePosition(page);
    await revalidateCount(page);
    await expect(saveDraft(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(saveDraft(page)).toHaveAccessibleDescription(draftLimitReason);
    await expect(publish(page)).not.toHaveAttribute('aria-disabled', 'true');
    if (isMobile) {
      await saveDraft(page).focus();
      await expect(saveDraft(page)).toBeFocused();
      await expect(helper(page)).toBeVisible();
      const [button, note] = await Promise.all([
        saveDraft(page).boundingBox(),
        helper(page).boundingBox(),
      ]);
      expect(note!.y).toBeGreaterThanOrEqual(button!.y + button!.height);
    } else {
      await saveDraft(page).focus();
      await expect(saveDraft(page)).toBeFocused();
      await saveDraft(page).hover();
      await expect(
        page
          .locator('[data-radix-popper-content-wrapper] .motion-tooltip')
          .filter({ hasText: draftLimitReason }),
      ).toBeVisible();
      await expect(saveDraft(page)).toBeFocused();
    }
    await saveDraft(page).click({ force: true });
    await saveDraft(page).press('Enter');
    expect(sent).toHaveLength(0);
    await field(page, t.titleField.label).press('Control+Enter');
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0]!.postDataJSON()).toMatchObject({ mode: 'PUBLISH' });
  });

  test('the count the server sent with the page is trusted on mount: no count request until it is stale', async ({
    page,
  }) => {
    const asked: string[] = [];
    page.on('request', (request) => {
      if (COUNT_URL.test(request.url())) asked.push(request.url());
    });
    await startDraft(page, 'Назва для перевірки');
    await expect(saveDraft(page)).toBeEnabled();
    await page.waitForLoadState('networkidle');
    expect(asked).toEqual([]);
  });

  test('at 49 drafts the button works and shows no reason', async ({
    page,
  }) => {
    await stubCount(page, 49);
    await startDraft(page, `${OWN_DRAFT_PREFIX} ${Date.now()}`);
    await revalidateCount(page);
    await expect(saveDraft(page)).not.toHaveAttribute('aria-disabled', 'true');
    await expect(helper(page)).toHaveCount(0);
    await saveDraft(page).click();
    await expect(page).toHaveURL(/\/vacancies\?.*status=DRAFT/);
  });

  test('the keyboard reaches the disabled save in the tab order, its reason is announced and shown on focus, Enter and Space do nothing [ux §8]', async ({
    page,
    isMobile,
  }) => {
    const sent = creates(page);
    await stubCount(page, 50);
    await startDraft(page, `${OWN_DRAFT_PREFIX} ${Date.now()}`);
    await revalidateCount(page);
    const footer = page.locator('[data-slot="form-page-footer"]');
    await footer
      .getByRole('link', { name: messages.common.cancel, exact: true })
      .focus();
    await page.keyboard.press('Tab');
    await expect(saveDraft(page)).toBeFocused();
    await expect(saveDraft(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(saveDraft(page)).not.toHaveAttribute('disabled');
    const [reasonId] = (await saveDraft(page).getAttribute(
      'aria-describedby',
    ))!.split(' ');
    await expect(page.locator(`[id="${reasonId}"]`)).toHaveText(
      draftLimitReason,
    );
    const cdp = await page.context().newCDPSession(page);
    try {
      await expect
        .poll(async () => {
          const { nodes } = await cdp.send('Accessibility.getFullAXTree');
          return nodes
            .filter(
              (node) =>
                node.role?.value === 'button' &&
                node.name?.value === t.actions.saveDraft,
            )
            .map((node) => node.description?.value);
        })
        .toEqual([draftLimitReason]);
    } finally {
      await cdp.detach();
    }
    const tooltip = page
      .locator('[data-radix-popper-content-wrapper] .motion-tooltip')
      .filter({ hasText: draftLimitReason });
    if (isMobile) await expect(helper(page)).toBeVisible();
    else await expect(tooltip).toBeVisible();

    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    await expect(saveDraft(page)).toBeFocused();
    await expect(saveDraft(page)).not.toHaveAttribute('aria-busy', 'true');
    await expect(page).toHaveURL(/\/vacancies\/new$/);
    expect(sent).toHaveLength(0);

    if (!isMobile) {
      await page.keyboard.press('Escape');
      await expect(tooltip).toBeHidden();
      await expect(saveDraft(page)).toBeFocused();
    }
    await page.keyboard.press('Tab');
    await expect(publish(page)).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(saveDraft(page)).toBeFocused();
  });

  test('a 409 from the server turns the button into the same explanation and keeps the values', async ({
    page,
  }) => {
    await page.route(CREATE_URL, async (route) =>
      route.request().method() === 'POST'
        ? route.fulfill(await problemFulfill(409, 'DRAFT_LIMIT_REACHED'))
        : route.fallback(),
    );
    await startDraft(page, 'Назва для перевірки');
    await expect(saveDraft(page)).not.toHaveAttribute('aria-disabled', 'true');
    await saveDraft(page).click();
    await expect(
      page.getByRole('alert').filter({ hasText: draftLimitReason }),
    ).toBeVisible();
    await expect(saveDraft(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(saveDraft(page)).toHaveAccessibleDescription(draftLimitReason);
    await expect(field(page, t.titleField.label)).toHaveValue(
      'Назва для перевірки',
    );
  });
});

test.describe('server refusals of the closed lists and the location text, Admin [ux §4.1]', () => {
  test.use({ storageState: sessionFile('admin@demo') });

  test('land on their own fields in page order, with the right copy, and keep every value', async ({
    page,
  }) => {
    await page.route(CREATE_URL, async (route) =>
      route.request().method() === 'POST'
        ? route.fulfill(
            await problemFulfill(400, 'VALIDATION_FAILED', [
              { path: 'body.location', code: 'custom' },
              { path: 'body.employmentType', code: 'invalid_value' },
              { path: 'body.workFormat', code: 'invalid_value' },
              { path: 'body.seniority', code: 'invalid_value' },
            ]),
          )
        : route.fallback(),
    );
    await startDraft(page, 'Назва для перевірки');
    await field(page, t.location.label).fill('Львів');
    await saveDraft(page).click();
    await expect(
      page.getByText(t.errors.optionInvalid, { exact: true }),
    ).toHaveCount(3);
    await expect(
      page.getByText(t.errors.locationChars, { exact: true }),
    ).toBeVisible();
    await expect(level(page)).toBeFocused();
    await expect(field(page, t.location.label)).toHaveValue('Львів');
    await expect(page).toHaveURL(/\/vacancies\/new$/);
  });
});
