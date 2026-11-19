# Security review — published vacancy content

- Task: SEC-VAC-CONTENT; 2026-11-18; baseline `bc8f061`, scoped working-tree review.
- Contract: VAC-08, D75/D78/D92/D93/D133; [ADR-018](../adr/018-vacancy-content-editing.md).
- Status: **PASS** — final production source reviewed; no security findings. Independent mixed-role service QA subsequently passed; see `docs/qa-phase-2-vacancy-content.md` for its runtime evidence.
- Ownership: this report only; no production changes or duplicate runtime suites.

## Findings

No Critical, High, Medium or Low security finding in the reviewed implementation.

## Verified controls

| Area                  | Evidence and result                                                                                                                                                                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Narrow grants         | `server/authz/permissions.ts:45`, `server/authz/roles.ts:96`, `server/authz/vacancy-content.ts:5`: Recruiter gets ASSIGNED content permission only; central `can()` union retains existing scoped update rights and GLOBAL MFA. No operational permission broadened.                                                 |
| IDOR/private drafts   | `server/services/vacancy-content.ts:31`: inherited scoped read precedes mutation. Finance, foreign scope and another author's draft remain hidden. Creator identity/pool visibility supplies no content permission.                                                                                                  |
| Fresh authorization   | `server/services/vacancy-content.ts:32`: actor lock/fresh roles, then parent vacancy lock with documents, then fresh recruiter IDs. Locked row/set supply `can()` facts; authorization precedes state/version/no-op. Existing assignment writers share the parent lock.                                              |
| D133/concurrency      | `server/services/vacancy-content.ts:53`: only OPEN/ON_HOLD; stale same-value requests fail. Compare-and-set uses locked status/version, increments once and changes only supplied, different documents.                                                                                                              |
| Validation/output     | `lib/schemas/vacancy-content.ts:5`: strict document-only schema, shared rich-text allowlist/limits/URL normalization, explicit NULL/omission/replacement semantics. Response is canonical document JSON; inherited factory supplies CSRF, session, streamed body limit and private/no-store. No HTML renderer added. |
| Atomic history/scope  | `server/services/vacancy-content.ts:88`, `server/services/vacancy-content.ts:105`: event/audit writes and final fresh scoped read share the transaction. Save and no-op both verify fresh visibility before returning.                                                                                               |
| PII minimization      | `server/services/vacancy-content.ts:96`: audit before/after contain versions, details contain changed field codes; event contains field codes only. No document text, URLs, content hashes or `entity_event_pii` write. Existing `describeError` omits validation input and DB messages; new code adds no logger.    |
| Shared audit boundary | `server/audit/index.ts:47`: exactly two static enum values added, `descriptionDoc` and `requirementsDoc`. Existing arbitrary camelCase rejection and PII-key checks remain; no free-text scalar added.                                                                                                               |

## Verification evidence

- Reviewed actual production diff, schema/authz/audit tests and integration/race test bodies.
- Final engineer results supplied by orchestrator: **11 affected unit files, 1,667 passed**; **2 content integration/race files, 33 passed**; **6 affected draft/lifecycle/urgency/assignment/status regression files, 319 passed**. Typecheck, lint, scoped formatting and diff checks passed. OpenAPI/Postman artifacts are synchronized, including the fixture-title correction; these artifact checks do not claim a Newman runtime run.
- Separate code reviewer independently ran content authorization plus audit tests: **24 passed**; recorded in [code review](../review-phase-2-vacancy-content.md).
- Deterministic database tests cover assignment loss with another recruiter retained, independent TL rights, status close, role/deactivation loss, competing content versions, failed audit rollback and final-scope rollback. Tests assert unchanged loser content/history. HTTP tests cover safe validation problems, CSRF, session revocation, MFA and streamed body size.
- Separate QA is adding `tests/integration/vacancies-content-qa.test.ts` for mixed Admin plus assigned Recruiter at aal1. Existing reviewed source uses only effective grants, so the withheld GLOBAL grant cannot bypass scope while the independent ASSIGNED grant remains effective. QA execution is pending independently; no security runtime result is claimed for that additional case.
- This security review ran no duplicate unit/integration/build/Playwright/typecheck suite. `git diff --check` passed; concurrent documentation CRLF notices only.

## Limits and later work

Approval applies only to the API content slice. No UI/renderer, custom-role persistence, candidate/PII files, full history reconstruction, purge implementation or release/CI approval is claimed. No new threat class: this slice exercises existing authorization-race, IDOR, overposting, XSS and history-PII threats. The shared threat model is unchanged under bounded report-only ownership.
