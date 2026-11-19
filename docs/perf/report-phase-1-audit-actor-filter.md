# Audit actor filter — performance review

Date: 2026-11-02. Scope: T6 slice 11, STORY-AUD-2, PERF-04/05; subsequent UX polish P1–P5 in `settings-admin.md` §8.

## Loading and rendering

| Check              | Result                                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Actor picker       | Closed filter is a small button. `AuditActorCombobox`, its Popover and search schema are a dynamic interaction chunk; pointer/focus preloads it. Opening runs the query, closing disables it.                                                    |
| Audit detail       | `AuditRecordSheet` is dynamically imported, keeping it outside initial route JS. A post-hydration preload requests it early; it is deferred from initial JS, not absent from first-page network traffic.                                         |
| Initial data       | Audit RSC prefetch and optional selected-actor label lookup run in parallel. The audit list hydrates its existing query key, and the actor label is supplied directly, avoiding a label-fetch waterfall.                                         |
| Search             | 200 ms debounce, 60 s query freshness, cursor pagination, `limit + 1` capped at 51 database rows. The DTO contains only id, name and active flag.                                                                                                |
| Search transitions | Previous query data is not selectable while input/debounced query differ or placeholder data is shown. Old-query pagination is suppressed then.                                                                                                  |
| Rendering bound    | Pages remain in memory and loaded options remain in the DOM. Current demo/staff size is small; there is no virtualization or loaded-page cap. This does not establish 10k-user interaction performance; that remains a large-directory/T8 check. |

No per-option database request or N+1 list loading was introduced. The selected actor adds at most one bounded primary-key lookup to a deep-linked audit page.

## Database evidence

Read-only `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` was run against the loopback-validated local runtime database, using SQL captured from the actual repository functions. No fixtures or business data were written. The demo contained 13 users, 12 activated; the system-filter result contained 21 rows.

| Query                            | DB execution | Observed plan                                                                                                        |
| -------------------------------- | -----------: | -------------------------------------------------------------------------------------------------------------------- |
| First actor page, limit 20       |     0.066 ms | Limit → Sort → sequential scan of `app_user`; `activated_at IS NOT NULL` filter                                      |
| Actor search `q=demo`, limit 20  |     0.079 ms | Limit → Sort → sequential scan; escaped bound ILIKE pattern on name/email                                            |
| Actor cursor page, limit 20      |     0.063 ms | One cursor-key initplan, then Limit → Sort → sequential scan; no per-row query                                       |
| Audit `actorId=system`, limit 50 |     0.414 ms | Limit → Sort → three hash joins for labels; audit scan filters NULL actor and excludes anonymous `auth.login_failed` |

The planner chooses sequential scans for this tiny dataset. `app_user_list_idx` supports the actor ordering/keyset; `audit_log_actor_idx` supports NULL-actor filtering. The substring ILIKE predicate is not backed by a trigram index; this is the existing staff-directory search limitation, not a demonstrated large-data speed guarantee. No index or schema change is justified by these seed-size plans alone.

These single executions measure database executor time only. They are not endpoint P95, pooled/hosted latency or concurrent-load measurements.

## Budgets and follow-up

| Budget                                               | Status                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial JS ≤180 kB gzip (PERF-04)                    | Pass in the orchestrator's production build after the reload/stale-option fixes: audit **179.64 kB**, users **178.22 kB**, priorities **178.01 kB**, shell **167.28 kB**; all routes pass. Audit has **0.37 kB** headroom. Recheck the final actor-URL UUID normalization build and the later polish build. |
| Endpoint list P95 <150 ms / detail <100 ms (PERF-02) | Not measured under load in this slice.                                                                                                                                                                                                                                                                      |
| Desktop/mobile LCP, INP, CLS (PERF-03)               | Not measured by this review; T8 remains open.                                                                                                                                                                                                                                                               |
| Query structure (PERF-05)                            | One actor statement per page, one optional selected-label lookup, existing list indexes reused. No N+1.                                                                                                                                                                                                     |

P1 menu offset is measured only when opening the menu; avoid a resize/scroll observer for this requirement. P2 button order and P4 hyphenation are CSS-only. P3 `EmailText` should remain a small code-native component without a package dependency. P5 viewport stretching belongs only to screenshot tooling and does not alter production rendering. Re-run the initial-JS gate after those app changes.

No performance blocker found in the bounded actor-filter slice. Do not infer completion of T8 or large-directory acceptance from the seed-size query plans.
