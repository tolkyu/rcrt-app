# Phase 2 — vacancy content gallery review (51–52)

Task: CONTENT-UX-REVIEW · VAC-08, SHOT-01..03, D125, D126. Reviewed against `docs/ux/wireframes/vacancy-content-edit.md`, ADR-020 and `design-system.md`. PNG names are relative to `screenshots/phase-2/`.

**Result:** 5 blocking findings, 2 design decisions, 12 Phase 7 polish items. No clipped Ukrainian text, wrong copy or role leak in the 30 states.

## Coverage

| Set            | States | PNGs opened |
| -------------- | ------ | ----------- |
| 51 recruiter   | 5      | 10          |
| 51 other roles | 4      | 8           |
| 52 recruiter   | 17     | 35          |
| 52 other roles | 4      | 8           |
| **Total**      | **30** | **61**      |

- Every state was opened on desktop and on mobile, normally desktop light + mobile dark. `editable` and `loaded` use desktop dark; `validation` has desktop dark + mobile light and dark.
- The other 59 PNGs were not opened. They are the opposite-theme twins of the same layouts.
- Roles: recruiter, team lead, head recruiter and admin get the edit entry. HR gets no entry, and the direct URL is read-only. Matches the wireframe.
- Evidence limit: no app run in this task. B1, B2 and B4 combine PNG geometry with source reading. Confirm each with the acceptance check listed.
- Known issues (a) form width, (b) «Очистити» after editor failure and (c) read-error heading are not repeated.

## Blocking findings

**B1. Active formatting is invisible (bug, UI-05).**

- PNG: `52-recruiter-vacancy-content-edit-loaded-desktop-dark.png`. The initial selection is inside the H2 «Про роль», so «Заголовок 2» has `aria-pressed="true"`, but it looks like every other button.
- Cause: `components/rich-text/rich-text-toolbar.tsx` sets `aria-pressed`; `components/ui/button.tsx` has no pressed style.
- Fix: on toolbar buttons add `aria-pressed:bg-primary-subtle aria-pressed:text-link`. Contrast from design system §1.3: 4.66:1 light, 4.68:1 dark.
- Check: with the cursor in an H2, the H2 button has the `--primary-subtle` background in both themes.

**B2. The save result can be off-screen (bug, VAC-08).**

- PNGs: `52-recruiter-vacancy-content-edit-saved-mobile-dark.png` (status at y≈1312), `52-recruiter-vacancy-content-edit-save-failed-mobile-dark.png` (alert at y≈204). The viewport is 844 px and Save is in the sticky footer.
- Effect: after a tap on Save, the user can see no result. A user in «Опис» misses «Зміни збережено»; a user in «Вимоги» misses the failure alert.
- Fix, status: move the existing `role="status"` node in `vacancy-content-edit-form.tsx` to the first child of the footer, with `empty:hidden max-md:basis-full! md:mr-auto md:self-center`.
- Fix, alerts: wrap `ContentAlerts` in a `scroll-mt-20` container. When a new stale, closed, forbidden or failure result appears, call `scrollIntoView({ block: 'start' })`. Do not move focus: `role="alert"` already announces it, and the phone keyboard stays stable. `fields` errors keep the current editor focus.
- Check: at 390×844, scroll to each end of the form, save, and assert the result is inside the viewport and not covered by the footer.

**B3. The editor boundary fails non-text contrast (UI-05, WCAG 1.4.11).**

- PNG: `52-recruiter-vacancy-content-edit-validation-mobile-light.png`. The box uses `--border` (1.2:1 light, 1.7:1 dark), which design system §1.3 forbids as the only control boundary. The invalid field also keeps the neutral border.
- Fix in `rich-text-editor-runtime.tsx`: wrapper `border-input` (3.68:1 light, 3.73:1 dark); add `border-error` when `control['aria-invalid']` is true.
- Check: default and invalid borders in both themes meet at least 3:1.

**B4. Rich-text links fail contrast in dark mode (UI-05, WCAG 1.4.3).**

- PNG: none. No fixture contains a link, which is also a gallery gap.
- Cause: `rich-text-view.tsx` and the editor use `text-primary` (`#5558EF`): 3.40:1 on `#111827`, 3.59:1 on `#0B1220`.
- Fix: use `text-link` on both surfaces (D2). Add one HTTPS link to the `DESCRIPTION` fixture in `tests/e2e/vacancy-content-screens.spec.ts`.
- Check: the re-captured dark card and editor show `#818CF8` links.

