# Performance — position catalog `/vacancies/positions` (V2a T3)

Local production build (`next start`) on the demo DB, Admin aal2, Chromium. Mobile = 390×844, 4× CPU, 150 ms, 1.6 Mbps. Event timing is a lab proxy, not field INP. Hosted numbers are unmeasured.

## Verdict

No budget blocker at realistic volume (~100 positions). One defect found and fixed; two scale risks recorded for the cap (300/vertical).

## Budgets

| Budget                         | Measured                                                                | Status              |
| ------------------------------ | ----------------------------------------------------------------------- | ------------------- |
| PERF-04 initial JS ≤ 180 kB gz | `/vacancies/positions` 170.16, `/vacancies` 166.74                      | Pass                |
| Lazy dialogs                   | 3 `next/dynamic` chunks (7.1 + 6.2 + 1.7 kB gz), not in the initial set | Pass                |
| PERF-02 list API P95 < 150 ms  | `status=all` 6.5 ms (108 rows), 13.2 ms (600 rows)                      | Pass                |
| PERF-05 one query per list     | One statement; open-count subplan runs only for returned rows           | Pass                |
| Desktop, 108 rows              | LCP 148 ms, CLS 0, TBT 0, event timing 16–40 ms                         | Pass                |
| Mobile, 108 rows               | LCP 768 ms, CLS 0, TBT 78 ms, event timing 24–136 ms                    | Pass                |
| Desktop, 600 rows (cap)        | LCP 236 ms, CLS 0, event timing 40–120 ms                               | INP > 100 ms at cap |
| Mobile, 600 rows (cap)         | LCP 808 ms, TBT 316 ms, event timing 272–536 ms                         | Fail INP at cap     |

## Defect fixed

`gcTime: 0` + hydrate option: gc timer fired between hydration and subscribe → skeleton flash, redundant `GET /positions?status=all`, CLS 0.032 desktop / 0.044 mobile. Fix: default gcTime, `removeQueries(['positions'])` on unmount (keeps SEC-POS-10: inactive names leave the client with the page); regression tests in `tests/unit/positions-query.test.ts`, `positions-view.test.ts`.

| 600 rows, desktop               | Before | After  |
| ------------------------------- | ------ | ------ |
| Client `GET /positions` on load | 1      | 0      |
| LCP median                      | 456 ms | 236 ms |
| CLS                             | 0.0316 | 0      |

## SQL (`listPositions`, EXPLAIN ANALYZE, PG 17.11)

Seq scan → ICU sort (≤1001 rows, ~2 ms) → per-row subplan on `vacancy_position_idx`.

| Scenario                          | Rows | Executor | Buffers |
| --------------------------------- | ---- | -------- | ------- |
| 2k vacancies, 4 verticals         | 1001 | 5.45 ms  | 3,658   |
| 30k vacancies, 4 verticals        | 1001 | 14.2 ms  | 26,275  |
| 30k + optional partial index      | 1001 | 2.7 ms   | 357     |
| 30k vacancies, 10 verticals × 300 | 3000 | 26 ms    | 35,177  |

Optional (with V2b migration): `CREATE INDEX vacancy_position_open_idx ON app.vacancy (position_id, vertical_id) WHERE deleted_at IS NULL AND status = 'OPEN';`

## Payload

| Admin, 2 verticals    | 108 rows | 600 rows |
| --------------------- | -------- | -------- |
| API JSON `status=all` | 25.9 kB  | 146.9 kB |
| Document gzip         | 45.0 kB  | 136.9 kB |
| DOM nodes             | 3,766    | 20,167   |

`positions` client messages are route-level (layout provider), 6.0 kB raw / 1.9 kB gz — no longer in the shell. Prefetch runs in one `Promise.all`.

## Follow-ups (not in this slice)

| #   | Priority                         | Item                                                                                                                                            |
| --- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Medium, before 4+ full verticals | Render one layout (table or cards) instead of both: DOM 20k → ~10k at 600 rows                                                                  |
| 2   | Low                              | Virtualise per group or `content-visibility: auto` if mobile INP > 200 ms at ~300 rows                                                          |
| 3   | Low                              | Add the route to `tests/perf/foundation.spec.ts` (zero client `/positions` requests on load, CLS < 0.05); needs positions in PERF-01 seed       |
| 4   | Low                              | Partial index above with V2b migration                                                                                                          |
| 5   | Low, pre-existing                | Move 30 kB `settings` messages out of the shell provider (~8 kB gz on every route)                                                              |
| 6   | SEC-POS-09                       | `POSITION_LIST_LIMIT` (1000) < 4 × 300 → 500 from the 4th full vertical. Simplest fix: limit = `POSITION_PER_VERTICAL_LIMIT * 10`, pair with #1 |

Gaps: no Lighthouse or k6 for this route; write path under load unmeasured (rate-limited to 30/min/user).
