# Performance — position catalog `/vacancies/positions` (V2a T3)

Local production build (`next start`) on the demo DB, Admin aal2, Chromium. Mobile = 390×844, 4× CPU, 150 ms, 1.6 Mbps. Event timing is a lab proxy, not field INP. Hosted numbers are unmeasured.

## Verdict

No budget blocker at realistic volume (~100 positions). One defect found and fixed; the two scale risks for the cap (300/vertical) were then fixed too (follow-ups #1, #6, see «Single layout»).

## Budgets

| Budget                         | Measured                                                                        | Status                                                          |
| ------------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| PERF-04 initial JS ≤ 180 kB gz | `/vacancies/positions` 170.16, `/vacancies` 166.74                              | Pass                                                            |
| Lazy dialogs                   | 3 `next/dynamic` chunks (7.1 + 6.2 + 1.7 kB gz), not in the initial set         | Pass                                                            |
| PERF-02 list API P95 < 150 ms  | `status=all` 6.5 ms (108 rows), 13.2 ms (600 rows)                              | Pass                                                            |
| PERF-05 one query per list     | One statement; open-count subplan runs only for returned rows                   | Pass                                                            |
| Desktop, 108 rows              | LCP 148 ms, CLS 0, TBT 0, event timing 16–40 ms                                 | Pass                                                            |
| Mobile, 108 rows               | LCP 768 ms, CLS 0, TBT 78 ms, event timing 24–136 ms                            | Pass                                                            |
| Desktop, 600 rows (cap)        | LCP 228 ms, CLS 0, event timing 32–80 ms (single layout)                        | Pass                                                            |
| Mobile, 600 rows (cap)         | LCP 768 ms, CLS 0, event timing 136–224 ms (single layout + content-visibility) | Marginal: toggle 224 ms vs 200 ms lab budget at the 2 × 300 cap |

## Defect fixed

`gcTime: 0` + hydrate option: gc timer fired between hydration and subscribe → skeleton flash, redundant `GET /positions?status=all`, CLS 0.032 desktop / 0.044 mobile. Fix: default gcTime, `removeQueries(['positions'])` on unmount (keeps SEC-POS-10: inactive names leave the client with the page); regression tests in `tests/unit/positions-query.test.ts`, `positions-view.test.ts`.

| 600 rows, desktop               | Before | After  |
| ------------------------------- | ------ | ------ |
| Client `GET /positions` on load | 1      | 0      |
| LCP median                      | 456 ms | 236 ms |
| CLS                             | 0.0316 | 0      |

## Single layout (follow-ups #1 and #6, done)

Only the table (md+) or only the cards are rendered: the server picks the first-paint layout from the User-Agent (phones → cards), the client then follows `matchMedia('(min-width: 768px)')` through `useSyncExternalStore`; no skeleton, SSR HTML contains the list and 0 client `GET /positions` always; CLS 0 holds when the hint matches the viewport. A wrong hint (narrow desktop window, phone landscape ≥ 768 px, iPad mini 744 px) is corrected right after hydration with one frame of the other layout (possible layout shift, covered by a unit test that hydrates a `table` hint on a phone viewport without a mismatch warning). `Sec-CH-UA-Mobile` would be a sturdier future hint than User-Agent sniffing. Cards use `content-visibility: auto` with `contain-intrinsic-size: auto 10rem`. List limit is now `POSITION_PER_VERTICAL_LIMIT * 10` (3000). Same throw-away Playwright spec before/after, production build, medians of 3 runs (CLS, TBT and event timing = worst run; TBT here sums all long tasks from navigation, so it is not comparable with the older 316 ms figure):

| Scenario         | Layout      | DOM nodes | LCP      | CLS | TBT      | Toggle event | Dialog open |
| ---------------- | ----------- | --------- | -------- | --- | -------- | ------------ | ----------- |
| Desktop 108 rows | both        | 3,766     | 184 ms   | 0   | 0        | 24 ms        | 24 ms       |
| Desktop 108 rows | single      | 2,020     | 152 ms   | 0   | 0        | 24 ms        | 56 ms       |
| Mobile 108 rows  | both        | 3,760     | 780 ms   | 0   | 428 ms   | 112 ms       | 72 ms       |
| Mobile 108 rows  | single + cv | 1,917     | 700 ms   | 0   | 194 ms   | 64 ms        | 48 ms       |
| Desktop 600 rows | both        | 19,920    | 276 ms   | 0   | 140 ms   | 96 ms        | 48 ms       |
| Desktop 600 rows | single      | 10,281    | 228 ms   | 0   | 76 ms    | 80 ms        | 32 ms       |
| Mobile 300 rows  | single + cv | 4,995     | 780 ms   | 0   | 501 ms   | 128 ms       | 96 ms       |
| Mobile 600 rows  | both        | 19,912    | 1,032 ms | 0   | 2,566 ms | 600 ms       | 296 ms      |
| Mobile 600 rows  | single + cv | 9,795     | 768 ms   | 0   | 882 ms   | 224 ms       | 200 ms      |

Desktop dialog-open 24 → 56 ms at 108 rows is within run noise of the 16 ms event threshold. Remaining risk: mobile toggle at 600 rows is 224 ms (> 200 ms lab budget); memoised rows with stable handlers or TanStack Virtual per group would remove it, not needed below ~500 rows. `content-visibility` estimate of 10 rem per card can shift scroll position slightly when a far card first renders; no CLS was recorded without scrolling.

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

| #   | Priority          | Item                                                                                                                                            |
| --- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Done              | One layout instead of both: DOM 20k → ~10k at 600 rows                                                                                          |
| 2   | Low               | `content-visibility: auto` added on cards; memoised rows / virtualisation per group only if mobile toggle > 200 ms matters (224 ms at 600 rows) |
| 3   | Low               | Add the route to `tests/perf/foundation.spec.ts` (zero client `/positions` requests on load, CLS < 0.05); needs positions in PERF-01 seed       |
| 4   | Low               | Partial index above with V2b migration                                                                                                          |
| 5   | Low, pre-existing | Move 30 kB `settings` messages out of the shell provider (~8 kB gz on every route)                                                              |
| 6   | Done (SEC-POS-09) | `POSITION_LIST_LIMIT = POSITION_PER_VERTICAL_LIMIT * 10`; integration test lists 4 × 300 rows without a 500                                     |

Gaps: no Lighthouse or k6 for this route; write path under load unmeasured (rate-limited to 30/min/user).
