# Handoff — current state only

> **Rule:** this file holds only the latest checkpoint (≤ ~60 lines). On every checkpoint, move the old content to the top of `docs/archive/handoff-log.md` (newest first), then rewrite this file. Never append history here. Read the archive only when you need an old detail.

## Checkpoint — 2026-11-18 night (Claude)

- **PR #1 `phase-2` → `main` (Phase 1 + 2) is fully GREEN** (run 44336031730: quality incl. e2e, screens, Newman; secrets). Merge state CLEAN. `gh` installed and authed (`tolkyu`).
- CI fixes this session: `.gitleaksignore` (6 reviewed test fixtures), scoped time-boxed prod audit exemption for picomatch GHSA-fc5q-39xc-vjpf (lapses 2026-12-18 → re-check `npm view picomatch version`), prettier on docs, event `orderBy` in two tests, perf audit fixture inside the 7-day window, pre-V3 E2E specs aligned, `vacancy-share.spec.ts` runs last (its Admin TOTP ends shared aal1 sessions), table scroller `relative` (page overflow 900–1100 px).
- CI triggers on PRs only (push trigger = main, phase-1). Each push runs ~40 min: batch docs with code pushes.
- Owner D132: late claim shows «Вакансію вже взяв інший рекрутер» (BUG-V3-1).

## Next (in order)

1. Engineer: BUG-V3-1 (D132) + BUG-V3-2 (390 px claim sheet clamps the irreversibility notice). UX: gallery review `screenshots/phase-2/index.html` + BUG-V3-3 (mobile `[⋯]` dropdown vs sheet).
2. Push → CI green (babysit) → owner phase report (Ukrainian): done, gallery, demo script, open questions → wait for «go phase 3» and owner merge of PR #1.
3. Tech debt: flaky in CI — perf P95 profile write (124 vs 120 ms) and audit interaction (104 vs 100 ms) on slow runners; `mfa.spec.ts:172` desktop; `vacancies-create-team-lead.spec.ts:216` mobile draft count race. Edit route JS 179.04/180 kB.
4. Phase 7: demo videos reminder.

## Run notes / open checks

- `corepack pnpm …`; Vitest from PowerShell. Typecheck/build may need elevation for native bindings/cache.
- Docker/Supabase + integration DB were running. Shared integration lock = `D:/recruiting-wt/.integration.lock`; acquire exclusively before integration/Playwright and release only your lock. Never overlap build, integration or Playwright runs.
- Desktop then mobile E2E sequentially (429 on concurrent sign-ins/writes). First run with session dependency; repeats may use `--no-deps`.
- Latest focused E2E: `corepack pnpm exec playwright test tests/e2e/vacancy-share.spec.ts --project=e2e-desktop --workers=1 --grep 'clipboard|fallback|inside the screen|preview'`; mobile with `--no-deps`.
- Screenshots only at V-block end (D125/D126). Phone selection/sticky-footer/toast check remains owner-run; existing “200% zoom” test is a viewport surrogate. No visual gallery review in this slice.
- Never print `.env`/full `supabase status`; never delete local rate-limit rows.
