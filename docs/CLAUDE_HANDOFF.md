# Handoff — current state only

> **Rule:** this file holds only the latest checkpoint (≤ ~60 lines). On every checkpoint, move the old content to the top of `docs/archive/handoff-log.md` (newest first), then rewrite this file. Never append history here. Read the archive only when you need an old detail.

## Checkpoint — 2026-11-18 (Codex, published vacancy content API)

- Following baseline `bc8f061`, STORY-VAC-01-2a implements `PATCH /api/v1/vacancies/{vacancyId}/content`: description/requirements only, strict shared rich-text schema, omission/null/replacement semantics, version/no-op checks and atomic metadata-only history. Existing draft PATCH is unchanged. No migration or UI change.
- Owner D133/Q-195: published content editable only on OPEN/ON_HOLD; FILLED must reopen first, CANCELLED remains immutable. ADR-018 records the narrow permission union and fresh actor/vacancy/assignment authorization under ordered locks.
- Code review APPROVED; security PASS; independent QA PASS. Reports: `docs/review-phase-2-vacancy-content.md`, `docs/security/vacancy-content-review.md`, `docs/qa-phase-2-vacancy-content.md`. One nonblocking race-harness synchronization nit deferred under D126.
- Local verification: affected units 1667 passed; content integration/races 33 passed; affected draft/urgency/assignment/status regressions 319 passed; independent mixed-role aal1 QA 1 passed. Typecheck, lint, formatting and generated OpenAPI/Postman consistency passed. Shared integration lock released; test PostgreSQL remains running.
- Hosted verification is authoritative at PR #1 latest checks: https://github.com/tolkyu/rcrt-app/pull/1/checks . Baseline CI 44382912511 on bc8f061 passed all gates; it is not evidence for the new content code. The orchestrator must verify the content commit's CI before the next implementation slice.
- V3 mobile fixes/captures have focused UX approval (`docs/ux/review-phase-2-v3-fixed-captures.md`). Follow-on content form design: `docs/ux/wireframes/vacancy-content-edit.md`; initial authorized document/version/eligibility read and F10 editor/view remain unimplemented dependencies. Full Phase 2/V4 and candidates remain unfinished.

## Next (in order)

1. Verify the content commit's hosted CI, including 16 new Postman cases; fix any red gate before more implementation. Do not duplicate passing full suites locally (D129).
2. Design the authorized initial content read and effective edit eligibility, then implement approved F10 editor/view and the two-field UI in bounded reviewed slices. Do not invent GET routes or use PATCH for reading. Keep D133 and draft isolation.
3. PR #1 description has stale V3 bug/capture claims; reconcile for owner merge. Do not merge or advance to Phase 3 automatically.
4. Owner physical-phone selection/sticky-footer/toast check remains open; the existing 200% zoom test is a viewport surrogate. Phase 7 demo videos reminder and D126 nits remain.

## Run notes

- `corepack pnpm …`; Vitest from PowerShell. Typecheck/build may need elevation for native bindings/cache.
- Shared integration lock = `D:/recruiting-wt/.integration.lock`; acquire exclusively before integration/Playwright and release only your lock. Never overlap build, integration or Playwright runs.
- Desktop then mobile E2E sequentially (429 on concurrent sign-ins/writes). First run with session dependency; repeats may use `--no-deps`.
- Screenshots only at V-block end (D125/D126); do not recapture unchanged screens. CI triggers on PRs; push branches are main/phase-1.
- Never print `.env`/full `supabase status`; never delete local rate-limit rows. Dependency audit exemption expires 2026-12-18 (`docs/security/dependency-audit-picomatch.md`).
