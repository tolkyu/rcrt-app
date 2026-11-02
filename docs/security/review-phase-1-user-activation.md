# Security review — user deactivation and reactivation

Date: 2026-11-02. Scope: T6 slice 9, STORY-ROLE-05-5, ROLE-05/06, VIS-01..03, D23/D24/D42/D44/D45, SEC-AUTH-R04, SEC-ROL-02. Architecture: ADR-011. Reviewed the uncommitted working tree on `phase-1` (service, repository, routes, auth adapter, session/MFA services, error mapping, invite dialog, tests).

**Verdict: approved.** No Critical, High or Medium findings. SEC-ACT-01/02 are fixed. The remaining Low items are accepted residuals or non-blocking follow-ups.

## Findings

| ID | Severity | Evidence | Status / fix |
|---|---|---|---|
| SEC-ACT-01 | Low, availability | Provider ban/unban runs while the user lock is held, and for ADMIN deactivation the D45 advisory lock too (`server/services/user-activation.ts:71,75,139`) | **Fixed.** `server/auth/admin.ts:34-42,80`: `setBanned` uses a separate client whose `fetch` gets `AbortSignal.timeout(10_000)`, combined via `AbortSignal.any` with any caller signal. The signal covers both the request and reading the body. auth-js turns an abort into `AuthRetryableFetchError` → `{error}` without logging it → `false` → incomplete path. Locks are held for at most about 10 s plus the DB work. A ban the provider completes after the abort is safe: the app DB stays the access authority (see SEC-ACT-04). |
| SEC-ACT-02 | Low, maintainability | The old `revokeUserAccess(…,'DEACTIVATED')` could ban or revoke outside the lifecycle lock | **Fixed.** Replaced by `revokeMfaResetSessions(ctx,id)` (`server/services/auth/session.ts:242`). Its only caller is `mfa.ts:285`, and it has no ban or invite branch. Lifecycle code calls `revokeUserSessions` (`session.ts:256`) inside the caller's transaction. No caller of the old helper remains. |
| SEC-ACT-03 | Low, inherited | The route factory parses the body before `requirePermission`, so a malformed body from a non-Admin gets 400 instead of 404 | Open, tracked as SEC-ROL-01 / SEC-EML-02. No target data is read. A valid unauthorized request gets 404, and an Admin without aal2 gets `MFA_REQUIRED`. |
| SEC-ACT-04 | Low, residual | The provider call succeeds, then the local transaction fails (DB error or lost connection) | Accepted. Unban success + rollback: GoTrue is unbanned but the user stays inactive locally. Every sign-in and request is still refused (`recordAuthLogin` requires `is_active`, `repositories/auth.ts:37`; `loadAuthContext` returns 401 for inactive users). The `app` schema is not exposed to PostgREST (RLS on, PUBLIC revoked), so a GoTrue token alone reaches no data. Ban success + rollback: the user stays active but is locked out of new sign-ins. An Admin fixes it by running deactivate then reactivate, both idempotent. |
| SEC-ACT-05 | Low, test gap | No test exercises the adapter timeout. Integration tests use `FakeAuthServer`, and no unit test covers `createAuthAdmin` | Recommended, not blocking: add a unit test that mocks a never-resolving global `fetch` under fake timers and asserts `setBanned` → `false`. The real local-GoTrue ordering probe from ADR-011 §Tests was not run in this review. The provider-first ordering is covered against the fake (`settings-user-activation.test.ts:433`). |
| SEC-ACT-06 | Info | An Admin's request authorized before that Admin was deactivated can still finish if it was waiting on a lock (window ≤ lock wait) | Accepted. Same TOCTOU as every endpoint. The actor's next request returns 401, and audit rows identify the actor. |

## Claims verified

