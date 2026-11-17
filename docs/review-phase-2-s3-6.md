# Code review — S3.6 polish, D123, D124 (commit ebf00ae)

**Verdict: APPROVED (Claude code-reviewer, 2026-11-17).** No blocking findings. Unit: 8 files / 239 tests passed (PowerShell).

## Non-blocking (fixed in the follow-up slice)

| # | Finding | Fix |
|---|---|---|
| 1 | `vacancy-author.test.ts:398` allowlists the whole `server/repositories/vacancy.ts` | Move `findCancelReason` into `server/repositories/vacancy-cancel-reason.ts`; allowlist only it (also security L2) |
| 2 | Wireframe `docs/ux/wireframes/vacancy-form.md` lags the UI | Add D123 block, summary links, `vertical.single` hint, blocker text, 450/500 warning, stacked stale alert, 67rem footer; fix 3 stale «Скасувати» mentions |
| 3 | Filter-chip right fade (UX 9) not done | Implement or log gap |
| 4 | No test for `VACANCY_FIELD_LABEL_KEYS` + salary dedupe | Unit test |
| 5 | No render tests for `vertical.single` hint, `RowSkeleton menuColumn` | Unit tests |
| 6 | D123 purge path untested | Integration case: purged PII row → 200 without `cancelReason` |
| 7 | Mobile TL separator via `after:content` (not in a11y tree) | Real text from `uk.json` |
| 8 | `PROGRESS.md:12` says "uncommitted" | Fix wording |

Nits: neutral `lib/visible-text.ts` for the shared rule; trim multi-fact doc comments (`findCancelReason`, `Counter`, `announceStale`).

Security: PASS, see `docs/security/review-phase-2-s3-6.md` (L1 more blank code points, L2 = item 1).
