# Handoff — current state only

> **Rule:** this file holds only the latest checkpoint (≤ ~60 lines). On every checkpoint, move the old content to the top of `docs/archive/handoff-log.md` (newest first), then rewrite this file. Never append history here. Read the archive only when you need an old detail.

## Checkpoint — 2026-11-18 evening (Claude, before VS Code restart)

- `phase-2` @ `412dd43`+, pushed. All V2 + V3 code merged: slices 1–7, 6b row status menu, needsMfa step-up reason, share fallback (Codex), API contracts + Newman. Every slice: code review APPROVED; security PASS (`docs/security/v3-*.md`); UX deviations in wireframes.
- **Owner rule 2026-11-18 (CLAUDE.md §6.7, memory risk-based-dod-d129): never duplicate GitHub CI locally.** Merge = resolve conflicts → run only affected test files → push → CI → `babysit`/`fix-ci`. CI (`.github/workflows/ci.yml`) runs lint, typecheck, test, perf:check, test:e2e, test:screens, test:api.
- Owner is installing `gh` (`winget install --id GitHub.cli`, `gh auth login`). CI status of recent pushes is UNKNOWN until then.
- V-block end QA in `D:/recruiting-wt/v3-vblock` (branch `v3-vblock`): new `vacancy-assignment.spec.ts`, `vacancy-status.spec.ts`, captures C1–C5, T1–T8, S1–S8, re-capture U1 (PNG 47). Merge when done.

## Next (in order)

1. `gh auth status`; `gh run list --branch phase-2 --limit 5`; fix red CI with `fix-ci`.
2. Merge `v3-vblock` (if not merged yet), push; UX reviews the gallery (`screenshots/phase-2/index.html`).
3. Open PR `phase-2` → `main` with `make-pr-easy-to-review`, keep green with `babysit`.
4. Owner report (Ukrainian): done, gallery path, demo script, open questions; wait for «go phase 3». Edit route JS 179.04/180 kB — perf follow-up before any form growth.
5. Phase 7: demo videos reminder; tech debt in PROGRESS.

## Run notes / open checks

- `corepack pnpm …`; Vitest from PowerShell. Typecheck/build may need elevation for native bindings/cache.
- Docker/Supabase + integration DB were running. Shared integration lock = `D:/recruiting-wt/.integration.lock`; acquire exclusively before integration/Playwright and release only your lock. Never overlap build, integration or Playwright runs.
- Desktop then mobile E2E sequentially (429 on concurrent sign-ins/writes). First run with session dependency; repeats may use `--no-deps`.
- Latest focused E2E: `corepack pnpm exec playwright test tests/e2e/vacancy-share.spec.ts --project=e2e-desktop --workers=1 --grep 'clipboard|fallback|inside the screen|preview'`; mobile with `--no-deps`.
- Screenshots only at V-block end (D125/D126). Phone selection/sticky-footer/toast check remains owner-run; existing “200% zoom” test is a viewport surrogate. No visual gallery review in this slice.
- Never print `.env`/full `supabase status`; never delete local rate-limit rows.
