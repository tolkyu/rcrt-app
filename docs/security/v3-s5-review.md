# Security review — V3 slice 5 (team UI), server-side touch points

Scope: `git diff phase-2...v3-team-ui` (worktree `D:/recruiting-wt/v3-team-ui`). Code read only; no tests run.

**Verdict: PASS** (no Critical/High/Medium). One Low test gap to close.

## 1. `selfAssignVerticals` and its data flow

| Check                                              | Result                                                                                                                                                                                                               |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Derived from the viewer only                       | Yes. `app/(app)/vacancies/page.tsx:137` passes `ctx.auth` to `server/authz/vacancy-assignment.ts:53`. It reads `grantedVerticals(ctx, 'vacancy.self_assign')` (`vacancy-author.ts:8`), which uses `ctx.grants` only. |
| Leaks other users' grants                          | No. The output is a list of the viewer's own vertical ids, or `'ALL'`.                                                                                                                                               |
| Leaks vertical ids the viewer cannot otherwise see | No. These are the viewer's own role-assignment verticals, which the viewer already sees in rows and filters.                                                                                                         |
| Admin excluded                                     | Yes. `roles.ts:23-26` removes `vacancy.self_assign` from Admin, so the result is `[]`.                                                                                                                               |
| aal1                                               | `needsAal2` in `context.ts` withholds GLOBAL and MFA-flagged grants, so no `'ALL'` is produced at aal1. Recruiter grants are vertical-scoped and unaffected.                                                         |
| Client trust                                       | Mirror only (UI affordance). `server/services/vacancy-assignment.ts:125-133` re-checks `grantCovers` and the status and recruiter rule under the vacancy lock. A forged prop gains nothing.                          |

**Finding L-1 (Low, test gap):** `selfAssignVerticals` has no direct unit test.

- `tests/unit/authz/vacancy-assignment.test.ts` covers `canSelfAssign` and the grant helpers.
- `tests/unit/vacancies/vacancy-team.test.ts` covers only the client-side `grantsClaim` and `canClaimRow`.
- Fix: add cases to `tests/unit/authz/vacancy-assignment.test.ts`:
  - Recruiter in one vertical returns `[v1]`.
  - Recruiter in two verticals returns both.
  - Admin at aal2 returns `[]`.
  - Admin at aal1 returns `[]`.
  - Head Recruiter and Team Lead return `[]`.
  - A user with no assignments returns `[]`.

## 2. Client cache patch (`lib/vacancy-team.ts`)

- `withTeam` copies only `recruiters` and `teamLead` from the server's write answer onto the matching row in `vacancies` list pages.
  - Both fields use the same `participant` schema in `vacancySummarySchema` and `vacancyDetailSchema` (`lib/schemas/vacancy.ts:70-89`), so no extra fields move into the list.
  - Detail-only fields are not copied.
  - The write answer is the response of a request the server authorised for this viewer, so it carries no other vertical's data.
  - Rows are matched by id only, so nothing is added to a list the viewer lacks.
- Scope-loss window: a claim gives the claimer ASSIGNED scope, so the row stays valid. A manager's removal does not change the manager's own scope. Every write calls `refreshVacancy` (`vacanciesAll` and `vacancy(id)` invalidation) right after the patch, and also on every failure except rate-limit and network. The window is a single refetch.
- The assignable-recruiters picker uses `gcTime: 0`, so it leaves no cached copy.

## 3. Secrets, XSS, logs

- No `dangerouslySetInnerHTML`, `console.*` or logger calls in the new `components/vacancies/*` or `lib/vacancy-*.ts`.
- No hard-coded secrets or URLs.
- Toasts carry the vacancy number and the names of the recruiters or Team Lead just assigned or removed. These are names the viewer already sees in the picker and list. No emails, salaries or ids.
- Request paths use `encodeURIComponent`.
