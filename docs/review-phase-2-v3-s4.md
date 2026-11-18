# Review: V3 slice 4, `PUT /vacancies/{id}/team-lead` (branch v3-teamlead)

Verdict: **APPROVED** (no blocking items). `corepack pnpm typecheck` in the worktree: green. Integration/E2E not run (as instructed).

## Blocking

None.

## Checked against ADR-017 / pre-review A4, 4.1-4.10

- Order: read scope (404) -> grant covering vertical (403) -> lock users -> grant recheck on fresh roles -> lock vacancy -> status (409 VACANCY_CLOSED) -> already set -> eligibility on fresh rows -> version -> guarded update (status+version) -> event + audit -> read. Matches ADR lock order (users before vacancy). DRAFT writes no audit (409 before any write).
- A4: race loser gets `TEAM_LEAD_ALREADY_SET`; no clear path (`teamLeadId` is `z.uuid()`, strict body).
- Same event + audit in the same transaction; no PII (ids only).

## Engineer decisions

1. 400 `invalid_team_lead`: accept. `vacancy.ts:337` and `vacancy-draft.ts:142` use the same 400 `ValidationError`; there is no 422 class. Pre-review 4.5 / A3 says 422 and the ADR says 422, so update the ADR and test matrix text to 400 (docs only).
2. Same TL again -> 200 before the version check: accept. Pre-review 4.3 says "same user again 200 no-op". It runs after the status check, so a closed vacancy still returns 409. It does not run after eligibility: a same-TL repeat succeeds even if that TL has since lost eligibility. Harmless (no write), but state it in the ADR.
3. Own DRAFT -> 409 VACANCY_CLOSED: accept (pre-review 4.6 requires it). The copy is slightly off: non-blocking, tracked below.
4. TL role -> 403 on the whole route: accept. It matches pre-review 4.1 (TL 403, also on its own vacancy; Finance 404 via `vacancy.read`). Other routes (urgency, cancel, publish) gate the same way with `requireGrant` and a service-level `hasAnyGrant` -> 403. The 403 is decided from role alone, before any vacancy lookup, so it reveals nothing about a specific vacancy. Out-of-scope or unreadable vacancies for a grant holder are 404 (readVacancy before the per-vertical 403).
5. Fixtures not cleaned up: accept, same as the urgency tests.

## Blast radius: `export const expectedVersion` (lib/schemas/vacancy.ts:257)

- Fact the change is safe because of: only the `export` keyword was added; the schema value and `.meta()` description are unchanged, so every existing user (`vacancy.ts:264`, `:282`) behaves identically.
- Proof: typecheck green. Grep shows the other `expectedVersion` hits are separate inline schemas (user.ts, position.ts) or client query args, not the symbol.
- Risk beyond the diff: the `.meta()` object is now shared by reference across schemas. Zod 4 attaches meta by schema instance in the global registry, so the OpenAPI generator sees the same description for each use, and none has its own `id`. Low. Check that `pnpm api:openapi` output for existing bodies is unchanged (spot-check, not run here).

## Non-blocking

- `server/services/vacancy-team-lead-set.ts:34`: `Record`-free and fine, but `row.version !== expectedVersion` runs after eligibility. A stale caller with an ineligible TL gets 400, not 409 (matches the ADR "real reason first" comment). OK.
- Copy for DRAFT 409 «Вакансію вже закрито»: add a dedicated message or reword to «Вакансія не опублікована або закрита» in `messages/uk.json` when the UI slice uses it.
- `route.ts` summary and the schema description are long and duplicate each other; keep one.
- Fixtures cleanup for the race test (decision 5) stays open; low value.
- Docs: change ADR-017 "422" to "400" for `invalid_team_lead`.

## Self-check line for `docs/engineering-self-check.md`

- When code deviates from a binding spec (e.g. 422 -> 400), record the deviation in the ADR in the same slice, not only in the PR text.
