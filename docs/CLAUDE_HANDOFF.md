# Handoff — current state only

> **Rule:** this file holds only the latest checkpoint (≤ ~60 lines). On every checkpoint, move the old content to the top of `docs/archive/handoff-log.md` (newest first), then rewrite this file. Never append history here. Read the archive only when you need an old detail.

## Checkpoint — 2026-11-18 (Codex QA, VERIFY-V3)

- Assessed `phase-2` @ `1abc02a`. V2/V3 vacancy implementation, row status menu and `needsMfa` are merged; this is not full Phase 2 completion. V4 remains; candidates, files, deduplication, talent pool, dashboard and custom roles are outside this vacancy block.
- BUG-V3-1/D132 and BUG-V3-2 fixed in `1fe09aa`; BUG-V3-3 mobile bottom action sheet fixed in `d9bfd0e`. Review `33b7524` APPROVED; records typecheck and 128 passing unit tests (`docs/review-phase-2-v3-bugs.md`). No new product tests run for this assessment.
- Captures updated in `0530cf1` + `3edabbb`; all 41 changed phase-2 PNGs match `screenshots/latest/`. QA visually checked the corrected mobile claim notice and status sheet. This is QA acknowledgement, not UX designer approval; gallery review remains `docs/ux/review-phase-2-v3-gallery.md` with D126 nits.
- Current-head CI run **44360353603 is incomplete**: secrets and all pre-E2E gates (including lint, format, typecheck, tests, perf, security and API contracts) passed; E2E hit the 45-minute job limit at passing test 1116/1193, with no failure/retry markers; screens/API skipped. DevOps prepared the focused `ci.yml` timeout change 45 → 60 minutes; no checks relaxed. Fix is local, pending commit/push and green CI; CI has not restarted. Earlier green run 44336031730 does not close the current head.
- Latest local Playwright report is only 5 passing screenshot tests / 12 skipped in `vacancy-team-screens.spec.ts`; it is not a complete shared-screen regression result.

## Next (in order)

1. Obtain owner authorization to commit/push the reviewed CI configuration change (CLAUDE.md §12), then obtain green current-head E2E, screenshots and Newman results. D129: do not duplicate full CI suites locally.
2. Reconcile PR #1 description (stale BUG-V3-1..3/open-capture claims), then report the vacancy V-block in Ukrainian: gallery, demo, checks and open boundaries. Confirm remaining Phase 2/V4 scope with the owner; do not report full Phase 2 complete or advance automatically to Phase 3.
3. Owner physical-phone selection/sticky-footer/toast check remains open; the existing 200% zoom test is a viewport surrogate.
4. Phase 7: demo videos reminder; D126 gallery/style nits remain deferred.

## Run notes

- `corepack pnpm …`; Vitest from PowerShell. Typecheck/build may need elevation for native bindings/cache.
- Shared integration lock = `D:/recruiting-wt/.integration.lock`; acquire exclusively before integration/Playwright and release only your lock. Never overlap build, integration or Playwright runs.
- Desktop then mobile E2E sequentially (429 on concurrent sign-ins/writes). First run with session dependency; repeats may use `--no-deps`.
- Screenshots only at V-block end (D125/D126); do not recapture unchanged screens. CI triggers on PRs; push branches are main/phase-1.
- Never print `.env`/full `supabase status`; never delete local rate-limit rows. Dependency audit exemption expires 2026-12-18 (`docs/security/dependency-audit-picomatch.md`).
