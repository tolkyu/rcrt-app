# Performance — vacancy create + draft predicate (V2b S1)

Disposable PG 17.11 database, 30k → 90k vacancies, 4 verticals, 1,824 drafts at 90k, 43 authors. Plans use the real SQL from `listVacancies`, `findVacancy`, `listPositions`; executor ms = median of 3 warm `EXPLAIN (ANALYZE, BUFFERS)` runs, local Docker, no network hop. «Before» = old `scopeWhere` predicate on the same data. Endpoint P95 and hosted numbers are unmeasured.

## Verdict

No blocking finding. Every list and detail scenario is under 10 ms executor at 90k rows (budget 150 ms). One non-blocking scale defect (draft list of an author with few drafts) is fixed in this slice (see «Draft list»).

## Budgets

| Budget                        | Measured                                                                               | Status                       |
| ----------------------------- | -------------------------------------------------------------------------------------- | ---------------------------- |
| PERF-02 list API P95 < 150 ms | Executor ≤ 9.3 ms worst case at 90k (recruiter `status=DRAFT`), typically 0.7–3        | DB passes, endpoint P95 open |
| PERF-05 one query per list    | Unchanged: one statement per page (+ one rate-limit upsert when `q` is set)            | Pass                         |
| Create endpoint (no PRD cap)  | 50 sequential creates: P95 13–18 ms locally, 9–13 statements per call; replay P95 9 ms | Pass (hosted unmeasured)     |
| Detail by id                  | 0.03–0.08 ms, 3–15 buffers                                                             | Pass                         |

## List, executor ms before → after (30k rows)

Plan shape is identical before and after for non-draft scenarios: backward scan on `vacancy_public_no_uq` with the scope as filter; recruiter scope uses `vacancy_recruiter_user_idx`; search uses `vacancy_title_trgm_idx`.

| Scenario              | Admin     | Head Recruiter | Recruiter | Team Lead |
| --------------------- | --------- | -------------- | --------- | --------- |
| First page            | 1.32→1.39 | 1.00→0.80      | 1.18→0.99 | 0.76→0.85 |
| `status=OPEN`         | 0.79→1.41 | 0.76→0.95      | 1.07→1.03 | 0.78→0.75 |
| `status=DRAFT` (own)  | 1.02→2.00 | 1.20→1.21      | 2.43→2.71 | 0.89→0.27 |
| Cursor mid-set        | 0.80→1.02 | 0.87→0.80      | 1.15→0.83 | 0.78→0.74 |
| `limit=100`           | 4.08→3.82 | 2.63→2.86      | 3.36→3.44 | 2.58→3.44 |
| `q=Facebook` + `OPEN` | 0.93→1.31 | 1.17→1.00      | 9.72→8.60 | 3.20→3.33 |

At 90k rows all scenarios stay ≤ 9.34 ms. Other cursor shapes (`newer`, deep cursor, cursor + `vertical`, `priority=URGENT`) run 0.3–1.5 ms before and after.

## Draft list

The predicate `(status <> 'DRAFT' AND scope) OR (status = 'DRAFT' AND created_by = me AND authored)` hides `created_by` inside an OR, so `vacancy_draft_author_idx` was never an index condition: an author with no drafts walked the whole `vacancy_public_no_uq` index (≈0.16 ms per 1k vacancies).

| `status=DRAFT`, author with | Before fix ms / buffers | Draft arm only ms / buffers |
| --------------------------- | ----------------------- | --------------------------- |
| 429 drafts (Head, 90k)      | 1.31 / 348              | 1.66 / 428                  |
| 0 drafts, Admin 30k         | 3.28 / 1,034            | 0.05 / 2                    |
| 0 drafts, Admin 90k         | 14.43 / 30,875          | 0.04 / 2                    |
| 0 drafts, Recruiter 90k     | 2.54 / 993              | 0.04 / 4                    |

Fix in S1: when `status=DRAFT` is filtered use only the draft arm; with any other status filter use `status <> 'DRAFT'` plus scope only; keep the OR for the unfiltered list. Plan regression test added.

## Position open-count subplan (`listPositions`)

| Scenario                                  | `vacancy_position_idx` | `vacancy_position_open_idx` | Neither |
| ----------------------------------------- | ---------------------- | --------------------------- | ------- |
| 30k vacancies, 100 positions (~300 each)  | 13.82 ms / 24,745 buf  | **1.25 ms / 203 buf**       | 86 ms   |
| 30k vacancies, 1,000 positions (~30 each) | 6.96 ms / 3,863 buf    | **2.67 ms / 2,017 buf**     | 518 ms  |

Index-only scan; depends on a vacuumed visibility map (autovacuum). Closes follow-up 4 of `report-phase-2-positions.md`.

## `POST /api/v1/vacancies` (service level, 90k rows, local TCP)

| Scenario                                | P50 ms | P95 ms | Statements |
| --------------------------------------- | ------ | ------ | ---------- |
| Admin PUBLISH (TL, salary, 2 rich docs) | 12.2   | 15.1   | 11         |
| Admin DRAFT                             | 10.8   | 12.9   | 9          |
| Head Recruiter PUBLISH                  | 14.6   | 16.1   | 11         |
| Recruiter PUBLISH (self-assign + event) | 14.8   | 17.9   | 13         |
| Replay (same key and body)              | 7.4    | 8.7    | 7          |

Hosted estimate (not measured): statements × 1.5–3 ms ≈ 20–40 ms P50. `FOR SHARE` locks are share-compatible with concurrent creates; they conflict only with deactivation and rename writers. Rate limit 30/min/user bounds load.

## `idempotency_key`

| Item         | Measured                                                                                      |
| ------------ | --------------------------------------------------------------------------------------------- |
| Size         | 500k rows = 170 MB (98 MB heap + 73 MB indexes), ≈340 B per row                               |
| Claim insert | 0.19 ms at that size                                                                          |
| Purge        | 171 ms for 483k expired rows (seq scan); `created_at` index added for small expired fractions |
| Growth       | A few hundred rows a day under the rate limit; tens of MB a year                              |

Gap: no purge job (no cron infra yet); tracked in PROGRESS.

## Follow-ups

| #   | Priority | Item                                                                                                      |
| --- | -------- | --------------------------------------------------------------------------------------------------------- |
| 1   | Done     | Draft arm indexable (S1 fix)                                                                              |
| 2   | Done     | One round trip less per create: single `INSERT … ON CONFLICT DO UPDATE … WHERE expired`                   |
| 3   | Low      | Batched 24 h purge of `idempotency_key` in the first cron job                                             |
| 4   | Low      | k6 / Lighthouse for list, draft list and create; `/vacancies` still missing from Lighthouse/runtime specs |

Gaps: endpoint P95 and hosted latency unmeasured; no UI in this slice (JS/LCP/CLS not measured).
