# Pre-review self-check

Run this list before you hand work to QA or review. Every item comes from a review finding in Phase 2. For each item, write "checked" or "n/a + reason" in your report.

## Submit and mutation paths

- [ ] Double press, Enter and Ctrl+Enter send exactly one request. A synchronous lock is set before the first `await`.
- [ ] Third-party editor keymaps pass the form save shortcut through without changing document content; also test composing input.
- [ ] Navigating forms stay locked after success until navigation/unmount. Stay-on-page forms unlock only after adopting the canonical result and required refresh barriers; failures unlock for retry.
- [ ] A retry reuses the same Idempotency-Key. A changed body gets a new key.
- [ ] Every rejected promise is handled. No bare `void promise` without `.catch`.
- [ ] A late success after unmount still updates the caches. Toast and navigation run only while mounted.
- [ ] Mutations invalidate the right query keys. Check with a test.
- [ ] A patch or diff builder expresses every field state or refuses it with a field error. It never drops a changed field. A field that cannot be cleared (no `null`) is required in the form.
- [ ] A toast action repeats the action that failed, not a neighbour. Give the failure handler an explicit `retry` callback. A test asserts which request the button sends.
- [ ] A retry of a non-idempotent write that meets a conflict checks whether the earlier attempt already stored the change before it warns.
- [ ] A retry that adopts the stored result compares everything the user sees, not only the changed keys.
- [ ] A reconciliation read leaves the active cache unchanged until the normal completion path closes the dialog and arms focus; older detail requests cannot overwrite the successful mutation.

## Lazy code (`import()`, `next/dynamic`, `React.lazy`)

- [ ] The chunk can fail to load: offline, or deploy skew. The UI must not crash, hang or lose user input. Test it with the chunk blocked.
- [ ] Anything the server action depends on (response schema, validator) resolves **before** `fetch`. A chunk failure must stop the call before the server acts.
- [ ] No `React.lazy` on the main path without an error boundary. Prefer loading into state in an effect.
- [ ] A dependency-free fallback exists where the user needs feedback without the chunk.
- [ ] UI that must appear right after an action that also calls `router.refresh()` or navigates (toasts) does not rely on a Suspense retry of a lazy chunk. Load the chunk into state in an effect.

## Tests

- [ ] Every emitted audit action has a Ukrainian viewer label; include its action-scan/label test when checking affected files.
- [ ] Every failure branch has a test: validation, 400 field errors, 403, 404, 409, 429, 5xx, network failure, key reuse.
- [ ] Pure helpers (mapping, planning, parsing) have table unit tests.
- [ ] A controlled rich-text baseline change clears prior undo history; equal-document adoption preserves selection and ordinary renders retain history.
- [ ] E2E cleans up its own data in `afterEach`, scoped to its own project or prefix, so desktop and mobile runs do not collide.
- [ ] No reliance on real time of day, row order without a tie-breaker, or shared mutable seed data.

## Budget and structure

- [ ] Run `corepack pnpm build && corepack pnpm perf:size` **before** reporting. Report the kB for every touched route. 180 kB gz is a hard limit.
- [ ] A second form or screen with the same submit flow extracts the shared hook or buttons before it copies them (`useSubmitLifecycle`, `SubmitButtons`).
- [ ] Components stay under ~400 lines. Extract hooks (`useXxx`) and small components early.
- [ ] No second definition of the same rule (authz predicate, class string, schema). Share one helper.
- [ ] Copy with numbers uses ICU arguments from the shared constants, not hard-coded values.
- [ ] A skeleton row matches the wrapped height of the real row, including long hint or helper text. Check at 390 px.
- [ ] A server eligibility rule (who may be assigned, who may hold a priority) has exactly one predicate. Picker, save and create use the same one.
- [ ] Role-specific field visibility is checked for allowed role combinations; a grant used elsewhere may not permit showing this field.
- [ ] Query keys come from the shared key factory. Do not hard-code arrays.
- [ ] A test-only switch (for example `APP_ENV=test`) is refused at boot on Vercel. Pin it in the vitest project env, so that CI's job-level env cannot change what a test asserts.
- [ ] "Refused" tests assert the exact error code, not just any rejection.
- [ ] Cross-field validation with a resolver: when field A changes, re-trigger the dependent field B if B currently shows an error.
- [ ] A client mirror of a server length rule (counter, readiness) uses `serverTextLength`, never `.length`.
- [ ] Skeleton hint text and footer button widths are measured at 320, 360 and 390 px (real natural widths, not round Tailwind steps).
- [ ] A client rule that mirrors an exported server rule must call that function, not re-implement it. A stand-in for unparsable input is documented and tested per field combination.
- [ ] E2E assertions comparing a cached UI count with a live API count are baseline-relative (read before, expect before + 1).
- [ ] A list copied into a Zod-free module has one source: the schema imports it.
- [ ] An optimistic update's rollback undoes only its own change (this call's rows, its own count step, its card), never a whole-cache snapshot. Test two overlapping calls that both fail, in both orders.
- [ ] While an optimistic update is in flight, a refetch that returns the old server state does not undo it (sticky), and a settled call stops watching. Test with a fetch during the flight.
- [ ] A client rule that mirrors a contract only through a pinning test (`publishBlocker` against the PUBLISH schema): extending the rule means extending that test in the same change.
- [ ] Code between the optimistic write and the `try` that releases it is inside the `try` or covered by `finally { settle() }`; test with a throwing hook.
- [ ] Lazy own-feature UI (menus, actions) is gated by a synchronous predicate and loaded with `React.lazy` + `LoadBoundary` + `Suspense` (not `next/dynamic`, which costs more) behind a placeholder of the final size; the shared hook and toasts live in the lazy chunk.

