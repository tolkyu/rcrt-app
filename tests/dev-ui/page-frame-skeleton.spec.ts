import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { openGallery } from '../support/dev-ui';

const t = messages.devUi.pageFrame;
const TOLERANCE = 2;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Visible boxes of `selector` inside `root`, measured from the root's top-left corner. */
async function relativeBoxes(
  page: Page,
  root: string,
  selector: string,
): Promise<Box[]> {
  return page.evaluate(
    ({ root, selector }) => {
      const origin = document.querySelector(root)!.getBoundingClientRect();
      return [...document.querySelector(root)!.querySelectorAll(selector)]
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => {
          const box = element.getBoundingClientRect();
          return {
            x: box.x - origin.x,
            y: box.y - origin.y,
            width: box.width,
            height: box.height,
          };
        });
    },
    { root, selector },
  );
}

/** Sticky footers sit at their natural spot only while the whole sample is in view. */
const alignToTop = (page: Page, root: string) =>
  page.evaluate(
    (selector) =>
      document.querySelector(selector)!.scrollIntoView({ block: 'start' }),
    root,
  );

function expectSameBoxes(skeleton: Box[], loaded: Box[]) {
  expect(skeleton).toHaveLength(loaded.length);
  expect(skeleton.length).toBeGreaterThan(0);
  skeleton.forEach((box, index) => {
    const other = loaded[index]!;
    for (const key of ['x', 'y', 'width', 'height'] as const)
      expect(
        Math.abs(box[key] - other[key]),
        `${key} of box ${index}: skeleton ${box[key]} vs loaded ${other[key]}`,
      ).toBeLessThanOrEqual(TOLERANCE);
  });
}

async function waitForSkeletons(page: Page) {
  for (const slot of ['row-skeleton', 'form-skeleton'])
    for (const skeleton of await page.locator(`[data-slot="${slot}"]`).all())
      await expect(skeleton).toHaveCSS('opacity', '1');
}

test('row skeleton has the boxes of the loaded rows: head, rows and the phone card [UI-F9, G20]', async ({
  page,
  isMobile,
}) => {
  await openGallery(page);
  await waitForSkeletons(page);
  const item = isMobile ? 'li' : 'tr';
  const skeleton = await relativeBoxes(
    page,
    '[data-slot="row-skeleton-sample"]',
    item,
  );
  const loaded = await relativeBoxes(
    page,
    '[data-slot="row-loaded-sample"]',
    item,
  );
  expect(skeleton).toHaveLength(isMobile ? 2 : 3);
  expectSameBoxes(skeleton, loaded);
  const [frame] = await relativeBoxes(
    page,
    '[data-slot="row-skeleton-sample"]',
    '[data-slot="card"]',
  );
  const [loadedFrame] = await relativeBoxes(
    page,
    '[data-slot="row-loaded-sample"]',
    '[data-slot="card"]',
  );
  expect(Math.abs(frame!.height - loadedFrame!.height)).toBeLessThanOrEqual(
    TOLERANCE,
  );
});

test('row skeleton keeps the loaded table geometry at every responsive column set [UI-F9, G20]', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'the table breakpoints exist from md up');
  await openGallery(page);
  for (const width of [1024, 1280, 1535, 1536, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await waitForSkeletons(page);
    const skeleton = await relativeBoxes(
      page,
      '[data-slot="row-skeleton-sample"]',
      'thead tr, thead th, tbody tr',
    );
    const loaded = await relativeBoxes(
      page,
      '[data-slot="row-loaded-sample"]',
      'thead tr, thead th, tbody tr',
    );
    expect(skeleton.length, `columns and rows at ${width}`).toBeGreaterThan(5);
    expect(skeleton, `box count at ${width}`).toHaveLength(loaded.length);
    skeleton.forEach((box, index) => {
      expect(
        Math.abs(box.height - loaded[index]!.height),
        `height of box ${index} at ${width}`,
      ).toBeLessThanOrEqual(TOLERANCE);
    });
    const [tableHeight] = await relativeBoxes(
      page,
      '[data-slot="row-skeleton-sample"]',
      'table',
    );
    const [loadedTableHeight] = await relativeBoxes(
      page,
      '[data-slot="row-loaded-sample"]',
      'table',
    );
    expect(
      Math.abs(tableHeight!.height - loadedTableHeight!.height),
    ).toBeLessThanOrEqual(TOLERANCE);
  }
});