**B5. The real permission-lost state has no capture (access, SHOT-01).**

- PNG: `52-recruiter-vacancy-content-edit-permission-lost-mobile-dark.png`. It stubs PATCH 403 while GET still returns `canEditContent: true`, so the controls stay active.
- This is **not a product bug**: ADR-020 allows a deliberate retry when an independent grant remains. But the state the wireframe calls «hides edit controls and stops submission» is not shown.
- Fix: make the scenario return `canEditContent: false` from GET after the 403. Keep the current branch only if it gets its own name, `permission-retained`.
- Check: in the `false` branch, the unit test at `content-edit-form.test.ts:537` also asserts that both editors are non-editable, Save is `aria-disabled` and no second PATCH is sent.

## Decision 1 — toolbar

**One row of labelled icon buttons. Phone: five commands + «Більше». Desktop: all nine.**

| Measure             | Now    | Target |
| ------------------- | ------ | ------ |
| Phone toolbar       | 205 px | 53 px  |
| Phone toolbar, open | n/a    | 99 px  |
| Desktop toolbar     | 88 px  | 41 px  |
| Phone field box     | 447 px | 296 px |
| Desktop field box   | 422 px | 376 px |

**Controls**

- Phone (`useMobile`), in order: Напівжирний, Курсив, Заголовок 2, Маркований список, Посилання, Більше.
- Behind «Більше»: Заголовок 1, Заголовок 3, Нумерований список, Розрив рядка.
- Desktop, in order: `B I | H1 H2 H3 | UL OL | Break Link`, with 1 px `--border` separators. No overflow.
- Icons (lucide): `Bold`, `Italic`, `Heading1`, `Heading2`, `Heading3`, `List`, `ListOrdered`, `CornerDownLeft`, `Link2`, `Ellipsis`.

**Overflow**

- «Більше» is an inline disclosure: it opens a second toolbar row inside the same box. Do not use a menu or bottom sheet, because they move focus out of the editor and can close the phone keyboard.
- Keep `onMouseDown` `preventDefault` on every control, including «Більше», so the text selection survives.
- No animation (wireframe motion gate). The open state is local to each field and is not persisted.
- When a hidden format is active, «Більше» shows a 6 px `--brand` dot and uses the `moreActive` label.

**Size and layout**

- Phone grid: `grid grid-cols-[repeat(auto-fit,minmax(2.75rem,1fr))] gap-0.5 p-1`. Targets are 44 px high and about 56 px wide at 390 px. Six fit in one row at 320 px; at higher zoom they wrap, with no horizontal scroll.
- Desktop: `flex items-center gap-0.5 p-1`, buttons `size-8 pointer-coarse:size-11`. The row needs 337 px (445 px coarse) and has at least 470 px.
- Remove `min-h-[180px]` and `md:min-h-[88px]`.
- Field box: `flex min-h-74 flex-col md:min-h-94`. `EditorContent` and the ProseMirror root take `flex-1`, so the whole area below the toolbar accepts a tap.
- Use the same `min-h-74 md:min-h-94` in the loading and failure slots of `rich-text-editor.tsx` and in `ContentSkeleton`.
- Disabled toolbar: `aria-disabled:bg-transparent`, so it does not become nine grey chips.

**Keyboard and screen reader**

- Container: `role="toolbar"`, `aria-controls={editorId}`, `aria-label` from `richText.toolbarFor`, so the two toolbars have different names.
- One Tab stop per toolbar (roving `tabindex`). `←`/`→` move and wrap, `Home`/`End` jump, Tab goes to the editor. Hidden controls are not in the sequence.
- `Enter`/`Space` activate. Formatting returns focus to the editor. «Більше» keeps focus and sets `aria-expanded` + `aria-controls`.
- `Esc` inside an open overflow closes it and focuses «Більше». It never discards edits.
- Every icon button has `aria-label` from the existing `richText.*` keys. Toggles keep `aria-pressed`; «Посилання» adds `aria-haspopup="dialog"`.
- Use `aria-disabled` with the existing guard, so a locked toolbar stays discoverable.
- Focus: `focus-visible:-outline-offset-2`, so the ring is not hidden by a neighbouring button.
- Tooltips on hover and keyboard focus only (existing `Tooltip`), text equal to the label.

