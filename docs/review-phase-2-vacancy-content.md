# Review — published vacancy content API

Task: REVIEW-VAC-CONTENT. Baseline: `bc8f061`; scoped working-tree review. Contract: VAC-08, D75/D78/D92/D93/D133 (Q-195), ADR-018. Assigned role: code-reviewer, critical High. Production/test fixes belong to the implementation engineer.

Status: **DONE**. Verdict: **APPROVED** — no blocking or should-fix findings. Final engineer evidence and generated-artifact synchronization are recorded below.

## Blocking

None.

## Should fix

None.

## Nit

- `tests/integration/vacancies-content-race.test.ts:72`: both content promises start before gate release, but the shared gate observes at least one blocked statement rather than both. The test proves one committed document/history pair and one stale loser; it does not prove both contenders were queued simultaneously. Deferred under D126. If this test is strengthened later, wait for two specific contenders at the vacancy lock before release; no production change is requested.

## Checks

- Strict document-only schema reuses the existing rich-text validator. Omission, NULL and whole-document replacement stay distinct. The old draft PATCH/service/schema are unchanged.
- New permission grants Recruiter ASSIGNED content edits only. Existing operational `vacancy.update`, status, assignment and probation grants remain unchanged; effective content authorization is the central permission union. Existing GLOBAL/MFA handling remains in force.
- Service reads visibility, locks/reloads the actor, locks vacancy documents, then loads assignments. Fresh permission authorization precedes status, version and no-op decisions. Changed documents alone reach compare-and-set; both write and no-op finish with a fresh scoped read inside the transaction.
- Events carry changed field codes only; audit before/after carry versions only. The shared audit scalar extension adds precisely `descriptionDoc` and `requirementsDoc`; existing PII-key and arbitrary camelCase rejection remain.
- Integration/race source covers permitted/denied roles, private/closed rows, canonical/no-op/stale behavior, history/PII, factory guards, assignment loss with another recruiter retained, independent TL permission, status/role/deactivation races, and history/fresh-scope rollback. Final engineer evidence relayed by orchestrator: content integration/race **2 files, 33 passed**; affected draft routes/lifecycle, urgency, assignment/races and status **6 files, 319 passed**; affected units **11 files, 1,667 passed**; typecheck, lint, scoped Prettier and diff-check passed.
- Authz documentation distinguishes new-action grants from effective endpoint union. Generated OpenAPI and its new contract tests keep the draft operation, exact narrow content fields, CSRF, errors and response fields. Postman adds an isolated assigned-Recruiter fixture and 16 content cases: replacement/no-op/stale/omission/clear, role/scope/session/MFA/CSRF denials, overposting/empty/HTML/UUID and closed state. Three custom scripts assert fixture status, response keys, version increments and documents; generated snapshots compare the whole no-op response.
- Source/generated fixture-title drift is resolved. Final file inspection confirms both titles equal `Тест API — content {{vacancy_run}}` and all 16 content cases remain present. Engineer regenerated OpenAPI/Postman after the final case edit and reported generated source consistency passing.

## Blast radius

**Safety fact:** adding assigned content permission does not grant Recruiter broader operational writes, and the audit schema accepts the two static field codes without accepting arbitrary camelCase content. Proof level 4: reviewer ran `corepack pnpm exec vitest run --project unit tests/unit/authz/vacancy-content.test.ts tests/unit/audit.test.ts` — **2 files, 24 tests passed**. These call the real authorization union and audit schema, including denied operational actions, withheld GLOBAL grants, mixed roles/verticals and invalid detail values.

**Cleared:** draft route unchanged; catalog/matrix change is additive; no database migration, list/read DTO, cache key, route bundle, event catalog, notification or audit-viewer change. Parent vacancy locking remains shared with assignment/status writers. Existing logger uses safe `describeError`; no request/content logging added.

**Limits:** PostgreSQL serialization/rollback and final validation execution evidence above comes from the engineer, relayed by the orchestrator; reviewer inspected the actual tests and artifacts and independently checked the final fixture-title synchronization. No integration/build/Playwright/typecheck/full suite was duplicated by the reviewer. Separate security and QA reviews remain orchestrator gates; Postman source/generated review does not claim a Newman runtime pass. Commit/push and current-head CI verification belong to the orchestrator.

## Self-check line

No new production mistake class found; no engineering self-check addition requested.