## Rules check

- [ ] lint, typecheck, unit and the touched integration and E2E files all pass. Report the commands and pass counts.
- [ ] Comments: one line, _why_ only. No stacked JSDoc.
- [ ] `tsconfig.json` and `screenshots/` are not changed by accident. There are no leftover temp folders such as `.next-*`.
- [ ] Only one Playwright, build or integration run at a time on this machine.
- [ ] A Low or deferred security finding goes into the PROGRESS gap list in the same change. A shared-rule gap (e.g. `FORBIDDEN_CHARS`) is fixed once for every field that uses the rule.
- [ ] A UX fix that adds visible UI updates the wireframe/UX contract in the same change; grep `docs/ux/` for every stale mention of a renamed label. An allowlist guard stays narrow: a new reader goes in its own module.
- [ ] Before building, apply `.claude/skills/subtract-before-you-add/SKILL.md`: remove dead code, stubs and duplicate helpers in the area first; never remove PRD/security validation.
- [ ] Before hand-back, apply `.claude/skills/deslop/SKILL.md` and `.claude/skills/no-comments/SKILL.md` to your slice diff and rerun the touched checks.
- [ ] A validator written for a whole field value is not reused on fragments (rich-text nodes, split strings); context rules such as "refuse only when nothing else is visible" need a fragment-safe predicate.
- [ ] New/touched `.ts`/`.tsx` follow `.claude/skills/typescript-best-practices/SKILL.md` (no `as` without validation, discriminated unions over optional bags, exhaustive `never`, Zod/Drizzle-derived types).
- [ ] A bug fix follows `.claude/skills/tdd/SKILL.md`: failing-before test output quoted in the hand-back (or why no cheap test exists).
- [ ] A wrapper that strips or overrides a prop on a cloned child (e.g. `aria-describedby: undefined`) removes only what the wrapper added, or documents that it replaces the caller's value.
- [ ] Review rounds (D126): one round per slice. Only bugs, security, authz/data isolation, PII and PRD mismatches block; style/structure findings go to the Phase 7 tech-debt list in PROGRESS. Screenshots only at the end of a V-block.
- [ ] Token economy (D128, D129): run only the test files related to your change (`vitest run <files>`, one Playwright spec and one project); pipe long output through `tail -40`; never re-run a passing suite without a new change. At merge, validate only conflict-resolution test files, then let CI run the full suite (CLAUDE.md §6/D129); E2E, Newman, perf and screenshots at V-block end.
- [ ] A refactor that extracts a shared hook, helper or schema greps every consumer (`export *` chains included) and names them in the hand-back; a change to a shared invalidation list (e.g. `applyCreatedVacancy`) names each flow it affects.
- [ ] A flag or ref set by a key-scoped component (`key={id}`) is reset when the key changes, not only on unmount.
- [ ] A new viewer-dependent DTO field (`can*` flag) is checked against tests that compare one DTO across roles (`grep -rn "toEqual(baseline" tests/integration`); run those integration files.
- [ ] A shared predicate extracted from an existing check keeps a test of the old entry point with the same inputs; its SQL fragment and row predicate are tested together in the same slice.
- [ ] A deviation from a binding spec (ADR table, security pre-review) is recorded in that document (errata row) in the same slice.
- [ ] A delete that feeds a live scope subquery (e.g. `vacancy_recruiter`) has a list-visibility test before and after; a read helper shared by a caller-keyed and a scope-keyed path keeps the key required on the restricted wrapper, with a test pinning the restricted path.
- [ ] A new module that imports a guarded table or event reader (`vacancy`, `vacancyRecruiter`, `entity_event`) runs the architecture guards `tests/unit/authz/vacancy-author.test.ts` and adds itself to the allowlist with a reason.
- [ ] A date shown as "when it happened" but taken from `updatedAt` has a test or note proving nothing else writes the row after that event.
- [ ] A deferred action that waits for data re-checks that its menu/dialog was not dismissed before it runs.
- [ ] `corepack pnpm exec prettier --check` on every changed file, docs and generated JSON included (CI `format:check` covers the whole repo).
- [ ] A test that compares several DB rows in order (events, audit) has an explicit `orderBy` (e.g. `entityEvent.id`); Postgres row order differs between local and CI.
- [ ] A slice that changes a shared screen (list, card, preview, shell, forms) runs ALL E2E specs of that screen (`grep -l` the route/component name in `tests/e2e`), not only its new specs (owner 2026-11-18: ~20 pre-V3 specs broke unseen).
- [ ] A component that picks its variant with `useMobile` renders the desktop variant on the server; size both triggers the same or reserve the slot (no horizontal shift after hydration).
- [ ] Never `.catch(() => undefined)` on a server load: rethrow Next control-flow errors (redirect/notFound) and log the rest PII-free with `describeError`.
- [ ] A slice that adds a static import to a route runs `build` + `perf:size` for that route; heavy dialogs (`ConfirmDialog`) load via `React.lazy` + `LoadBoundary` (content/edit hit 181.35/180 kB).