**New copy (`messages/uk.json`, `richText`)**

- `more`: «Більше форматування»
- `moreActive`: «Більше форматування, є застосоване»
- `toolbarFor`: «Форматування тексту: {field}»

## Decision 2 — editor typography

**The editor must match `RichTextView` exactly. Both use one shared class constant.**

| Element | Editor now     | Target (both surfaces)            |
| ------- | -------------- | --------------------------------- |
| H1      | 20/28, 600     | `text-heading-lg`                 |
| H2      | 18/28, **400** | `text-lg font-semibold`           |
| H3      | 16/24, 600     | `text-base font-semibold`         |
| Blocks  | **0** gap      | `space-y-3` (12 px)               |
| Lists   | **0** gap      | `space-y-2` (8 px), `pl-6`        |
| Links   | `text-primary` | `text-link`, `underline-offset-4` |

- Root cause: the editor sets H2 size without weight and has no block spacing. That is why «Про роль» looks like body text.
- Add `components/rich-text/rich-text-typography.ts` with descendant selectors for the table above, plus `text-foreground text-base leading-6 [overflow-wrap:anywhere]`, `[&_p]:min-h-6`, list markers and `whitespace-pre-wrap`.
- Apply it to the `RichTextView` root and the ProseMirror root. Remove the per-element typography classes from both.
- Keep the visual sizes of the read view. Only the link colour changes (B4).
- Check: for H1–H3, paragraph, list item and link, computed `font-size`, `font-weight`, `line-height`, `letter-spacing` and block gaps are equal in both surfaces.

## Phase 7 polish (D126)

- **P1** Skeleton is 27 px shorter than the loaded phone field (2 px on desktop). Closed by the D1 shared height.
- **P2** `51-recruiter-vacancy-content-card-loading-mobile-dark.png` → `editable`: the edit link adds a row and moves the card 52 px. Move the link to the «Опис і вимоги» heading row, after a wireframe update.
- **P3** Disabled «Очистити» is a filled grey chip. Use `aria-disabled:bg-transparent disabled:bg-transparent`.
- **P4** Phone targets below 44 px: error summary link (32 px), alert text link (about 20 px), editor retry (40 px).
- **P5** `52-recruiter-vacancy-content-edit-chunk-failed-*`: message and retry button touch. Add `mt-3` to the button.
- **P6** Desktop alerts with a button: text is top-aligned, button is not. Use `sm:items-center` in `FormAlert`.
- **P7** «Очистити» text starts 12 px right of the field edge. Add `-ml-3`.
- **P8** Disabled «Зберегти зміни» has no reason tooltip, which the role-aware UI rule requires. Add «Немає змін для збереження» for the pristine state.
- **P9** A document H1 creates a second page `h1`, and document levels ignore the surrounding outline. Render levels with an offset and keep the visual style.
- **P10** `FormPageHeading` subtitle lacks `[overflow-wrap:anywhere]`, and the gallery has no long-title content capture. Fix and add one 390 px state.
- **P11** Shared form footer: desktop buttons sit flush with the band edge; on a phone a 48 px gap appears under it at scroll end.
- **P12** `text-lg` (H2, 18/28) is not in design system §2. Document it as the rich-text H2 size; do not add a new visual size.

## Next action

Engineer fixes B1–B5 and implements D1 + D2 in one slice with the known (a)–(c) fixes. QA re-captures all 51–52 states. UX re-checks the changed PNGs, including the 390 px open-overflow state and a dark link state.

## Re-check (CONTENT-UX-RECHECK, 2026-11-24)

Owner rule replaces the severity labels above: every UI finding is `must fix` before merge, with no Phase 7 deferral.

**Coverage:** all 34 content states on desktop and mobile, with light and dark sampled (62 PNGs); 12 form PNGs from sets 40–41; 1 list PNG (30); 14 draft PNGs (5 HEAD, 9 new). No shell was available, so `git show` was not run. Footer checks use the current PNGs, `form-page-frame.tsx` and `vacancy-content-ui.spec.ts`. The draft comparison uses the HEAD versions QA restored.

**Earlier findings**

