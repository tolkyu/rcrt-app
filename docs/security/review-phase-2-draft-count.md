# Security review: S3-pre `GET /api/v1/vacancies/drafts/count` [STORY-VAC-01-3 AC1, D92, D98, D110]

Verdict: **PASS. No Critical, High or Medium findings.** Integration file run: 10/10 green.

## Checks

| Area | Result | Evidence |
| --- | --- | --- |
| Count/existence oracle | None. The count is `vacancyReadWhere(ctx.auth, 'DRAFT')` = `status = DRAFT AND created_by = caller AND authored-in vertical`; no role arm, so Admin/Head Recruiter/other recruiters add nothing; another user's drafts never enter the result. The response is a bare integer of the caller's own rows. | server/authz/vacancy-scope.ts:61-76, server/services/vacancy.ts:106-114 |
| Status / deleted | `countVacancies` adds `deleted_at IS NULL`; the DRAFT arm excludes published, and cancelled-never-opened drafts (CANCELLED status). Count is asserted equal to the «Чернетки» list. | server/repositories/vacancy.ts:198-207, tests/integration/vacancies-draft-count.test.ts:51-105 |
| Role matrix | Admin, Head, Recruiter: own only. TL, HR, Head HR: 200 `{count:0}` without a query (`authorsAnywhere`). Finance, no role: 404 (`requirePermission vacancy.read`). Lost role / other vertical / now-HR / TL-only: 0 (D98). Admin without MFA: 401 `MFA_REQUIRED` (`requirePermission`, can.ts:262-269; Postman case). No token: 401. Deactivated and expired sessions: `loadAuthContext` throws 401 before the handler. | test lines 107-193; tests/postman/cases/vacancies.json (countOwnVacancyDrafts x4) |
| Caching | `defineRoute` sets `Cache-Control: private, no-store` on every success; middleware also sets it; route is `force-dynamic`. Query uses `background: true` (no idle-timer extension). | server/http/define-route.ts:246-252, middleware.ts:57 |
| Logs | Prefetch error log carries only `describeError` (name + sqlState/constraint), no ids, SQL, params or PII. Route log carries operationId/status/userId only. | app/(app)/vacancies/page.tsx:109-115, server/observability/logger.ts:31-43 |
| Rate limit | No per-route limit, consistent with the other GET routes (only `q` search and writes are limited). Query is a single indexed count (`vacancy_draft_author_idx`, pinned author). | server/services/vacancy.ts:90 |
| CSRF / input | GET, no params/query/body, Origin check in middleware and factory. Response validated by `vacancyDraftCountSchema`. | define-route.ts:204 |
| SSR hydration | Count is prefetched only when `authorsAnywhere`, set into a per-request `QueryClient`, dehydrated into that user's own HTML (key `['vacancies','draft-count']`); own data only. | page.tsx:59,104-116,124-129 |
| Tests | Allowed (author counts, create/delete/publish/cancel transitions, multi-vertical) and denied (7 foreign readers, TL/HR, Finance, no-role, role-loss x3) exist at service level; route level has Postman 401/404/MFA/0/own/deleted. | see above |

## Findings

| # | Sev | Finding | Fix |
| --- | --- | --- | --- |
| F1 | Low (consistency, not an oracle) | The other draft routes (`updateVacancyDraft`, publish, cancel) use `hideUnless: authorsAnywhere` (404 for non-authors); this route answers TL/HR/Head HR with 200 `{count:0}` by design (documented in the summary). The difference depends only on the caller's own roles, so it discloses nothing about any draft. | Accept; keep `{count:0}` (the UI hides the chip via `canAuthorDrafts` anyway). If uniformity is preferred, use `hideUnless: authorsAnywhere` and drop the service guard. |
| F2 | Info | No Postman case for a deactivated user or a role/vertical loss at HTTP level; covered by the generic `loadAuthContext` path and service tests. | Optional; no action required. |
| F3 | Info | Route-level `Cache-Control` is not asserted for this route (generic factory behaviour, tested elsewhere). | Optional: add `Cache-Control` assertion to `vacancy-draft-count-author.js`. |

No change to `docs/security/threat-model.md` needed: T-V01 / T-Z19 already cover draft existence disclosure and this route adds no new surface (own-count only).
