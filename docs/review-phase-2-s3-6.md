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

## Re-review of 6f2aa81 (Claude code-reviewer, 2026-11-17)

**Verdict: APPROVED.** Unit 7 files / 278 passed, `tsc` and ESLint clean. Security L1 and L2 closed.

- **N1 (fixed by the orchestrator):** `lib/schemas/rich-text.ts` applied the whole-value blank-alone rule to each text node; a mark boundary can leave a node of only U+FE0F → 422. Text nodes now use `hasNoForbiddenChars`; a unit test pins the split-emoji case.
- Nit (open): «Тімлід ·» in `uk.json:207` — the dot may be read by screen readers; consider an `aria-hidden` separator.

### Blast radius

- **Safe because:** the new rule changes the verdict only for values in which every character is blank-alone, whitespace or Cf. Proven by a run (level 4): a full Unicode sweep, alone and as a suffix of «Лід», plus a corpus (Ukrainian, emoji + VS16, keycap, flag, Mongolian, Khmer, Devanagari, Hebrew, Arabic). Changed alone: exactly the 24 listed code points; changed inside text: 0.
- **Cleared:** schemas validate on write only, so stored rows display unchanged; client and server share one predicate; no stale imports after the module move; `findCancelReason` logic unchanged.
- **Pre-existing, FYI:** Cf is forbidden, so ZWJ emoji (👨‍👩‍👧) were and still are refused.
- **Before merge:** integration `vacancies-draft-lifecycle.test.ts` (purge path) — passed in the engineer run (81 tests).