test('form skeleton has the boxes of the loaded form: heading, fields, textarea and sticky footer [UI-F9, G20]', async ({
  page,
}) => {
  await openGallery(page);
  await waitForSkeletons(page);
  await alignToTop(page, '[data-slot="form-skeleton-sample"]');
  const skeleton = await relativeBoxes(
    page,
    '[data-slot="form-skeleton-sample"]',
    'h1, [data-slot="form-field-skeleton"], [data-slot="control-skeleton"], [data-slot="form-page-footer"]',
  );
  await alignToTop(page, '[data-slot="form-loaded-sample"]');
  const loaded = await relativeBoxes(
    page,
    '[data-slot="form-loaded-sample"]',
    'h1, [data-slot="form-field"], [data-slot="input"], [data-slot="textarea"], [data-slot="form-page-footer"]',
  );
  expect(skeleton).toHaveLength(8);
  expectSameBoxes(skeleton, loaded);
  await expect(
    page.locator(
      '[data-slot="form-skeleton-sample"] [data-slot="form-page-footer"]',
    ),
  ).toHaveCSS('position', 'sticky');
});

test('the Team Lead row reserves the wrapped height of its long hint, on a phone and at the form width [S3.2a, G20]', async ({
  page,
}) => {
  await openGallery(page);
  await waitForSkeletons(page);
  await alignToTop(page, '[data-slot="team-lead-skeleton-sample"]');
  const skeleton = await relativeBoxes(
    page,
    '[data-slot="team-lead-skeleton-sample"]',
    '[data-slot="form-field-skeleton"], [data-slot="form-page-footer"]',
  );
  await alignToTop(page, '[data-slot="team-lead-loaded-sample"]');
  const loaded = await relativeBoxes(
    page,
    '[data-slot="team-lead-loaded-sample"]',
    '[data-slot="form-field"], [data-slot="form-page-footer"]',
  );
  expect(skeleton).toHaveLength(2);
  expectSameBoxes(skeleton, loaded);
});

/** Include intermediate wrapping thresholds, not only the standard screenshot widths. */
const PHONE_WIDTHS = [320, 360, 375, 380, 390, 600, 700] as const;

for (const variant of ['admin', 'recruiter'] as const) {
  for (const width of PHONE_WIDTHS) {
    test(`group «Умови» skeleton has the boxes of the real group and note (${variant}) at ${width} px [S3.2c, G20]`, async ({
      page,
      isMobile,
    }) => {
      test.skip(
        !isMobile,
        'phone widths only; the desktop project is measured below',
      );
      await page.setViewportSize({ width, height: 844 });
      await expectConditionsTwins(page, variant);
    });
  }
  test(`group «Умови» skeleton has the boxes of the real group and note (${variant}) at the project width [S3.2c, G20]`, async ({
    page,
  }) => {
    await expectConditionsTwins(page, variant);
  });
}

for (const width of PHONE_WIDTHS) {
  test(`the Team Lead hint reserves its wrapped height at ${width} px [S3.2a, G20]`, async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'phone widths only');
    await page.setViewportSize({ width, height: 844 });
    await openGallery(page);
    await waitForSkeletons(page);
    await alignToTop(page, '[data-slot="team-lead-skeleton-sample"]');
    const skeleton = await relativeBoxes(
      page,
      '[data-slot="team-lead-skeleton-sample"]',
      '[data-slot="form-field-skeleton"], [data-slot="form-page-footer"]',
    );
    await alignToTop(page, '[data-slot="team-lead-loaded-sample"]');
    const loaded = await relativeBoxes(
      page,
      '[data-slot="team-lead-loaded-sample"]',
      '[data-slot="form-field"], [data-slot="form-page-footer"]',
    );
    expectSameBoxes(skeleton, loaded);
  });
}

async function expectEditRowTwins(page: Page) {
  await openGallery(page);
  await waitForSkeletons(page);
  // The footer's position is the height of everything above it, so one box check covers the wrapped hints of both fields.
  const selector =
    'h1, [data-slot="form-page-footer"], [data-slot="form-page-footer"] > *';
  const skeletonRoot = '[data-slot="edit-row-skeleton-sample"]';
  const loadedRoot = '[data-slot="edit-row-loaded-sample"]';
  await alignToTop(page, skeletonRoot);
  const skeleton = await relativeBoxes(page, skeletonRoot, selector);
  await alignToTop(page, loadedRoot);
  const loaded = await relativeBoxes(page, loadedRoot, selector);
  expect(skeleton).toHaveLength(5);
  expectSameBoxes(skeleton, loaded);
}

for (const width of PHONE_WIDTHS) {
  test(`the locked vertical and position row reserve the wrapped height of their hints at ${width} px [S3.3, G20]`, async ({
    page,
    isMobile,
  }) => {
    test.skip(
      !isMobile,
      'phone widths only; the desktop project is measured below',
    );
    await page.setViewportSize({ width, height: 844 });
    await expectEditRowTwins(page);
  });
}

