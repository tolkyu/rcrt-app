# ADR-004 — Background jobs & idempotency

- **Status:** Accepted (cron frequency depends on ADR-001 P1)
- **Date:** 2026-10-30
- **PRD:** PIPE-05, PROB-01/06, OFFER-03, BONUS-08/09/15, STAT (reconcile), ARCH-04, NOTIF

## Context

- Time-based work: interview reminders (24 h / 1 h), probation reminders (14/7/1 days, then daily), first-day confirmation reminder, offer expiry, bonus trigger evaluation, stats reconcile, cleanup.
- Vercel Cron calls HTTP endpoints; may retry, overlap or be re-run manually. No broker, no session locks through the transaction pooler.

## Options

| Option                                                                               | Pros                         | Cons                                             |
| ------------------------------------------------------------------------------------ | ---------------------------- | ------------------------------------------------ |
| **A. Vercel Cron → `/api/cron/<job>` + `job_run` lease + per-item idempotency keys** | No extra infra; safe re-runs | Function duration limits → batching              |
| B. Supabase `pg_cron` calling SQL functions                                          | Runs in DB                   | Business logic in PL/pgSQL, duplicates TS domain |
| C. Queue service (Inngest, QStash, Trigger.dev)                                      | Retries, fan-out             | New paid service, not needed at v1 volume        |

## Decision

**A.**

### Endpoint contract

- `GET /api/cron/<job>`; requires `Authorization: Bearer ${CRON_SECRET}` (constant-time compare) → else 404.
- Handler is thin: builds a system context (`actor_kind = SYSTEM`, injected clock) and calls `server/jobs/<job>.ts`.
- `CRON_SECRET` ≥ 32 random bytes, different per environment; never sent to the browser (DG-04).
- Scheduler per environment (owner 2026-10-31, ADR-001 P1): production = Vercel Cron (Pro, bought before launch); development/preview = Vercel Cron for daily jobs + a free external scheduler (e.g. cron-job.org) for the 5-min and hourly jobs, sending that environment's own secret. Same endpoints and the same `job_run` claim, so double triggers are harmless.
- Manual re-run (DG-04): **only** via `POST /api/v1/admin/jobs/{job}/runs` `{ runKey }` — Admin with aal2 (`settings.jobs.run`), audited; the route calls the job module server-side (it never proxies to `/api/cron` and never exposes the secret). `runKey` must match the job's format and be at most 7 days in the past.

### Run claim (`job_run`)

- Columns: `job_name`, `run_key` (e.g. Kyiv date `2026-11-03` or 5-min slot `2026-11-03T10:05`), `status` (`RUNNING`/`SUCCEEDED`/`FAILED`), `lease_until`, `attempt`, `started_at`, `finished_at`, `stats jsonb` (counts only, no PII), `error_code`. Unique `(job_name, run_key)`.
- Claim: `INSERT … ON CONFLICT (job_name, run_key) DO UPDATE SET status='RUNNING', lease_until=now()+interval, attempt=attempt+1 WHERE job_run.status='FAILED' OR (job_run.status='RUNNING' AND job_run.lease_until < now()) RETURNING id`. No row returned ⇒ already done/running ⇒ exit 200.
- Work in keyset batches (500 rows), each batch its own transaction; stop at ~80% of function max duration and leave `RUNNING` with expired lease → next invocation (or next cron tick) resumes. Items already processed are skipped by item-level idempotency.

### Item-level idempotency (key = `job_name + date + entity`)

| Effect                                                          | Mechanism                                                                                                                                                            |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Notification / email                                            | `notification.dedupe_key` and `notification_delivery.dedupe_key` unique, e.g. `probation-reminder:{probationId}:D7:{2026-11-03}` → `INSERT … ON CONFLICT DO NOTHING` |
| State change (tranche `PLANNED→ELIGIBLE`, offer `SENT→EXPIRED`) | Guarded update `WHERE status = '<from>'`; 0 rows ⇒ already done                                                                                                      |
| Aggregates reconcile                                            | Recompute a day and replace (`DELETE` + `INSERT` for that day in one tx) — naturally idempotent                                                                      |
| Storage cleanup                                                 | Delete object then mark row; missing object treated as success                                                                                                       |