- **Pass:** (a) width 720, (b) Clear after chunk failure, (c) read-error heading and back link, B1, B3, B4, B5 (`permission-lost` and `permission-retained`), D2, P1–P7, P9, P10, P12.
- **Fail:** B2 (M7), D1 (M3, M4), P8 (M1), P11 (M2). The rest of each item passes: save status is visible in the footer, the toolbar geometry and open «Більше» row match D1, the desktop inset is 16 px, and the phone footer has no gap at scroll end.

### Must fix

**M1. Save hint contradicts the result.**

- PNGs: `52-recruiter-vacancy-content-edit-saved-mobile-light.png` shows «Зміни збережено» with «Немає змін для збереження»; `52-recruiter-vacancy-content-edit-chunk-failed-mobile-light.png` gives the same hint when the real blocker is the editor.
- Fix in `vacancy-content-edit-form.tsx`: `const pristine = !edit.dirty && !edit.pending && !edit.stale && !block && edit.feedback.kind === 'idle' && CONTENT_FIELDS.every((field) => edit.ready[field]);`

**M2. Sticky footer corners expose the content behind them.**

- PNGs: `40-recruiter-vacancy-form-leave-guard-desktop-light.png` (text fragment at x≈268, y≈895), `52-recruiter-vacancy-content-edit-stale-dialog-desktop-dark.png` (editor borders below the footer corners).
- Fix in `components/ui/form-page-frame.tsx`: remove `md:rounded-b-xl`.

**M3. «Більше» stays active in a locked toolbar.**

- PNGs: `52-recruiter-vacancy-content-edit-permission-lost-mobile-light.png`, `52-recruiter-vacancy-content-edit-filled-mobile-light.png`, `52-recruiter-vacancy-content-edit-saving-mobile-light.png`.
- Fix in `rich-text-toolbar.tsx`: set `aria-disabled={(disabled && !moreOpen) || undefined}` and return early from `onClick` under the same condition, so an already open row can still close.

**M4. Phone toolbar targets shrink below 44 px under zoom.**

- Source: `rich-text-toolbar.tsx` uses fixed `grid-cols-6`, so targets narrow below 320 CSS px. This supersedes the D1 class: `auto-fit` alone would put seven buttons in the first row when «Більше» is open at 390 px.
- Fix: `grid grid-cols-[repeat(auto-fit,minmax(2.75rem,1fr))] gap-0.5 min-[320px]:grid-cols-6`.

**M5. List row actions are off-screen beside the preview at 1440 px.**

- PNGs: `30-head-recruiter-vacancies-list-desktop-light.png` (status chips clipped, no row actions), `C:\Users\prwdi\AppData\Local\Temp\claude\be9c9496c93fb32c\253b8ada-b6ce-473a-891a-f8c26f4f9bb0\scratchpad\out-of-scope-41\41-recruiter-vacancy-form-draft-menu-desktop-light.png` (opening the menu scrolls the title out of view).
- Cause: column minimums need at least 784 px before actions; the table has 776 px.
- Fix in `vacancies-table-head.tsx`, `vacancies-list.tsx` and `row-skeleton.tsx`: hide «Вертикаль» with `xl:max-[1599px]:hidden` (the preview still shows it); change «Відкрито» to `xl:max-[1719px]:hidden`; add `xl:max-2xl:min-w-48` to the title column.
- Keep actions reachable from 1280 px: actions `td` gets `sticky right-0 bg-inherit`, its `th` gets `sticky right-0 bg-surface`, and the default row gets `bg-surface`.

**M6. Preview «⋯» wraps alone onto its own row.**

- PNG: `30-head-recruiter-vacancies-list-desktop-light.png`.
- Fix in `vacancy-overview.tsx`: when `preview` is true, render «Поділитися» as a `size-11 p-0` icon button with `aria-label={t('share')}` and the existing `Tooltip`. The row then needs about 260 px of the 310 px available.

**M7. Alert scroll on save has no runtime proof.**

- Source: `vacancy-content-edit-form.tsx` scrolls to the alert, but no `vacancy-content*` E2E asserts it.
- Fix: in `vacancy-content-ui.spec.ts`, at 390×844, scroll to the form end, force a failed save, and assert with `toBeInViewport()` that the alert is visible and not under the footer.

### Draft shots (36)

