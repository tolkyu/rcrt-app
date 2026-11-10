# Perf report — Phase 2 V2b S2 (draft lifecycle backend)

> Reviewer: performance-engineer, 2026-11-10. Static + measured on disposable PostgreSQL 17.11, migrations 0000–0015, 90 000 vacancies (PERF-01 × 45) and 2 000. Harness (gitignored): `.cache/perf-s2/`.

## Verdict

**Approve for commit, no P1.** Four P2 to fix before S3 UI (P2-2 before any reader of `vacancyEventReadWhere`). ~800 raced operations, 0 deadlocks.

## Budgets vs measured

| Budget                                  | Measured                                                                                     | Status                            |
| --------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------- |
| PERF-02 list P95 < 150 ms, plan < 40 ms | executor 0.4–1.1 ms typical; worst 10–12 ms (recruiter, empty status) at 90k; ≤ 1.1 ms at 2k | Pass (DB level)                   |
| Card detail < 100 ms                    | unchanged PK lookup                                                                          | Pass                              |
| Mutation < 120 ms                       | local P95 11–18 ms; hosted publish est. 35–55 ms                                             | Pass                              |
| Mutation ≤ 15 statements                | publish 14 per route, cancel 12, patch 10–11, delete 10, replay 7                            | Pass, 1 statement headroom (P2-4) |
| No Seq Scan on `vacancy`                | none in 63 scenarios × 2 predicates                                                          | Pass                              |

Local service latency P50 / P95 (ms): PATCH 11.8 / 13.5 · PATCH + position + TL 12.9 / 14.8 · no-op 9.3 / 10.7 · PUBLISH 15.2–15.5 / 16.3–18.1 · replay 6.3 / 7.4 · CANCEL 12.9 / 17.4 · DELETE 10.0 / 11.3.

## Locks

- Order everywhere: idempotency row → users `FOR SHARE` (`ORDER BY id`) → position `FOR SHARE` → vacancy `FOR UPDATE`. No inversion across routes.
- Races: 16× publish → 1 OK + 15 `VACANCY_NOT_DRAFT`; 16× patch same version → 1 OK + 15 `STALE_STATE`; cross-author TL chains 360 ops, publish vs (de)activation 120 ops — **0 `40P01`**.
- Child FK insert behind `FOR UPDATE` 154 ms vs `FOR NO KEY UPDATE` 1 ms (P3-2).

## Read predicate

- Plan shape identical before/after in all 63 scenarios (role × filter); ±20 % = noise.
- Pre-existing (not S2): empty result sets walk `vacancy_public_no_uq` (10–34 ms at 90k, ~0.9 ms at 2k) — P3-5.

## Findings

| ID   | Sev | Finding                                                                                                                               | Fix                                                                                                                                                                     |
| ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-1 | P2  | `vacancy_cancelled_draft_author_idx` never used by real statements (`idx_scan = 0`); comment above `vacancyReadWhere` wrong           | Drop from 0015 / schema / snapshot; fix comment; re-add with a query that reads cancelled drafts alone                                                                  |
| P2-2 | P2  | `vacancyEventReadWhere` → hashed subplan over whole `vacancy`: hot timeline 0.014 → 20 ms; global feed 27 → 117–143 ms at 200k events | Timeline: `findVisibleVacancyOrThrow` then unfiltered by `vacancy_id`; feeds: row-local `(vacancy_id IS NULL OR vertical_id IS NOT NULL OR actor_id = $me)`; plan tests |
| P2-3 | P2  | Every PATCH rewrites both rich-text docs (TOAST 72 KB → 3.67 MB after 50 title edits); `lockVacancy` is `select *`                    | Write only changed columns; lock scalar columns, load docs only when patched                                                                                            |
| P2-4 | P2  | Publish at 14 / 15 statements                                                                                                         | Compare-and-set `UPDATE … WHERE status='DRAFT' AND version=$ … RETURNING`, classify only on 0 rows; statement-count assertion                                           |
| P3-1 | P3  | `readDraft` uses full detail query                                                                                                    | Lighter read (skip if P2-4 done)                                                                                                                                        |
| P3-2 | P3  | `lockVacancy` `FOR UPDATE`                                                                                                            | `.for('no key update')`                                                                                                                                                 |
| P3-3 | P3  | Cancel reads result after COMMIT on `ctx.db`                                                                                          | Read inside the transaction                                                                                                                                             |
| P3-4 | P3  | No `idempotency_key` purge (rows only on successful publish, < 1 MB / year)                                                           | Batched delete > 24 h in the first cron job                                                                                                                             |
| P3-5 | P3  | Empty result sets walk the number index                                                                                               | No action below ~500k vacancies                                                                                                                                         |
| P3-6 | P3  | No k6 / runtime spec for vacancy list or writes                                                                                       | `tests/perf/k6/vacancies.js` (lists p95 < 150, mutations p95 < 120)                                                                                                     |

## Not measured

Endpoint P95 through Next.js, hosted Supabase latency, web vitals (no UI).
