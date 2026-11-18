# Security review: `needsMfa` slice (D63, ADR-002)

Scope: `git diff phase-2...v3-needs-mfa` (3bf9d21), worktree `D:/recruiting-wt/v3-needs-mfa`. Read-only review. Unit run: `tests/unit/authz` + `tests/unit/vacancies/step-up.test.ts` = 10 files, 1612 tests, all pass.

**Verdict: PASS** (no Critical/High/Medium; 2 Low hardening notes).

## 1. `mfaWithheldGrants` (server/authz/context.ts)

| Check                                 | Result                                                                                                                                                                                                                                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Built from the same role rows         | PASS. One loop over the same `roles x permissions x scopes`; the only difference is `target = held ? withheldDrafts : drafts` (context.ts:104-119). Same legality, global/vertical and `needsAal2` filters apply first.                                                                                    |
| Cannot reach `can()` / scoped queries | PASS. `grep` shows the field read only in `server/authz/vacancy-mfa.ts` (and test fixtures). `hasGrantCovering`, `hasOwnGrant`, `requirePermission`, `vacancyReadWhere` and the scope builders read `ctx.grants` only. `mfaWithheld` (the Set used by `requirePermission` and `mfaRequired`) is unchanged. |
| Augmented context is local            | PASS. `afterStepUp` (vacancy-mfa.ts:11-17) copies the Map and each array (no mutation of `ctx.grants`), is called only inside `needsMfa`, and its result is never returned, stored or cached. `needsMfa` returns a boolean only.                                                                           |
| Serialisation                         | PASS. `/me` (`server/services/me.ts`) picks fields explicitly; the Map is not exposed.                                                                                                                                                                                                                     |

## 2. `needsMfa` DTO flag disclosure

- PASS. `readVacancy` computes it after `findVisibleVacancyOrThrow` (scoped read, 404 outside scope) (server/services/vacancy.ts:135-176). Inputs are only the viewer's own roles and facts of a vacancy they can already read, so it cannot confirm existence of an out-of-scope vacancy.
- It reveals only that the viewer's own Admin grant would add a control. The viewer holds that role, so nothing new is learned.
- A pure Admin at aal1 never reaches the DTO (read answers 401 `MFA_REQUIRED`); non-Admin roles get `false` (`mfaWithheldGrants.size === 0` short-circuit).
- Flag is also true for withheld vertical-scope MFA-flagged grants (`PERMISSIONS[p].mfa`), but only the three vacancy predicates are evaluated, so it is limited to team/status controls. Correct per ADR-002.
- Optional Low: the flag is in the OpenAPI DTO as required; fine, no PII.

## 3. Step-up link `/mfa/verify?next=` (components/vacancies/step-up-action.tsx)

PASS. The client builds `next` from `usePathname()` + `useSearchParams()` (same-origin path, `encodeURIComponent`), href is a fixed relative `/mfa/verify`. Server side validation does not depend on the client:

- verify page: `safeNextPath(next, '')` (app/(auth)/mfa/verify/page.tsx:20) before `redirect()` and before rendering the form;
- POST `/api/v1/auth/mfa/verify` result: `safeNextPath(input.next, '/')` (server/services/auth/mfa.ts:239);
- `safeNextPath` (server/auth/safe-redirect.ts) rejects non-`/` start, `//`, backslash, control chars, length > 512, dot-segment normalisation to `//`, foreign origin, and auth paths. No open redirect.

## 4. Tests

- Allowed + denied present: unit `tests/unit/authz/vacancy-mfa.test.ts` (Admin+Recruiter aal1 true, aal2 false, five non-Admin roles false, Head Recruiter of the vertical false, Head elsewhere true, DRAFT/CANCELLED false, FILLED true, TL variants); integration `vacancies-detail-flags.test.ts` (aal1 true, aal2 false, Admin+Head false, plain Recruiter false, cancelled false); UI `step-up.test.ts`.
- Low-1: no test that `mfaWithheldGrants` is not consulted by `can()`/scope builders. Suggest one `context` unit test: Admin at aal1 has `grants` without Admin permissions, `mfaWithheldGrants` populated, and `requirePermission(ctx, 'vacancy.assign_recruiters')` still throws. Guards against a future regression.
- Low-2: no integration case for a mixed-role user reading an out-of-scope vacancy (expects 404, no flag). Behaviour is correct by construction (flag computed after the scoped read); a test would lock it.

## Findings

| #   | Severity | Finding                                                                   | Fix                                               |
| --- | -------- | ------------------------------------------------------------------------- | ------------------------------------------------- |
| 1   | Low      | Missing regression test that withheld grants never authorise (section 4). | Add the context unit test.                        |
| 2   | Low      | Missing 404 test for mixed-role out-of-scope read.                        | Add one case in `vacancies-detail-flags.test.ts`. |
