# S3.5 / S3.6 QA checkpoint ? 2026-11-17

Coordinator execution after the independent QA agent reached its usage limit. Final independent approval remains pending; this report does not mark S3 complete.

## Evidence

| Check                                           | Result                                                                                                                                                                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production build (includes lint and TypeScript) | Passed on final source.                                                                                                                                                                                                                     |
| Full Vitest                                     | 163 files / 4,163 passed.                                                                                                                                                                                                                   |
| Initial JavaScript                              | All routes pass 180 kB: vacancies 165.44; card 157.14; create 177.73; edit 177.95.                                                                                                                                                          |
| Main E2E                                        | 755 passed; one BUG-S3-14 failure (fixed later); 29 skipped; 160 dependent Admin cases did not run; separately passed 96 desktop then 64 mobile. BUG-S3-14 fixed afterwards (60/60 focused repeats); the one-shot full gate was not re-run. |
| New gallery cases                               | All 22 create/edit/draft/dialog cases passed inside the main run.                                                                                                                                                                           |
| Gallery                                         | 180 new PNGs; 522 Phase-2 PNGs; generation validates every image/link, and all Phase-2/latest bytes match.                                                                                                                                  |
| OpenAPI / Postman generation                    | 42 paths; regeneration produced identical SHA-256 hashes.                                                                                                                                                                                   |
| Full Newman API suite                           | 502 requests / 2,910 assertions, zero failures.                                                                                                                                                                                             |
| Secret / production dev-route check             | Passed.                                                                                                                                                                                                                                     |

## Findings and data hygiene

- BUG-S3-9 and detail-cache, internal-break and reconciliation-order findings are fixed with regressions.
- The gallery exposed a stale submit summary; corrected without removing field errors, including picker `setValue`.
- A snapshot helper compared unordered role rows. It now orders roles, sessions, events and audit rows by their stable primary keys; the final full Vitest run is green.
- Six drafts left by the first gallery test's missing JSON DELETE body (V-0942?V-0947) were identified by exact ids/title/creation time and soft-deleted through their authors' API. Current fixtures have a project prefix, scoped teardown and the required JSON body.
- BUG-S3-14 (fixed): a toast raised together with `router.refresh()` was lost. `Toaster` mounted its Sonner runtime through `React.lazy` + `Suspense`; the first toast and the forbidden/vertical-unavailable `router.refresh()` transition ran in the same tick, the retry of the lazy boundary vanished under the refresh transition, and no runtime or `<section>` ever mounted (trace: 403 POST, runtime chunks and the `?_rsc` refresh all 200, final DOM has no Sonner region). Reproduced without a full run: `vacancies-create-basics.spec.ts -g '403 answer' --repeat-each=30` on desktop and mobile failed 5/60 (all desktop) on the old code; with the `router.refresh()` removed 20/20 passed. Fix: `components/ui/sonner.tsx` loads the runtime with `import()` into state in an effect (no Suspense), handles the rejected chunk, keeps `LoadBoundary` for render errors. After the fix: 60/60 twice (desktop + mobile, 30 repeats each) and 20/20 earlier with the refresh removed. Unit tests: `tests/unit/ui/sonner-toaster.test.ts`, `sonner-toaster-failed-chunk.test.ts`. Touched specs pass per project (desktop 102 passed, mobile 72 passed); running desktop and mobile of the draft/edit specs together exceeds the 30 writes/min per-user limit (429 in setup, unrelated to toasts). Initial JS after the fix: create 177.77, edit 177.99, card 157.18 kB.
- BUG-S3-4: QA's 10 focus-before-hover repetitions passed; the stronger test ordering is retained, without claiming a tooltip source fix.
- One mobile row-menu edit test timed out in an earlier full run; it passed in the later full run. No source fix is claimed.
- Ten unrelated Phase-1 PNGs plus their latest copies changed during the suite and are intentionally excluded from this checkpoint for determinism triage. An inspected reactivation diff is confined to the background table (523 pixels); no Phase-1 product UI was changed.
- Physical-phone review, remaining wireframe section 10 captures and independent UX/code/performance verdicts remain open.

## Engineering self-check

Each line is scoped to the changed S3.5/S3.6 code; unchanged modules are not re-certified.