| Claim | Result | Evidence |
|---|---|---|
| Permission before lookup or provider call; 404 for unknown/malformed ids | Yes | `user-activation.ts:57-59,118-120`; `settings.users.manage` = global + MFA (`authz/permissions.ts:130`) |
| Lock order: pending invite → user (`NO KEY UPDATE`) → roles → advisory | Yes. Same order as role edit (`user-roles.ts:57-73`) and acceptance, so no per-user deadlock. The only cross-user lock is the advisory lock. `NO KEY UPDATE` keeps actor FK checks (`KEY SHARE`) non-blocking for Admins editing each other | `user-activation.ts:64-72,128-151`; `repositories/auth.ts:443-475` |
| D45: deactivation takes the membership lock before the other-Admin recheck; reactivation takes it when restoring ADMIN | Yes. `hasOtherActiveAdmin` counts only accepted, active holders. The reactivation lock is conservative (adding a holder cannot break D45) | `user-activation.ts:70-73,151`; `repositories/user-roles.ts:10-28` |
| Self-deactivation refused; never-activated → 409 | Yes | `:61`, `:69` |
| Provider call before Auth-row writes; no app trigger or FK on `auth.users` that GoTrue would wait on | Yes. No triggers on `auth.*`, and `app_user.auth_user_id` is unique only | `:75` before `:78`; migrations 0000–0008 |
| 503 thrown after commit; local denial + DENIED audit persist | Yes. The transaction returns `complete:false` and the error is thrown outside it | `:98-108`, `:139-148,179`; test `:433` (503 path) |
| Retry: current version only, no double bump, no duplicate event, closes provider sessions issued in the gap | Yes. When `isActive` is already false, the version is kept and events/audit are skipped. Sessions are still revoked and the ban re-sent | `:80-97`; test ("retry is idempotent", `late` session) |
| Reactivation: subset of previous roles only (incl. zero); fresh sign-in; never reopens an ended session | Yes. `roles_not_previous` is checked before any provider call. `revokeUserSessions` runs before `setUserActive` | `:130-136,152-156`; schema allows `[]` (`lib/schemas/auth.ts:54`) |
| Failed unban keeps inactivity and roles | Yes. Only the DENIED audit is written | `:139-148` |
| Concurrency tests (deactivation vs ADMIN removal, reactivation-ADMIN vs removal, deactivation vs role edit, deactivation vs acceptance, same-version double submit) | Present and green | `tests/integration/settings-user-activation.test.ts:547-800`. Run: **28/28 passed** (6.4 s) |
| Reason privacy | Yes. Trimmed, ≤ 500 characters, empty string omitted. Stored only in `audit_log.after` (the purgeable before/after field, SEC-CORE-07). `user.deactivated` event payload is `{}` strict; no `pii` side row. The timeline returns allowlisted fields only. Route logs carry requestId/operationId/status/ms/userId, never the body. Test asserts the reason is absent from events and the timeline API | `:95`; `server/events/index.ts:50`; `define-route.ts:66-73,211`; test `:305-372` |
| `details.userId` leak scope | Confined. The only 3-arg `ConflictError` is in `createInvite` after `requirePermission(settings.users.manage)` (Admin aal2), and only for `USER_DEACTIVATED`. Admins can already list all users, so nothing new is disclosed. `map-error` emits `details` only when it is non-empty | `services/auth/invite.ts:160,166-172`; `http/map-error.ts:34-36` |
| CSRF / strict body / no-store | Inherited from `defineRoute` (POST, strict Zod schemas) | `app/api/v1/users/[userId]/{deactivate,reactivate}/route.ts` |

## Residual notes

- D24 reassignment of open work is deferred to Phase 2–3 by the approved story. Phase 1 has no such objects.
- Purge (Phase 5/7) must also scrub the free-text `reason` in `audit_log.after` for `user.deactivated` (DG-20).

## Verification status

- **ADR-011 local-GoTrue ordering probe — PASS (2026-11-02, engineer).**
  - Setup: local Supabase (GoTrue at `:55321`, DB at `:55322`). One throwaway auth user, `adr011-probe-<uuid>@probe.invalid`, created with the admin API, plus a matching `app_user`. No demo account was touched.
  - Chosen order: an app-role (`app_rw`) transaction locked the `app_user` row (`FOR NO KEY UPDATE`) and its open `user_session` rows (`FOR UPDATE`). `admin.updateUserById(ban_duration)` then returned in 13 ms with no error. Ending the Auth sessions and committing worked, and `banned_until` was set. Unban under the same lock returned in 16 ms.
  - Rejected order, for contrast: Auth sessions deleted inside the open transaction before the ban call. It also returned in 17 ms, because this GoTrue version's ban does not touch `auth.sessions`. The provider-first order stays a precaution against GoTrue versions that revoke sessions on ban.
  - Cleanup: the Auth user was removed with `deleteUser`, the app rows and sessions deleted, and 0 probe rows remain. The script was a one-off and lives outside the repo.
