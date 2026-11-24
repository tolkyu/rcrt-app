# Review — content terminal teardown

- Task: BUG-CONTENT-SESSION-01; 2026-11-21; `phase-2` at `b0e7c3e` plus existing dirty work.
- Scope: new guard handle/layout cleanup in `vacancy-content-edit-form.tsx` and terminal-denial/Cancel regressions in `content-edit-form.test.ts`. Other feature code retains its earlier review boundaries.
- Complexity: SIMPLE; risk: critical (session/access loss and router/history concurrency). Assigned code-reviewer responsibility at High; no nested agents.
- Contract: VAC-08; ADR-020 access loss and identity boundary. Only this report changed, under shared lease `codex-content-e2e-20261121`.

## Findings

- **Blocking:** none.
- **Should fix:** none within this scope.
- **Nit:** none raised.

## Correctness and lifecycle

- `components/vacancies/vacancy-content-edit-form.tsx:65–70,133` captures the existing imperative handle during layout setup and releases it during layout teardown. It does not depend on reading a ref after React clears it. The handle's `release` callback is stable (`components/ui/form-page-layout.tsx:76–77`, `components/ui/use-leave-guard.ts:135–139`).
- Release sets `armed` false, clears deferred rearming and removes listeners without changing history. The later passive cleanup therefore exits before `history.back()` (`use-leave-guard.ts:101–119`). Terminal render selection still removes editors immediately; this fix adds no intermediate render of cached documents (`vacancy-content-edit-form.tsx:247–252`).
- StrictMode layout replay was traced in the installed React implementation: child layout setup precedes parent setup; replay cleanup releases the captured handle and repeated release is harmless. The editor initially mounts clean; subsequent dirty changes do not rerun this empty-dependency layout effect. StrictMode execution of the composed form was not performed by this reviewer.
- Ordinary Cancel remains guarded while the editor is mounted. The new test exercises Cancel → stay → Cancel → confirm and requires exactly one `router.replace` with no write (`tests/unit/vacancies/content-edit-form.test.ts:333–356`). The cleanup does not execute on those ordinary rerenders; confirmed navigation already disarms the shared guard.
- The three terminal cases require an armed guard, dirty/Clear state, removal of editors/undo/dialog/cache, a refresh for 401 and zero history-back calls (`content-edit-form.test.ts:400–437`). They use the actual form/access/guard implementation; only network, router and editor adapter are mocked. This directly detects the competing history operation rather than merely asserting a mocked release call.
- No new casts, `any`, authz bypass, shared-hook API change, copy, layout or animation changes. Motion/worst-case rendering workflows are not applicable to this lifecycle-only fix.

## Blast radius

**Safety fact:** layout teardown disarms the exact mounted guard before its passive cleanup can initiate a history traversal. Source tracing establishes this path; the supplied failing-before/passing-after evidence supports it. This reviewer did not independently execute it.

The shared `useLeaveGuard` implementation and other form consumers are unchanged. The installed Next router's popstate handler dispatches restore actions, so removing this extra traversal addresses the identified competing-navigation cause. Existing normal dirty→clean behavior remains outside this narrow teardown change.

Cleared by inspection: stale/null imperative ref during deletion; repeated release; normal dirty rerenders; explicit Cancel/discard; terminal 403/404 removal without a discard question. The remaining runtime check is the actual 401 redirect after rebuilding the fixed source; unit router mocks cannot prove Next's final navigation.

## Validation and limits

- Inspected source, targeted assertions, related guard tests, installed React/Next lifecycle code, branch/HEAD/dirty scope and read-only lease status. No tests, builds, Playwright or browser automation were run, as assigned.
- Supplied engineer evidence: three regressions failed before with one unexpected `history.back()` call; **27/27 passed** after capturing the handle in layout setup. This is attributed evidence, not an independently reproduced pass.
- Supplied browser baseline: 401 received an RSC `NEXT_REDIRECT` but stayed on the skeleton before this fix. Post-fix rebuild/browser verification, final focused lint/typecheck/test evidence and remaining feature gates belong to the orchestrator; this report does not approve publishing or current-head CI.
- Suggested engineering self-check entry: “When forced access/session teardown unmounts a dirty form, release its existing guard before passive history cleanup; assert zero competing history traversal and verify the real router destination.”
- Model/tool baseline: assigned High reviewer, CLI/source inspection and one report edit; token/cost metrics unavailable; zero spawned agents, zero repair attempts.

Verdict: **APPROVED** for the focused source change. Finish the orchestrator-owned post-fix browser and validation gates before marking the bug complete.
