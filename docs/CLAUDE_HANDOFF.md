# Handoff — current state only

> **Rule:** this file holds only the latest checkpoint (≤ ~60 lines). On every checkpoint, move the old content to the top of `docs/archive/handoff-log.md` (newest first), then rewrite this file. Never append history here. Read the archive only when you need an old detail.

## Checkpoint — 2026-11-18 (Claude)

- Branch `phase-2`, HEAD `7a47c14` (V3 wireframes committed). D129 (risk-based DoD) and D130 (V3 rules, Q-190..194 answered) recorded; ADR-017 committed.
- Urgency V2: slices 1–3 merged (API, highlight, card control). Slice 4 (list filter) on `vac-04-4-filter` (`D:/recruiting-wt/urgency-filter`): perf-engineer merging `phase-2`, measuring bundles, deciding on the lazy switcher change in `app-shell.tsx`.
- V3 slice 1 (foundation per ADR-017) running in `D:/recruiting-wt/v3-foundation` (branch `v3-foundation`).

## Next (in order)

1. Merge slice 4 into `phase-2` (level-b verify), push.
2. Review V3 slice 1 (code-reviewer + security-engineer: authz), merge.
3. V3 slices 2, 3, 4 (APIs) in parallel worktrees + slice 7 (share tests); then 5 → 6 (UI); then 8 (E2E, Newman, V2+V3 gallery, perf + security reviews). Urgency slice 5 (E2E/Postman/PNGs) folds into V3 slice 8 as one V-block end.
4. Owner: UX questions in `docs/ux/wireframes/vacancy-card.md` §14 — defaults applied («Відновити», confirm on self-claim, no «Не призначено» filter option); tell owner in the report.
5. Tech debt (Phase 7): private cancelled urgent draft shows only Lock note; dark-hover 2.94:1 in UX contrast table; urgency `change_feed` row not emitted.
6. Phase 7: remind owner about demo videos.

## Open, not blocking

- Owner's real-phone check of the sticky footer + toast.
- 10 Phase-1 PNGs (+ latest copies) modified in tree without UI change — keep out of commits; determinism triage later.
- E2E: running desktop + mobile projects in parallel hits 429 (30 writes/min, sign-in window). Run per project.

## Run notes (Windows)

- `corepack pnpm …` (pnpm not on PATH). Vitest only from PowerShell (Git Bash: "failed to find the current suite").
- Docker Desktop → `npx supabase start`; `corepack pnpm test:db:up` for integration; never two integration or Playwright runs at once.
- `corepack pnpm build` before E2E. First E2E of the day without `--no-deps`; repeats may use `--no-deps`.
- Contracts: `corepack pnpm api:openapi`, then `corepack pnpm exec tsx scripts/postman.ts`.
- Corrupt `.next` (`reading 'length'`) → delete `.next`, rebuild.
- Never print `.env` or full `supabase status`. Local DB rate-limit rows: never delete.
- Codex fallback: on return verify its work, commit, code-review. `AGENTS.md`/`.codex` only point to `CLAUDE.md`.
