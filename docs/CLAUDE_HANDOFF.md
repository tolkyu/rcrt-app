# Handoff — current state only

> **Rule:** this file holds only the latest checkpoint (≤ ~60 lines). On every checkpoint, move the old content to the top of `docs/archive/handoff-log.md` (newest first), then rewrite this file. Never append history here. Read the archive only when you need an old detail.

## Checkpoint — 2026-11-18 afternoon (Claude)

- `phase-2` @ `b8d7709`, pushed. Merged: V3 slices 1–5, 7, API contracts/Newman (658 req / 3831 assertions / 0 fail), Codex share-fallback fix (verified, one stale test fixed), Codex config, story wording (D46/D130/D131/errata). Full unit+integration 5110 green at `c712eb9`.
- Owner D131: no claim cap; removed last recruiter may reclaim.
- V3 slice 6 (status menu card/preview) @ `4fb4814` in `D:/recruiting-wt/v3-status-ui`: two code reviews (s6a logic, s6b dialogs) + UX deviation review running. ~930 non-test lines.
- Decision (orchestrator, tech only): list-row `[⋯]` status items = option A — server sends per-vertical status-grant mirror (like `selfAssignVerticals`), row menu reads card version on open.

## Next (in order)

1. Slice 6 review fixes → merge (typecheck, lint, full `pnpm test` under lock, build + perf:size) → push.
2. Slice 6b: list-row status menu (option A).
3. `needsMfa` DTO flag + DisabledReason for Admin without 2FA on team/status controls (PROGRESS gap).
4. V-block end: E2E (assignment, status, share), Newman rerun, V2+V3 gallery PNGs (+ register PNG 47), UX gallery review, perf check. Then owner report (Ukrainian).
5. Phase 7: demo videos reminder; tech debt (PROGRESS). Flaky under load: `tests/unit/auth/lazy-validation-forms.test.ts` MFA button, combobox listbox timeout.

## Run notes / open checks

- `corepack pnpm …`; Vitest from PowerShell. Typecheck/build may need elevation for native bindings/cache.
- Docker/Supabase + integration DB were running. Shared integration lock = `D:/recruiting-wt/.integration.lock`; acquire exclusively before integration/Playwright and release only your lock. Never overlap build, integration or Playwright runs.
- Desktop then mobile E2E sequentially (429 on concurrent sign-ins/writes). First run with session dependency; repeats may use `--no-deps`.
- Latest focused E2E: `corepack pnpm exec playwright test tests/e2e/vacancy-share.spec.ts --project=e2e-desktop --workers=1 --grep 'clipboard|fallback|inside the screen|preview'`; mobile with `--no-deps`.
- Screenshots only at V-block end (D125/D126). Phone selection/sticky-footer/toast check remains owner-run; existing “200% zoom” test is a viewport surrogate. No visual gallery review in this slice.
- Never print `.env`/full `supabase status`; never delete local rate-limit rows.