- **Checked.** Double press, Enter and Ctrl+Enter send exactly one request. A synchronous lock is set before the first `await`.
- **Checked.** A success keeps the form locked until navigation or unmount. Unlock only on failure.
- **N/A for close routes: neither route accepts a key; uncertain retries use body matching. Create/publish key behavior is unchanged.** A retry reuses the same Idempotency-Key. A changed body gets a new key.
- **Checked.** Every rejected promise is handled. No bare `void promise` without `.catch`.
- **Checked: caches and the global result toast survive row unmount; navigation is mounted-only (intentional S3.5 toast behavior).** A late success after unmount still updates the caches. Toast and navigation run only while mounted.
- **Checked.** Mutations invalidate the right query keys. Check with a test.
- **N/A: PATCH mapping is unchanged by S3.5/S3.6.** A patch or diff builder expresses every field state or refuses it with a field error. It never drops a changed field. A field that cannot be cleared (no `null`) is required in the form.
- **Checked: close errors retry with the same inline confirm; no new toast retry action.** A toast action repeats the action that failed, not a neighbour. Give the failure handler an explicit `retry` callback. A test asserts which request the button sends.
- **Checked.** A retry of a non-idempotent write that meets a conflict checks whether the earlier attempt already stored the change before it warns.
- **Checked.** A retry that adopts the stored result compares everything the user sees, not only the changed keys.
- **Checked.** A reconciliation read leaves the active cache unchanged until the normal completion path closes the dialog and arms focus; older detail requests cannot overwrite the successful mutation.
- **Checked.** The chunk can fail to load: offline, or deploy skew. The UI must not crash, hang or lose user input. Test it with the chunk blocked.
- **Checked.** Anything the server action depends on (response schema, validator) resolves **before** `fetch`. A chunk failure must stop the call before the server acts.
- **Checked.** No `React.lazy` on the main path without an error boundary. Prefer loading into state in an effect.
- **Checked.** A dependency-free fallback exists where the user needs feedback without the chunk.
- **Checked.** Every failure branch has a test: validation, 400 field errors, 403, 404, 409, 429, 5xx, network failure, key reuse.
- **Checked.** Pure helpers (mapping, planning, parsing) have table unit tests.
- **Checked.** E2E cleans up its own data in `afterEach`, scoped to its own project or prefix, so desktop and mobile runs do not collide.
- **Checked.** No reliance on real time of day, row order without a tie-breaker, or shared mutable seed data.
- **Checked.** Run `corepack pnpm build && corepack pnpm perf:size` **before** reporting. Report the kB for every touched route. 180 kB gz is a hard limit.
- **Checked.** A second form or screen with the same submit flow extracts the shared hook or buttons before it copies them (`useSubmitLifecycle`, `SubmitButtons`).
- **Checked.** Components stay under ~400 lines. Extract hooks (`useXxx`) and small components early.
- **Checked.** No second definition of the same rule (authz predicate, class string, schema). Share one helper.
- **Checked.** Copy with numbers uses ICU arguments from the shared constants, not hard-coded values.
- **N/A: no new skeleton layout; async action placeholders retain the existing dimensions.** A skeleton row matches the wrapped height of the real row, including long hint or helper text. Check at 390 px.
- **N/A: D122 assignment eligibility is unchanged.** A server eligibility rule (who may be assigned, who may hold a priority) has exactly one predicate. Picker, save and create use the same one.
- **Checked.** Role-specific field visibility is checked for allowed role combinations; a grant used elsewhere may not permit showing this field.
- **Checked.** Query keys come from the shared key factory. Do not hard-code arrays.
- **N/A: no new environment switch.** A test-only switch (for example `APP_ENV=test`) is refused at boot on Vercel. Pin it in the vitest project env, so that CI's job-level env cannot change what a test asserts.
- **Checked.** "Refused" tests assert the exact error code, not just any rejection.
- **N/A: cross-field resolver logic is unchanged.** Cross-field validation with a resolver: when field A changes, re-trigger the dependent field B if B currently shows an error.
- **Checked.** A client mirror of a server length rule (counter, readiness) uses `serverTextLength`, never `.length`.
- **N/A: no skeleton or footer width change.** Skeleton hint text and footer button widths are measured at 320, 360 and 390 px (real natural widths, not round Tailwind steps).
- **Checked.** A client rule that mirrors an exported server rule must call that function, not re-implement it. A stand-in for unparsable input is documented and tested per field combination.
- **Checked.** E2E assertions comparing a cached UI count with a live API count are baseline-relative (read before, expect before + 1).
- **Checked.** A list copied into a Zod-free module has one source: the schema imports it.
- **N/A: cancel/delete are pessimistic; publish rollback is unchanged.** An optimistic update's rollback undoes only its own change (this call's rows, its own count step, its card), never a whole-cache snapshot. Test two overlapping calls that both fail, in both orders.
- **N/A: no new optimistic write; publish sticky-update tests remain.** While an optimistic update is in flight, a refetch that returns the old server state does not undo it (sticky), and a settled call stops watching. Test with a fetch during the flight.
- **N/A: publishBlocker is unchanged.** A client rule that mirrors a contract only through a pinning test (`publishBlocker` against the PUBLISH schema): extending the rule means extending that test in the same change.
- **N/A: no new optimistic write.** Code between the optimistic write and the `try` that releases it is inside the `try` or covered by `finally { settle() }`; test with a throwing hook.
- **Checked.** Lazy own-feature UI (menus, actions) is gated by a synchronous predicate and loaded with `React.lazy` + `LoadBoundary` + `Suspense` (not `next/dynamic`, which costs more) behind a placeholder of the final size; the shared hook and toasts live in the lazy chunk.
- **Partial: production build includes lint/typechecking; full Vitest passed 4,163. Browser BUG-S3-14 remains open; see verification table.** lint, typecheck, unit and the touched integration and E2E files all pass. Report the commands and pass counts.
- **Checked.** Comments: one line, _why_ only. No stacked JSDoc.
- **Checked.** `tsconfig.json` and `screenshots/` are not changed by accident. There are no leftover temp folders such as `.next-*`.
- **Checked.** Only one Playwright, build or integration run at a time on this machine.

