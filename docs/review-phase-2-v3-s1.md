# Review — Phase 2 V3 slice 1 (Foundation)

Scope: `git diff phase-2...v3-foundation` (fd47aa9, e175e45, 66ca8be). Spec: ADR-017, D130. Rules: D126.
Checks run: `corepack pnpm typecheck` green; Vitest on the 5 new unit files: 129 passed. Integration/E2E not run (by instruction).

**Verdict: APPROVED**

## Blocking

None.

## Engineer decisions

| #   | Decision                                               | Verdict                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `repeatOn` in table; table client-importable           | Accept. Matches `isRepeat` in the ADR (HOLD/ON_HOLD, RESUME/OPEN, REOPEN/OPEN; CANCEL none). File imports only a type from `lib/`.                                                                                                                                                                                                    |
| 2   | `statusActions` = `actionsFrom` + unscoped grant check | Accept. `server/authz/vacancy-status.ts:15-34`: Team Lead has only OWN hold/resume/cancel (`roles.ts:203-208`), `hasOwnGrant` needs `teamLeadId === caller`; `vacancy.reopen` is G/V only (`permissions.ts:52`), so TL cannot reopen; no FILLED action exists; DRAFT/CANCELLED are in no `from`, so empty.                            |
| 3   | `canSelfAssign` via `grantCovers`                      | Accept. `adminExcluded` in `roles.ts:21` drops `vacancy.self_assign` from Admin; Head Recruiter has no such grant. Status OPEN and zero recruiters checked in the helper.                                                                                                                                                             |
| 4   | `GRANT DELETE` to `app_rw`                             | Accept. CLAUDE.md §3.6 soft delete targets entities; ADR-012 table row (line 28) and ADR-017 line 30 both specify an audited hard delete of the assignment row, with history in `entity_event`/`audit_log`. Grant is table-level, runtime role only, rollback noted. FKs are `restrict`, so no cascade. Journal `when` is after 0015. |
| 5   | `vacancies.teamConflicts.*` copy                       | Accept. Four codes match ADR-017 line 83; wording is clear and Ukrainian.                                                                                                                                                                                                                                                             |

## Blast radius

- **What it does:** adds a pure status table, assignment/status authz helpers, four detail flags, three event schemas, a DELETE grant. Refactors `lockAuthors` (`server/services/vacancy.ts:~260-285`) and `hasBroadUpdate` (`vacancy-urgency.ts`).
- **The one fact it is safe because of:** both refactors are behaviour-preserving extractions.
  - `hasBroadUpdate` now equals `hasGrantCovering(ctx,'vacancy.update',v)`. The body is the same GLOBAL/VERTICAL and `verticalIds` predicate, moved verbatim (diff, `vacancy-assignment.ts:8-18`). Proof level 3 (line-by-line diff) plus the existing urgency unit tests, which still pass.
  - `eligibleIn(isEligibleTeamLeadRow)` keeps the same `locked.find` + `roles.some(userId, verticalId, predicate)` body that the old inline closure had; only the predicate is a parameter. The Team Lead predicate is still the single D122 `isEligibleTeamLeadRow`. Level 3.
- **Risks (low):** (a) the new `isEligibleRecruiter` and `eligibleRecruiterSql` have no consumer yet, so the SQL fragment and the row predicate are not yet tested against each other; add one test in slice 2 when the picker lands. (b) `statusActions` and the three flags differ per viewer; the engineer already excluded them from cross-role equality (66ca8be). Confirm `getVacancyDetail` cache keys are per user (they are, `queryKeys.vacancy` is hydrated per session).
- **Cleared:** event schema change is additive and optional, so old rows still parse; audit viewer falls back to «Інша дія»; migration has no schema/snapshot structural change beyond the grant; no list-scope change (`vacancy-scope.ts` untouched).
- **Before you merge:** run the integration `vacancies-detail-flags` file in the CI run.

## Non-blocking (Phase 7 debt)

1. `server/repositories/recruiter-eligibility.ts`: `eligibleRecruiterSql` is unused until slice 2 (dead code now); ensure slice 2 uses it or drop it.
2. `lib/schemas/vacancy.ts:19` imports from `server/domain/...`; works (pure file) but inverts the `lib` -> `server` direction. Consider moving the action const to `lib/` like `lib/vacancy-urgency.ts`.
3. `canSelfAssign` uses `grantCovers` (any scope kind) while sibling helpers use `hasGrantCovering`; a short comment on why would help, since a custom role with a broad self_assign grant would also pass.
4. `canSetTeamLead` comment cites D130-3; the ADR table says "Set Team Lead" only. Fine.
5. Check the term «Тімліда» matches the rest of `uk.json` (grep for «Тімлід»/«Team Lead» spelling) for consistency.

## Self-check line for `docs/engineering-self-check.md`

- When extracting a shared predicate (grant check, eligibility), add one test that calls the old public entry point with the same inputs, and make sure the new SQL fragment and row predicate are tested together in the same slice.
