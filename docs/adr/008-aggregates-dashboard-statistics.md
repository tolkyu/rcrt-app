# ADR-008 — Aggregates for dashboard and statistics

- **Status:** Accepted
- **Date:** 2026-10-30
- **PRD:** VAC-02/04, UI-01/02, STAT-01..08, BONUS-13/14, PERF-01/02/05

## Context

- Vacancy cards show a mini-funnel per stage; dashboards show counts; statistics need funnels, conversions, time metrics, sources, TL metrics, bonus totals over periods — on 50k candidates / 200k events within 150 ms.
- Statistics must respect visibility (STAT-07): own / vertical / HR stages / own vacancies / global.

## Options

| Option                                                                                                                 | Pros                                                       | Cons                                                                    |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| A. Ad-hoc `GROUP BY` over raw tables                                                                                   | Always exact                                               | Violates PERF-05; slow on perf seed                                     |
| B. Materialized views refreshed periodically                                                                           | Simple SQL                                                 | Refresh locks/cost, stale between refreshes, can't be partially updated |
| **C. Counters updated in the business transaction + daily aggregate tables updated incrementally + nightly reconcile** | Exact in real time for counters, cheap reads, self-healing | Write-path code must emit deltas; reconcile job required                |

## Decision

**C.**

### Real-time counters (same transaction)

| Table / column                                  | Grain                                                                 | Updated when                                             | Used by                    |
| ----------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------- |
| `vacancy_stage_count(vacancy_id, stage, count)` | vacancy × stage, active (non-deleted) applications currently in stage | every stage change, application create/delete/restore    | mini-funnel, vacancy board |
| `vacancy.hires_count`                           | applications of the vacancy that entered `PROBATION`                  | `OFFER→PROBATION`; moves out of PROBATION by Admin force | VAC-02 auto-`FILLED`       |

- Update = `UPDATE … SET count = count ± 1` on the two affected rows, ordered by stage to avoid deadlocks; row lock contention is per vacancy (low).
- VIS-02 (no leaky counts): counters are served only to callers whose `application.read` scope covers the whole vacancy (`GLOBAL`/`VERTICAL`). Callers with narrower scopes (Recruiter `OWN`, TL `SUBMITTED_TO_ME`, HR `VERTICAL_FROM_STAGE`) get a live scoped `COUNT(*) … GROUP BY vacancy_id, stage` for the visible page of vacancies (index `application(vacancy_id, stage) WHERE deleted_at IS NULL`, ≤ 50 vacancies per call). Owner-confirmed 2026-10-31 (Q-15): counts include only what the viewer can open.
- ⚠ OPEN (VAC-02): does a later `PROBATION_FAILED` decrement hires and auto-reopen a `FILLED` vacancy? Default implemented: literal reading — "reached Probation" counts, no auto-reopen; Head Recruiter reopens manually.

### Daily statistics tables (Kyiv calendar day)

| Table                  | Grain (dimensions)                                                                     | Metrics (counts; time = `sum_seconds` + `n`)                                                                                                                                                                                                              | Scope column(s)                               |
| ---------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `stat_recruiter_daily` | day, vertical, recruiter (credited owner/sourcer per metric), position, source_channel | candidates sourced, added to vacancy, submitted, TL accepted, TL declined, interviews held, no-shows (candidate/TL), polygraph pass/fail, offers sent, offers accepted, hires (probation started), probation passed/failed, time-to-submit, time-to-offer | `vertical_id`, `recruiter_id`                 |
| `stat_vacancy_daily`   | day, vertical, vacancy, position, team_lead                                            | stage entries per stage, TL accepts/declines, TL response time, reschedule requests, TL no-shows, interview→offer, time-in-stage (per stage), time-to-fill (vacancy open → probation start)                                                               | `vertical_id`, `team_lead_id`                 |
| `stat_hr_daily`        | day, vertical, hr_user                                                                 | polygraphs assigned/scheduled/results (pass/fail), Head HR reviews (confirmed / not confirmed), retakes, attempts per hire, offers drafted/sent/accepted/declined/expired, first days confirmed, probations closed                                        | `vertical_id`, `hr_user_id`                   |
| `stat_rejection_daily` | day, vertical, recruiter, team_lead, position, stage, reason_code                      | count                                                                                                                                                                                                                                                     | `vertical_id`, `recruiter_id`, `team_lead_id` |
| `stat_bonus_monthly`   | month (payout period or due month), vertical, recruiter, currency                      | amount_minor + count per tranche status: planned, eligible, approved, paid, clawed back                                                                                                                                                                   | `vertical_id`, `recruiter_id`                 |

