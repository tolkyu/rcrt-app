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