test('the locked vertical and position row reserve the wrapped height of their hints at the project width [S3.3, G20]', async ({
  page,
}) => {
  await expectEditRowTwins(page);
});

async function expectEditFooterTwins(page: Page) {
  await openGallery(page);
  await waitForSkeletons(page);
  const selector =
    'h1, [data-slot="form-page-footer"], [data-slot="form-page-footer"] > *';
  const skeletonRoot = '[data-slot="edit-footer-skeleton-sample"]';
  const loadedRoot = '[data-slot="edit-footer-loaded-sample"]';
  await alignToTop(page, skeletonRoot);
  const skeleton = await relativeBoxes(page, skeletonRoot, selector);
  await alignToTop(page, loadedRoot);
  const loaded = await relativeBoxes(page, loadedRoot, selector);
  // heading, footer, «Скасувати», «Зберегти», «Опублікувати»
  expect(skeleton).toHaveLength(5);
  expectSameBoxes(skeleton, loaded);
}

for (const width of PHONE_WIDTHS) {
  test(`the edit footer skeleton has the boxes of the real buttons at ${width} px [S3.3, G20]`, async ({
    page,
    isMobile,
  }) => {
    test.skip(
      !isMobile,
      'phone widths only; the desktop project is measured below',
    );
    await page.setViewportSize({ width, height: 844 });
    await expectEditFooterTwins(page);
  });
}

test('the edit footer skeleton has the boxes of the real buttons at the project width [S3.3, G20]', async ({
  page,
}) => {
  await expectEditFooterTwins(page);
});

async function expectConditionsTwins(
  page: Page,
  variant: 'admin' | 'recruiter',
) {
  await openGallery(page);
  await waitForSkeletons(page);
  const skeletonRoot = `[data-slot="conditions-skeleton-${variant}"]`;
  const loadedRoot = `[data-slot="conditions-loaded-${variant}"]`;
  await alignToTop(page, skeletonRoot);
  const skeleton = await relativeBoxes(
    page,
    skeletonRoot,
    'h1, [data-slot="form-group-skeleton"], [data-slot="form-field-skeleton"], [data-slot="form-trio-skeleton"], [data-slot="form-note-skeleton"], [data-slot="form-page-footer"]',
  );
  await alignToTop(page, loadedRoot);
  const loaded = await relativeBoxes(
    page,
    loadedRoot,
    'h1, h2, [data-slot="form-field"], fieldset, [data-slot="form-note"], [data-slot="form-page-footer"]',
  );
  // heading, group bar, 4 fields, the salary fieldset with its 3 fields, probation field or read-only line, after-create note, footer
  expect(skeleton).toHaveLength(13);
  expectSameBoxes(skeleton, loaded);
  const hints = page.locator(
    `${skeletonRoot} [data-slot="form-hint-skeleton"]`,
  );
  await expect(hints).toHaveCount(3);
  for (const hint of await hints.all()) {
    await expect(hint).toHaveAttribute('aria-hidden', 'true');
    await expect(hint.locator('span')).toHaveCSS('visibility', 'hidden');
  }
}

test('skeletons show after 150 ms, never shimmer and never move content [UI-F9, G20]', async ({
  page,
}) => {
  await openGallery(page);
  await waitForSkeletons(page);
  const motion = await page.evaluate(() => {
    const roots = [
      ...document.querySelectorAll(
        '[data-slot="row-skeleton"], [data-slot="form-skeleton"]',
      ),
    ];
    const blocks = roots.flatMap((root) => [
      ...root.querySelectorAll('[data-slot="skeleton"]'),
    ]);
    return {
      roots: roots.map((root) => {
        const style = getComputedStyle(root);
        return { name: style.animationName, delay: style.animationDelay };
      }),
      shimmering: blocks.filter(
        (block) => getComputedStyle(block).animationName !== 'none',
      ).length,
      blocks: blocks.length,
    };
  });
  expect(motion.blocks).toBeGreaterThan(10);
  expect(motion.shimmering).toBe(0);
  for (const root of motion.roots) {
    expect(root.name).toBe('skeleton-appear');
    expect(root.delay).toBe('0.15s');
  }
  await expect(
    page.locator('[data-slot="row-skeleton"] > .sr-only'),
  ).toHaveText(messages.states.loading);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('skeletons still appear after the delay and stay static [UI-F9, G20]', async ({
    page,
  }) => {
    await openGallery(page);
    await waitForSkeletons(page);
    const animated = await page.evaluate(
      () =>
        [...document.querySelectorAll('[data-slot="skeleton"]')].filter(
          (block) => getComputedStyle(block).animationName !== 'none',
        ).length,
    );
    expect(animated).toBe(0);
  });
});