- Writes: `stats.record(tx, deltas[])` → `INSERT … ON CONFLICT (grain) DO UPDATE SET metric = metric + EXCLUDED.metric`. Deltas are produced by the pipeline service from the `TransitionPlan` (no separate event bus).
- Bonus table moves amounts between status columns on each tranche transition.
- Averages = `sum_seconds / n` over the period; medians/percentiles are **not** supported in v1 ⚠ OPEN (PRD STAT-03 doesn't say which statistic; default: average).
- "Who brought whom to which vacancy" (STAT-01) is a scoped, cursor-paginated list over `application` (index `(sourcer_id, created_at)`), not an aggregate.
- STAT-04 hires per source channel: from `stat_recruiter_daily.source_channel`.
- Finance (Q-23, owner): candidate-level report rows expose only the candidate's full name + application ID.
- CAND-06 transfer: historical aggregate rows stay in the vertical where the event happened; nothing is moved.

### Reconcile (self-healing)

- Nightly `stats-reconcile` recomputes the last 7 Kyiv days (and any day in `stat_dirty_day`) from source of truth (`entity_event` `application.stage_changed`, `application`, `offer`, `polygraph`, `interview`, `bonus_tranche`) and replaces rows for those days in one transaction per day.
- Force moves, restores, merges and purges mark affected days in `stat_dirty_day` instead of trying to compute exact deltas.
- `vacancy-counters-reconcile` recomputes counters and reports drift.
- Purge (ARCH-04) keeps aggregate rows (no PII in them); anonymized candidate stub keeps bonus integrity.

### Visibility (STAT-07)

- Every statistics query adds `scopeWhere(ctx, 'statistics.<section>.read')` on the scope columns above (e.g. recruiter: `recruiter_id = me`; Head HR: `vertical_id = ANY(V)` on `stat_hr_daily` only; TL: `team_lead_id = me`; Finance/Admin: none).
- Exports use the same queries, streamed (CSV via `ReadableStream`; XLSX via `exceljs` streaming writer); formula-injection rules (DG-14): any **text** cell whose first character is `=`, `+`, `-`, `@`, TAB (`0x09`) or CR (`0x0D`) is prefixed with `'`; numbers and money (incl. negative clawbacks) are written as **numeric** cells, never strings; XLSX text cells are explicitly typed as string; CSV fields always quoted. Every export is audited and rate-limited (DG-21, DG-09).

### Dashboard (UI-01)

- My tasks: union of small scoped queries, each on a partial index (e.g. applications `SUBMITTED_TO_TL AND tl_decision='PENDING'` for TL; polygraph `status IN ('UNASSIGNED','ASSIGNED')` for HR; offer `ACCEPTED` with start date passed and no probation for HR; probation `ACTIVE AND planned_end_date <= today+14`), run in `Promise.all`, each `LIMIT 20` + "show all".
- Vacancy grid: vacancies (scoped) + `vacancy_stage_count` in one query (`LEFT JOIN LATERAL` json aggregate of ≤ 11 rows per vacancy).

## Hot path & budget

| Query                                  | Plan                                                                                             | Target  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ | ------- |
| Vacancy grid page (50) with funnels    | index on `(vertical_id, status, updated_at)` + PK lookups into `vacancy_stage_count`             | < 40 ms |
| Statistics funnel, 1 vertical, 90 days | index scan on `stat_vacancy_daily (vertical_id, day)` ≈ 2k vacancies × 90 days worst case, `SUM` | < 80 ms |
| Bonus tab, 12 months                   | `stat_bonus_monthly (vertical_id, month)`                                                        | < 20 ms |

## Consequences

- (+) Dashboards and statistics never scan raw tables; numbers survive bugs via reconcile.
- (−) Write path does a few extra upserts per transition (~1–3 ms) — inside the 120 ms mutation budget.
- (−) Day/month bucketing in Kyiv time is fixed at write time; changing the reporting timezone requires a full recompute.