## Code quality (thermo-nuclear)

Scope: `git diff 42e41ac..6f2aa81 -- components lib server app` (47 files, +1,136/-256). Report only; the engineer fixes, `code-reviewer` confirms. No blocking structural regression. No new file passes 400 lines (largest: `use-draft-close.tsx` 266, `confirm-dialog.tsx` 225, `lib/vacancy-draft-close.ts` 219).

### Non-blocking, ranked

| #  | Finding | Judo move |
| -- | ------- | --------- |
| 1  | `use-draft-close.tsx`: an implicit retry state machine in six refs (`locked`, `unsure`, `attemptedReason`, `reconciliationAllowed`, `mounted`, `after`). `run` (lines 128-175) derives `retryingSameRequest` from three of them with a negative flag, then passes a derived boolean to `closeDraft`, which re-decides in `alreadyDone`. The decision lives half in the hook and half in `lib`. | Pure `lib` functions `planAttempt(state, kind, reason)` and `settle(state, outcome)` with a table test. The hook keeps `locked`, `mounted`, `after`. The double negation and three ref writes in `run` disappear. |
| 2  | The `stage: 'DRAFT' \| 'CANCELLED'` union is branched in five places: `draft-actions.tsx` (early return with a second hand-written Delete button), `draft-header-actions.tsx` (placeholder and fallback), `draft-menu.tsx`, `closeActions`, `vacancy-overview.tsx` (`draftPlan?.stage !== 'DRAFT'`). Menu builders (`closeActions`, `openCardAction`) sit in a hook module. `draft-actions.tsx` calls `useDraftPublish()` for a cancelled draft that can never publish. | Let `ownDraftActions` return the action list (`edit`, `publish`, `cancel`, `delete`, `openCard`) plus `publishBlocked`, and map ids to items once. Stage branching and the duplicate Delete button go away; menu and button row share one model. |
| 3  | `ConfirmDialog` grew to 225 lines with a flag matrix (`clampDescription`, `reason.countLength`, `DisabledReason alwaysVisible` + `reserveSpace`). `clampDescription` silently does nothing for a non-string description (the `title` attribute is set only when `typeof description === 'string'`). Three definitions of «the reason text»: `text.trim()` in the dialog, `normalizeReason` in the hook, `multilineReason` in the schema. | A `userText: string` prop (always clamped and titled) beside `description: ReactNode`. Pass the raw text to `onConfirm` and normalize once in the consumer, or give `ConfirmReason` a `normalize` next to `countLength`. |
| 4  | `DisabledReason` carries `alwaysVisible` next to `reserveSpace`: class strings fork in two branches (four combinations) inside one tree. | One `visibility: 'touch' \| 'always'` prop and one class map. |
| 5  | `form-error.tsx`: field links are `<a href="#id">` with `preventDefault` + `getElementById(id).focus()`. An anchor that never navigates is announced as a link and duplicates `focusField` in `use-field-summary.ts`. The label dedupe (three salary fields share one label) lives in the presentational `VacancyFormError`. | A link-styled `<button type="button">` that calls the shared `focusField`. Dedupe where `VACANCY_FIELD_LABEL_KEYS` is defined (group key), not in the view. |
| 6  | UI side effects in `lib`: `announceClosed` and `announceGone` call `toast` from `lib/vacancy-draft-close.ts`; `type Translate` is declared twice. `applyClosed` invalidates `vacanciesAll` twice and `refreshDraft` is fired with bare `void` at three call sites (`use-draft-close.tsx` 120, 173, 194) plus `void invalidateQueries` (`vacancy-draft-close.ts` 177). The self-check asks for no bare `void promise` without `.catch`. | Move toasts and the `Translate` type to the hook module (one exported type). Give `refreshDraft` an internal `.catch(() => undefined)`. |
| 7  | `window.setTimeout(flush, 600)` in `run`: a magic constant and a third entry point (with `onCloseAutoFocus` and the unmount cleanup) to the same idempotent continuation; the timer is not cleared on unmount. | Name the constant and clear it in the cleanup, or drop it and rely on the close event plus the unmount flush. |
| 8  | `components/ui/sonner.tsx`: `import('./sonner-runtime').then(..., () => undefined)` swallows a chunk failure with no retry and no fallback, so a failed chunk loses every result toast (publish, cancel, delete) with no feedback. The self-check requires a dependency-free fallback where the user needs feedback. | Retry on the next toast request and render a plain `role="status"` live region as the fallback. Add a failed-chunk test on the result path, not only on the Toaster. |
| 9  | `vacancies-list.tsx` and `row-skeleton.tsx` repeat the last-cell rule (`!canAuthorDrafts && 'hidden xl:table-cell'`, the `size-11 xl:hidden` placeholder) and `vacancies-table-head.tsx` the widths (`w-14 xl:w-28`); `menuColumn` is threaded through three components. | One shared `ACTIONS_CELL` / `ACTIONS_HEAD` helper next to `VacanciesTableHead`. |
| 10 | Server: `cancelReason` is assembled in two places (`cancelVacancyDraft` response and `getVacancyDetail` + `findCancelReason`). `server/services/vacancy-draft.ts` is 481 lines (+9 here; already over ~400) and holds patch, publish, cancel and delete. `hasRowMenu` is a pass-through over `ownDraftActions !== null`. | Extract cancel/delete to their own service file; one `withCancelReason(ctx, view)`; drop `hasRowMenu`. |
| 11 | Five small modules for one concept: `lib/reason-length.ts`, `reason-text.ts`, `schemas/reason.ts`, `schemas/vacancy-cancel.ts`, `visible-text.ts` (bundle-size split is justified, but `VACANCY_REASON_MAX` lives in `reason-length` while other limits live in `vacancy-limits`). `visible-text.ts` builds regexes from escaped string fragments, hard to audit. | Merge `reason-length` and `reason-text`; move the constant to `vacancy-limits`; write the classes as `\u{…}` literals with one comment per class (`visible-text.test.ts` already pins behaviour). |

