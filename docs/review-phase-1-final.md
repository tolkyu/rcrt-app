# Phase 1 closure — independent code review

Date: 2026-11-05. Scope: uncommitted Foundation closure changes, PRD ROLE-05, VIS-01..03, UI-05/06, PERF-02..05, SHOT-01..03 and C01–C10.

## Blocking

- None in the reviewed implementation. Final phase acceptance still requires the combined verification evidence below.

## Should fix

- None.

## Nit

- None.

## Reviewed behavior

- Permission declarations precede protected query/body parsing; malformed protected IDs use 404 parity. Existing services retain authorization checks. CSRF remains before identity and input handling.
- Profile server field errors survive optimistic rollback without a keyed form remount. New MFA recovery keeps the verification action inside an open modal and returns it to the page when the modal closes.
- MFA reset is lazy, requires a validated reason, shares the card-wide mutation lock, handles incomplete resets and preserves nested-dialog focus. Integration coverage remains authoritative for actual factor/session changes; browser mocks count intercepted requests.
- Audit detail adds parsed device metadata with collapsed raw UA, request-ID copying with a manual failure path, guarded links to built entity screens and responsive before/after layout. `j/k` is restricted to retained records, ignores modifier/editing input and never pages.
- The users list lazily switches to TanStack Virtual above 100 loaded records, renders only one responsive presentation, measures variable row heights, preserves a focused row and supports Arrow/Home/End navigation. Stale focused/pending indexes are guarded when background refetch shrinks the list. The 10k-record E2E covers bounded DOM, both keyboard extremes, drawer focus return, accessibility and shrink-refetch without a page error; fixture volume is a browser test, not a claim about the database seed.
- Audit now renders at most 100 actual data-row DOM elements, rather than retaining both responsive presentations. Existing bidirectional anchoring is retained. Native filters/paging controls wait for hydration so early input cannot be lost before React attaches handlers.
- Error-only MFA recovery and tablet/mobile overflow navigation are lazy. Tablet Escape restores the trigger; chunk failures retain the global full-reload recovery. User-menu accessible names include visible text; mobile audit buttons derive their name from visible contents. Contrast tokens and the decorative vector H address the actual automated accessibility findings.
- CI provisions disposable Supabase, seeds app/Auth, runs Newman and uploads results. Production dependency advisories fail closed; accepted tooling exceptions are scoped to exact GHSA/module/severity/dependency roots. Schema/secret/dev-route checks and read-only Auth drift tooling have focused coverage. Independent security review owns the security/database verdict.
- Native Playwright/CDP lab metrics can demonstrate Foundation budgets if reported accurately: scripted Event Timing is a lab interaction proxy, not field INP. Hosted/Frankfurt/large-volume and before-launch Lighthouse/telemetry checks remain explicit later-phase gates.

## Verification

- Reviewer ran focused Vitest on MFA recovery, profile rollback, dependency policy, device parsing and local Auth baseline. Four files passed; the two synchronous MFA assertions were corrected for the lazy component, and the orchestrator verified the MFA file 3/3.
- Earlier blocking findings are resolved in source: users virtualization, actual audit DOM bound and stale focused virtual indexes. Copy feedback is scoped per audit record.
- Orchestrator reports a fresh passing production build and initial-JS sizes users 165.55/audit 165.87 kB (all routes ≤180 kB). Isolated API P95 and desktop runtime gates pass; mobile/runtime final evidence is still being collected. These replace the failed initial build-size baseline.
- Root owns the required full lint, TypeScript, Vitest, production build, E2E, accessibility, Newman, deterministic gallery and performance runs to avoid concurrent build/server contention. Final combined results, screenshot visual approval and PROGRESS/HANDOFF updates remain phase acceptance gates; this code verdict does not assert they have already passed.

**Verdict: APPROVED** for the reviewed implementation. Do not mark Phase 1 complete until the final combined gates and documentation are recorded.

## Re-check — 2026-11-06

- **Blocking / Should fix / Nit: none in the reviewed code. Verdict: APPROVED.** Reviewed the Lighthouse harness and CI/package integration: fixed local routes, real Admin/TOTP session, explicit cold HTTP cache, finite numeric/error/redirect checks, unchanged hard budgets, diagnostic-only TBT, compact artifacts and unconditional profile-cleanup attempts.
- Approved the test-only audit JSON/not-found screenshot fix. Exact `/api/v1/audit` interception uses the existing typed `SHOT_ROWS`; row-count/first-ID waits replace the live backdrop before capture. Detail/404 routing, JSON visibility, axe, not-found and close assertions remain intact. No assertion was weakened.
- Inspected fresh logs: Vitest **2,293 passed**, default-order E2E **228 passed + one existing mobile hover skip**, native production runtime **5/5 passed**. The updated performance report matches `foundation.json` dated `2026-11-06T07:50:28.339Z` and distinguishes lab interaction from field INP.
- Orchestrator/QA report passing lint, TypeScript, production build, all initial-JS routes ≤180 kB, source formatting, schema/security/Storage checks, zero production and 48 reviewed tooling advisories; screens **52/52**, corrected dialog spec **2/2 twice**, Newman **289 requests / 1,679 assertions**, byte-stable contracts and **278** repeat-stable gallery images with matching phase/latest copies. Suite execution remains centralized with the orchestrator; this reviewer did not rerun it.
- Inspected the completed Lighthouse log and `tests/perf/results/lighthouse/summary.json` dated `2026-11-06T08:00:00.048Z`: **10/10 passed**, all five routes on desktop/mobile, three samples each. Highest route-median LCP is **521.69 ms desktop / 1,190.56 ms mobile**, with median CLS **0** throughout. All entries pass the existing budgets; TBT remains a recorded diagnostic.
- **Final local implementation verdict: APPROVED.** The previously pending Lighthouse measurement gate now passes. Final documentation formatting, reconciliation and reviewed commit remain the orchestrator's acceptance steps. No deployment, hosted-region, large-volume or field-INP approval is implied.