const titles = messages.devUi.pageFrame.previewTitles;
const card = (page: Page, id: string) =>
  page.locator(`[data-slot="preview-header-demo"][data-case="${id}"]`);

test('a long preview title clamps to three lines and keeps the full text in title [UI-F9, G17]', async ({
  page,
}) => {
  await openGallery(page);
  for (const [id, text] of [
    ['long', titles.long],
    ['max', titles.max],
  ] as const) {
    const heading = card(page, id).getByRole('heading', { level: 2 });
    await heading.scrollIntoViewIfNeeded();
    await expect(heading).toHaveAttribute('title', text);
    await expect(heading).toHaveText(text);
    const box = (await heading.boundingBox())!;
    expect(Math.abs(box.height - 3 * 28)).toBeLessThanOrEqual(TOLERANCE);
    expect(
      await heading.evaluate((node) => node.scrollHeight > node.clientHeight),
    ).toBe(true);
  }
  const short = card(page, 'normal').getByRole('heading', { level: 2 });
  await expect(short).toHaveAttribute('title', titles.normal);
  expect(
    Math.abs((await short.boundingBox())!.height - 28),
  ).toBeLessThanOrEqual(TOLERANCE);
});

test('an unbreakable title and HTML-like text never widen the card or the page [UI-F9, G17]', async ({
  page,
}) => {
  await openGallery(page);
  for (const id of ['unbreakable', 'markup', 'max']) {
    const heading = card(page, id).getByRole('heading', { level: 2 });
    await heading.scrollIntoViewIfNeeded();
    expect(
      await heading.evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
    expect(
      await card(page, id)
        .locator('[data-slot="card"]')
        .evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const markup = card(page, 'markup').getByRole('heading', { level: 2 });
  // The catalog quotes `<` so the ICU formatter keeps the tag text literal.
  await expect(markup).toHaveText(titles.markup.replaceAll("'<'", '<'));
  await expect(markup.locator('b')).toHaveCount(0);
});

test('actions follow [secondary, primary, menu] in tab order and exist only when passed [UI-F9, G17]', async ({
  page,
}) => {
  await openGallery(page);
  const normal = card(page, 'normal');
  const actions = normal.locator('[data-slot="detail-header-actions"]');
  await actions.scrollIntoViewIfNeeded();
  const buttons = actions.getByRole('button');
  await expect(buttons).toHaveText([t.previewEdit, t.publish, '']);
  await expect(buttons.nth(2)).toHaveAccessibleName(t.previewMenu);
  await buttons.nth(0).focus();
  await page.keyboard.press('Tab');
  await expect(buttons.nth(1)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(buttons.nth(2)).toBeFocused();
  await expect(
    card(page, 'plain').locator('[data-slot="detail-header-actions"]'),
  ).toHaveCount(0);
  await expect(card(page, 'plain').getByRole('button')).toHaveCount(0);
});

test('empty state shows its action only in the permitted variant [UI-F9, G20]', async ({
  page,
}) => {
  await openGallery(page);
  const withCta = page.locator('[data-slot="empty-with-cta"]');
  const without = page.locator('[data-slot="empty-without-cta"]');
  await withCta.scrollIntoViewIfNeeded();
  await expect(withCta.getByRole('button', { name: t.primary })).toBeVisible();
  await expect(without.getByRole('button')).toHaveCount(0);
  await expect(without.getByText(t.emptyNoRightDescription)).toBeVisible();
});

for (const theme of ['light', 'dark'] as const) {
  test(`skeletons, preview headers and empty states pass axe in ${theme} [UI-F9]`, async ({
    page,
  }) => {
    await openGallery(page, theme);
    await waitForSkeletons(page);
    const audit = await new AxeBuilder({ page })
      .include('[data-slot="row-skeleton-sample"]')
      .include('[data-slot="row-loaded-sample"]')
      .include('[data-slot="form-skeleton-sample"]')
      .include('[data-slot="form-loaded-sample"]')
      .include('[data-slot^="conditions-"]')
      .include('[data-slot="preview-header-demo"]')
      .include('[data-slot="empty-with-cta"]')
      .include('[data-slot="empty-without-cta"]')
      .analyze();
    expect(
      audit.violations.filter((violation) =>
        ['serious', 'critical'].includes(violation.impact ?? ''),
      ),
    ).toEqual([]);
  });
}
