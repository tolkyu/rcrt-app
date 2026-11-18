# Review V3 slice 2 — Assignment API (v3-assign)

Verdict: APPROVED. Typecheck clean; assignment-schema unit test 9/9. No integration/E2E run (out of scope).

## Blocking

None.

## Judgement of engineer decisions

| #   | Decision                                           | Verdict                                                                                                                                                                                                                                                                    |
| --- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 400 `invalid_recruiter`                            | OK (E1).                                                                                                                                                                                                                                                                   |
| 2   | Eligibility only for new ids                       | OK. Retry after deactivation stays a no-op; a new ineligible id still gives 400.                                                                                                                                                                                           |
| 3   | Last recruiter removed -> removed user may reclaim | OK. D130-2 says an OPEN vacancy with no recruiters returns to the unassigned pool; ADR-017 line 108 says the same. The "404" in the matrix contradicts both. Fix the matrix row in the ADR (docs). Release stays HR/Head-only; a reclaim is a normal claim and is audited. |
| 4   | Local `expectedVersion`                            | Non-blocking; dedupe with vacancy schema later.                                                                                                                                                                                                                            |
| 5   | Audit per added user, cumulative before/after      | OK. Ids only, no PII.                                                                                                                                                                                                                                                      |
| 6   | No guard on deletes from `vacancyRecruiter`        | Accept. Add a one-line grep test or self-check item later.                                                                                                                                                                                                                 |

## Should fix

- Fix the ADR-017 matrix row (decision 3) so it matches the errata.

## Nit

- `unassign`: non-uuid `userId` returns 404 while a valid unknown uuid returns 200 (E6 wording "any uuid"). No leak; align the OpenAPI summary.
- `unassignVacancyRecruiterQuerySchema` `z.coerce.number()` turns "" into 0 -> 400 via pipe; fine.

## Blast radius

Safe because scope is a live subquery over `vacancy_recruiter` (`vacancy-scope.ts`), so claim and remove change a Recruiter's list in the same commit; every write is under the vacancy lock with users locked first (no inversion), and version bump invalidates stale clients. ON_HOLD unassigned stays hidden because claim requires OPEN and UNASSIGNED_OPEN scope covers OPEN only. Risks beyond the diff: the D24/D43 deactivation guard shares lock order (not re-tested here); the UI slice must send `expectedVersion`.

## Self-check line

- Any endpoint that deletes rows feeding a live scope subquery: test list visibility before and after in the same test.
