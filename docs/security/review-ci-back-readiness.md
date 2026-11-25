# CI-BACK-01 — Back/Forward readiness

Status: **APPROVED** by independent code/security review `ctx_9e438ecd0c1b`; hosted CI pending. VAC-08, VIS-02, ADR-020. Tests-only change at baseline `c91dbb0`; MEDIUM complexity, critical auth/navigation-test correctness risk.

The reviewer verified the exact list heading and the existing React-bound control hydration heuristic against the list/fallback and pinned Next popstate implementation. This does not prove every passive effect has completed or establish a rapid Back/Forward product guarantee. No original security assertion was removed or relaxed.

## Evidence and limits

- Hosted run `45511097872`: mobile `vacancies-denial-back.spec.ts:219` failed both attempts at the final denied-state visibility assertion (then line 233; about 5 seconds each). Initial denial/reload, Back URL, no-old-data poll and Forward card URL all passed. Protected structural context showed the list, despite the card URL. Desktop passed. The final post-Forward no-old-data assertion was not reached.
- The protected HTML artifact was decoded during the preceding read-only investigation with the pinned Playwright extractor. No protected fixture values or credentials are reproduced here.
- First unchanged local reproduction: **1/1 mobile PASS**, with existing sessions. This is not a local failing-before/passing-after reproduction of the hosted failure.
- Temporary boolean-only instrumentation sampled readiness immediately after the existing Back URL/no-old-data checks and before Forward. It recorded `listCommitted=false` and `listHydrated=false`, yet that diagnostic run passed. Thus the old checks demonstrably permitted Forward before the destination list was ready. An earlier diagnostic run passed too, but its console output was suppressed by the private reporter; the next probe wrote only these two booleans to ignored scratch storage.
- Pinned Next 15 app-router history traversal uses an effect-installed `popstate` listener and `startTransition`; URL readiness alone does not establish React readiness. Playwright Chromium disables the back-forward cache by default. A missed or overlapping restoration during hydration remains a causal hypothesis; event ordering at the hosted failure was not captured.
- Confidence: high that the test lacked a destination-readiness barrier; moderate that this exact gap caused the hosted URL/render mismatch. No old-data leak was demonstrated. These results do not establish that rapid user Back/Forward is free of product defects.
- PR #3's lifecycle helper change is independent by source: neither this spec nor its fixtures import it, and the product/navigation sources are unchanged from `633827b`. The positions mobile navigation failure is outside this slice.

## Change

After Back reaches the list URL, require its exact translated level-one heading and the existing `waitForHydration` helper before checking for old data and issuing Forward. Every original denial, reload-count, URL and no-old-data assertion remains. No timeout increase, retry, sleep, new skip, product change or temporary diagnostic remains in the diff.

## Validation

All browser commands used `CI=1`, `--no-deps --workers=1 --retries=0`, existing sessions, the prepared build and the coordinator's exclusive shared heavy-test lock. Desktop/mobile commands ran sequentially. Session setup was not needed or run.

| Check                                                           | Result                                   |
| --------------------------------------------------------------- | ---------------------------------------- |
| Unchanged target, request-mobile                                | 1 passed                                 |
| Temporary diagnostic target, request-mobile, console probe      | 1 passed; diagnostic output unavailable  |
| Temporary diagnostic target, request-mobile, boolean file probe | 1 passed; readiness false/false          |
| Fixed target, request-desktop                                   | 1 passed                                 |
| Fixed target, request-mobile                                    | 1 passed                                 |
| Whole denial spec, request-desktop                              | 15 passed                                |
| Whole denial spec, request-mobile                               | 12 passed, 3 existing desktop-only skips |
| `corepack pnpm exec tsc --noEmit --incremental false`           | PASS                                     |
| Focused ESLint, Prettier, `git diff --check`                    | PASS                                     |

Target command (substitute the desktop project for its sequential check):

```text
corepack pnpm exec playwright test tests/e2e/vacancies-denial-back.spec.ts:219 --project=e2e-request-mobile --no-deps --workers=1 --retries=0
```

Whole-spec commands use the same options without `:219`. Protected local logs are under ignored `.cache/ci-back-*.log`; no raw logs are published. Fixture finalizers ran as part of successful tests; no direct cleanup query, rate-limit deletion, session-value read or custom server operation was performed. Coordinator retains both locks and decides release.

## Self-check and handoff

- Checked: owned-file diff only; existing hydration helper reused; security assertions retained; no unhandled promise, cast, new comment, branching or abstraction introduced; diagnostics removed; TypeScript/lint/format checks and the entire affected denial spec passed.
- Code quality (thermo-nuclear): no blocking finding in this five-line readiness addition; no shared helper rewrite or file-size boundary crossed.
- Product mutation/cache/schema/UI/bundle-specific checklist items: n/a, tests-only readiness change. Product unit/integration, build, screenshots and unrelated screen suites were not rerun under the bounded assignment.
- One implementation attempt; zero failed repair attempts. Two diagnostic placements, with the second needed because private reporting suppressed console output. No new session-setup sign-ins, subagents, commits, pushes or lock release. Token/cost metrics unavailable; no savings claim.
- Remaining: independent code/security review and hosted CI. If the same mismatch recurs with this readiness barrier, investigate product router/history restoration under a separate assignment rather than adding retries or weakening the assertions.