### What is good

The pure pieces (`classifyCloseFailure`, `isUnsure`, `normalizeReason`, `multilineReason`, the `isPrivateDraft` twin pinned by a unit test) are small and table-testable. The server's author-only reason read is keyed on the caller (`findCancelReason` filters `actorId` and the event read scope) with no role shortcut. `cancelVacancySchema` left the form bundle without a behaviour change.

## S3.6 §10 captures and a11y flake (QA, 2026-11-17)

Owner rule applied: PNG only for new screens, dialogs and states. Light theme and desktop by default; mobile where the layout differs; dark once per new dialog. Worst case, 320 px and 200 % zoom are E2E assertions (`expectFitsViewport`: no sideways scroll, footer actions inside the viewport), no PNGs.

| §10 item | Evidence |
| -------- | -------- |
| Empty list with CTA (Head Recruiter, Recruiter) | Asserted (`vacancy-entry-screens.spec.ts`: two CTAs); same UI as the existing `32-admin-vacancies-empty`, no PNG. Gallery caption of that PNG corrected («з кнопкою»). |
| Empty list without CTA (TL, Head HR) | PNG `32-team-lead-vacancies-empty` (desktop light); Head HR asserted. |
| `/vacancies/new` denied (HR, Head HR, TL, Finance) | Asserted for all four (404 + no form); PNG `40-hr-vacancy-form-denied` (one per denial kind). |
| «Чернетки 0» | PNG `41-recruiter-…-drafts-empty` (desktop, mobile). |
| Count 50, disabled save, tooltip / touch helper | PNG `40-recruiter-…-draft-limit` (desktop tooltip, mobile helper). |
| Incomplete draft row, disabled publish tooltip / helper, mobile preview header actions | PNGs `incomplete-draft-menu` and `incomplete-draft-card` (desktop, mobile); the row is asserted. Mobile has no side preview; its header actions are the card header. |
| Preset single vertical | Asserted (`vertical.single` note, select disabled) and already visible in `40-*-empty`; no PNG. |
| Vertical-change note | PNG `40-admin-…-vertical-changed`. |
| Position list empty / Team Lead empty | PNG `40-recruiter-…-position-empty`; Team Lead empty asserted for Admin and Head Recruiter. |
| Pending (create, publish), 409 inline alert, loading skeleton | PNGs `pending-create`, `loading`; pending-draft and the 409 alert asserted. |
| Leave guard (dialog and sheet) | PNG `40-recruiter-…-leave-guard` (desktop and mobile, light and dark). |
| Edit: loading, not-draft, 404, publish refused | PNGs `edit-loading`, `edit-not-draft`, `publish-refused` (desktop, mobile); 404 asserted (status 404 + not-found heading). |
| Toasts | PNG `toast-published` (desktop, mobile: sits above the sticky CTA, which answers UX issue 1); draft saved, created, cancelled, deleted asserted by text (stubbed writes, fixed number V-0501). Rate-limited and stale toasts already capture the real viewport. |
| Worst case Admin: 200-char title, 80-char position, two Team Leads with one name, error summary, 320 px, 200 % zoom | Assertions in `vacancy-form-worst-screens.spec.ts` (publish errors, draft-limit alert and leave guard at 320 px and 720 px layout width) and in the cancel dialog (`cancel-long-title`: buttons inside 320 x 568 and 720 x 450). Existing 320 PNGs kept. |

