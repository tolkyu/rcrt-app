# Handoff — current state only

> **Rule:** this file holds only the latest checkpoint (≤ ~60 lines). On every checkpoint, move the old content to the top of `docs/archive/handoff-log.md` (newest first), then rewrite this file. Never append history here. Read the archive only when you need an old detail.

## Checkpoint — 2026-11-18 (Codex, SHARE-FALLBACK)

- Branch `phase-2` @ `c712eb9`; V3 assignment/status/Team Lead APIs, team panel and API/review tests already merged. Old “merge slices 2–5” tasks are superseded.
- Small slice **SHARE-FALLBACK / STORY-UI-09-1 complete, uncommitted**: full selected read-only URL, warning alert, Ukrainian label and «Закрити»; focus and rapid/stale clipboard outcomes covered. Card/preview share the fix; same-ID draft focus lifecycle retained.
- Verification: 56 focused unit tests, scoped ESLint, typecheck, build, bundle checks and code review APPROVED. Desktop Playwright: 7 share cases + 11 session setup passed; mobile: 5 passed, 2 desktop-preview skips.
- Initial JS gzip: card 160.32 kB; list/preview 169.19; edit 178.95; new 178.73; all ≤180. No PNG recaptures, full suites, commits or pushes. QA lock released; screenshots and tsconfig unchanged.
- Codex optimization remains uncommitted too: Sol Medium defaults; High critical work; two subagents max; see `CLAUDE.md` §12. Preserve existing untracked `.agents/skills/`.
- Detailed evidence/current gaps: `docs/PROGRESS.md`.

## Next (one small slice at a time)

1. Reconcile existing **dirty** status work at `D:/recruiting-wt/v3-status-ui`. HEAD `3899dee` is already merged; status code exists only as four modified tracked files plus nine new files (~1,566 new lines), including shared urgency cache changes. Inspected read-only, left intact. Do not blindly merge/copy or duplicate it.
2. Finish bounded hold/resume request/cache work with urgency regressions, then dialogs/menu integration (STORY-VAC-02-1). Follow ADR-017 and its errata. Resolve Admin-without-2FA `needsMfa`/DisabledReason gap before status UI closure.
3. V-block end: reconcile story wording (HR share access vs D46), E2E/API/Newman, updated PNG47/U1 and V2/V3 gallery, UX review. Existing audit/unit gap labels may already be covered by `9db162c`; verify before repeating work.
4. Phase 7: retain D126 tech debt and remind owner about demo videos.

## Run notes / open checks

- `corepack pnpm …`; Vitest from PowerShell. Typecheck/build may need elevation for native bindings/cache.
- Docker/Supabase + integration DB were running. Shared integration lock = `D:/recruiting-wt/.integration.lock`; acquire exclusively before integration/Playwright and release only your lock. Never overlap build, integration or Playwright runs.
- Desktop then mobile E2E sequentially (429 on concurrent sign-ins/writes). First run with session dependency; repeats may use `--no-deps`.
- Latest focused E2E: `corepack pnpm exec playwright test tests/e2e/vacancy-share.spec.ts --project=e2e-desktop --workers=1 --grep 'clipboard|fallback|inside the screen|preview'`; mobile with `--no-deps`.
- Screenshots only at V-block end (D125/D126). Phone selection/sticky-footer/toast check remains owner-run; existing “200% zoom” test is a viewport surrogate. No visual gallery review in this slice.
- Never print `.env`/full `supabase status`; never delete local rate-limit rows.