### Job list

| Job                          | Schedule (UTC)                | Run key    | Work                                                                                                                                                                                                                                |
| ---------------------------- | ----------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notifications-dispatch`     | every 5 min                   | 5-min slot | Retry `notification_delivery` rows `PENDING`/`RETRY` with `next_attempt_at <= now` (exponential backoff, max 8 attempts → `FAILED`)                                                                                                 |
| `interview-reminders`        | every 5 min                   | 5-min slot | Interviews `SCHEDULED` with `scheduled_at` in (24 h ± window) and (1 h ± window) → recruiter, TL, candidate email (D7). Window = slot length, dedupe key per interview+kind                                                         |
| `probation-daily`            | 05:00 daily                   | Kyiv date  | PROB-06 reminders at 14/7/1 days before `planned_end_date`, daily overdue reminders until closed; end-date "close probation" task; PROB-01 reminder when accepted offer's start date + 3 days passed without first-day confirmation |
| `offer-expiry`               | hourly                        | hour slot  | `offer` `SENT` with `valid_until < now` → `EXPIRED` + event + task for Head HR (OFFER-03). ⚠ OPEN: auto-expire vs. manual "Expired" outcome only                                                                                    |
| `bonus-triggers`             | 02:00 daily                   | Kyiv date  | `bonus.evaluateTriggers` for tranches `PLANNED`/`ELIGIBLE`/`PAID` with due dates (DAYS_AFTER_START(n), safety net for in-transaction triggers, clawback)                                                                            |
| `stats-reconcile`            | 01:30 daily                   | Kyiv date  | Recompute last 7 Kyiv days + days flagged in `stat_dirty_day` (force moves, restores, purges) (ADR-008)                                                                                                                             |
| `vacancy-counters-reconcile` | 01:00 daily                   | Kyiv date  | Recompute `vacancy_stage_count` + `vacancy.hires_count`; log drift count (alert if > 0)                                                                                                                                             |
| `files-cleanup`              | 03:00 daily                   | Kyiv date  | Delete `file_object` `PENDING` > 24 h (abandoned uploads) and their storage objects                                                                                                                                                 |
| `change-feed-prune`          | 03:30 daily                   | Kyiv date  | Delete `change_feed` rows > 24 h                                                                                                                                                                                                    |
| `retention-propose`          | Mon 04:00                     | ISO week   | ARCH-04 purge proposals (Phase 5)                                                                                                                                                                                                   |
| `auth-drift-check`           | 04:30 daily (production only) | Kyiv date  | DG-07: no `@demo` users, no password-set auth users, signups off, password provider state; findings → Admin alert + audit                                                                                                           |
| `rate-limit-prune`           | 04:45 daily                   | Kyiv date  | delete expired `rate_limit_bucket` windows (DG-09)                                                                                                                                                                                  |

- Kyiv offsets: schedules are UTC; jobs compute "today" as the Europe/Kyiv calendar date from the injected clock, so DST shifts never skip or double a day (the run key is the Kyiv date).
- In-transaction first: business triggers that are caused by a user action (e.g. probation start → tranche 1 eligible) happen in that transaction; cron is the safety net and the only path for pure time triggers.

## Hot path & budget

- Each batch query uses a partial index on the due column (`interview(scheduled_at) WHERE status='SCHEDULED'`, `probation(planned_end_date) WHERE status='ACTIVE'`, `bonus_tranche(due_date) WHERE status IN (…)`, `notification_delivery(next_attempt_at) WHERE status IN ('PENDING','RETRY')`).
- Jobs never run inside user requests; they do not affect PERF-02.

## Consequences

- (+) Re-running any job any number of times is safe; no extra infrastructure.
- (−) 5-min jobs need Vercel Pro in production (bought before launch); until then the external scheduler covers them.
- (−) Cron delivery latency up to 5 min for retried emails (first attempt is sent right after commit via `after()`).