New PNGs: 14 stems, 24 files in `screenshots/phase-2` (copies in `latest`). Gallery registered in `scripts/screenshot-gallery.mjs`; `screenshots/phase-2/index.html` and `latest/index.html` regenerated. Phase-1 files untouched.

Gap: none needing product code. «Limit» toast has no separate state: the draft limit is the inline alert and the disabled save.

### Flake: `scrollable-region-focusable` on the preview card

Cause: the preview `Card` (`sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto`) scrolls at 1440 x 900, and for a private draft its only focusable content is the lazily loaded action row (`Share` is hidden for private drafts). Until the chunk arrives the scrollable region has nothing focusable. It reproduced twice in two runs of the new toast spec before the fix. Fix in the tests: `previewActionsReady` waits for the «Редагувати» link in the preview before the scan (no sleeps). After the fix: 16/16 (8 repeats of the draft list test and of the draft-saved toast test). Product note (Low): give the scroll container `tabIndex={0}` with a label, or keep a focusable element in the placeholder; with a failed chunk the cancelled-draft preview (fallback `null`) has the same gap.

### Bugs and notes found

- BUG-S3-20 (Minor, `docs/bugs.md`): an open `decorative` tooltip leaves an unnamed `role="tooltip"` node (axe `aria-tooltip-name`). QA scans before the hover and captures with the tooltip open.
- Observed (test side, no bug filed): a press on `⋯` that lands before the menu chunk arrives opens nothing (1 in 6 mobile repeats). The new specs use `openMenu` (repeat the press until the item shows); the same pattern as the known row-menu flake in this report.
- Observed (test side): a toast that is leaving (after «Показати поля») fails `color-contrast` while it fades. The scan now waits for the toast to be gone.

### Commands and counts

| Command | Result |
| ------- | ------ |
| `corepack pnpm build` | passed (start of run) |
| `corepack pnpm perf:size` | all routes under 180 kB; edit 178.39, card 157.25, positions 162.61 |
| `corepack pnpm lint` | clean |
| `tsc --noEmit` | clean |
| E2E desktop (`vacancy-draft/form/form-worst/entry/toast` screens) | 63 passed, 1 skipped |
| E2E mobile (same five files) | 59 passed, 3 failed (toast fade contrast, fixed) then `vacancy-draft-screens` 23/23 and `vacancy-entry-screens` 8/8 green |
| Repeat run (desktop, 8 repeats of the two flake tests) | 16/16 |