- **Verdict:** the height change is an intended UI difference; HEAD PNGs are stale. It is not a capture artefact and not caused by the footer.
- **List and menu (+72 px):** the «Терміновість» filter row. They also gain the «Рекрутери» column and urgent red treatment.
- **Card (+47 to +71 px):** urgent banner and the current «Команда» block; the difference depends on whether a recruiter is assigned.
- **Accept 24:** all 18 mobile PNGs and the 6 desktop `draft-card` PNGs.
- **Do not accept 12:** desktop `draft-list` and `draft-menu` show defect M5. Recapture them after the fix.

## Final check (GALLERY-FINAL-UX, 2026-11-24)

**Pass:** M1, M2, M3, M4 (source), M5, M6, V3 #3, #4, #5, #6 (24 px under buttons in light and dark), #7, `50-admin-vacancy-status-step-up-mobile-light`. M7 is E2E only and was not checked here.

### Must fix

| #   | PNG                                                                                                     | Issue                                                                                                                                                | Fix                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | `30-admin-vacancies-list-desktop-{light,dark}`, `30-head-hr-…-dark`, `32-admin-…-preview-urgent-filled` | On a selected row the «Заповнена» chip loses its shape: the `brand` fill is the same as the selected-row fill (`bg-primary-subtle`).                 | `vacancy-badges.tsx`: `FILLED: { tone: 'brand', outline: true }`. This is the same reasoning as the urgency badge (`vacancies-list.md` §115).                                                                          |
| F2  | `30-team-lead-vacancies-list-desktop-*`, `-mobile-*`                                                    | The TL list shows the «Тімлід» column. Every row shows the viewer's own name. `vacancies-list.md:53` and `screens.md:106` say to hide it.            | Pass `showTeamLead={!teamLeadOnly}` from the page and hide the `th`, `td` and skeleton cell (`vacancies-table-head.tsx`, `vacancies-list.tsx`, `row-skeleton.tsx`). Hide the «Тімлід · …» line on the mobile card too. |
| F3  | `31-*`, `47-*`, `48-*`, `50-*` vs `40-*`, `52-*`                                                        | Back links differ. The card uses a bold ghost button with `ArrowLeft`. The forms and the content edit page use a muted text link with `ChevronLeft`. | `vacancy-detail-view.tsx` `BackLink`: use the `FormPageHeading` link (`ChevronLeft size-4`, muted `text-sm`, `min-h-11 md:min-h-9`). Better: extract one `BackLink` into `components/ui` and use it in both places.    |
| F4  | `31-recruiter-vacancy-detail-no-team-lead-*`, `41-admin-…-draft-list`                                   | Inconsistent empty copy: «Тімлід не призначений» next to «Рекрутера ще не призначено».                                                               | `messages/uk.json:301` `noTeamLead` → «Тімліда ще не призначено».                                                                                                                                                      |
| F5  | `41-recruiter-vacancy-form-cancel-long-title-320-mobile-*`, `-zoom200-*`                                | The reason box shows 450 «a» characters (fixture text in the UI).                                                                                    | `vacancy-draft-screens.spec.ts:398`: fill `'Перенесено найм до затвердження бюджету. '.repeat(12).slice(0, 450)`.                                                                                                      |
| F6  | `41-recruiter-vacancy-form-cancelled-card-*` and every draft PNG that uses `LONG_TITLE`                 | The title ends mid-word («…крос-пл»). The owner will read this as clipping.                                                                          | `vacancy-draft-screens.spec.ts:44`: cut at the last space at or before 200 characters (`s.slice(0, s.lastIndexOf(' ', 200)).trimEnd()`).                                                                               |

### No issue

- The `localhost:3100` URL in `47-…-clipboard-blocked` is the real origin in the test environment.
- «50 000» breaks across lines on 390 px cards. This is user-entered title text.
- The Admin step-up screen shows «Взяти вакансію» because the fixture user is Admin + Recruiter (spec line 607).
- The cancel and claim sheets have no ×. They are AlertDialogs, so the user must make an explicit choice.

### Out-of-scope PNGs

- **`32-*` (39): accept.** The committed PNGs are stale: no «Терміновість» filter, no «Рекрутери» column, no row actions, old «Команда». The new PNGs show the current UI. F1 applies to `preview-urgent-filled` and must be recaptured after the fix.
- **`41-*` (12): accept.** The only difference is the current «Команда» block and the list layout. Recapture `cancelled-card` after F4 and F6.
- **`49-…-claim-confirm` (1): accept.** The difference is 1 px of anti-aliasing.
