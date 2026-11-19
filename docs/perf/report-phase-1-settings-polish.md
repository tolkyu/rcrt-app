# Settings visual polish — performance review

Date: 2026-11-02. Scope: T6 slice 12, settings-admin wireframe §8 P1–P5, UI-05, SHOT-01..03, PERF-04/05.

## Changes and impact

| Item                     | Review                                                                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1: drawer menu position | Measures the identity block and trigger once when the menu opens. No polling, resize/scroll observer or render-time layout read. The offset is local to the lazy user drawer.                                             |
| P2: mobile button order  | CSS class changes preserve DOM order and desktop layout. No new JavaScript or component state.                                                                                                                            |
| P3: full email wrapping  | `EmailText` is a small pure component: one `lastIndexOf`, two slices and a native `<wbr>`. No package, effect, measurement or per-row query. It is imported by the users list and the existing lazy drawer/dialog chunks. |
| P4: Ukrainian wrapping   | Removes one global automatic-hyphenation rule. No JavaScript; text now wraps at whole words, with existing overflow fallbacks for long user values.                                                                       |
| P5: screenshot geometry  | Shared viewport-stretch/capture logic is test-only. It adds no production route import or runtime behavior.                                                                                                               |

The list data path, query keys, RSC hydration, server authorization and database statements are unchanged. No new N+1 or client data waterfall is introduced. No schema/index change is needed, so the preceding actor-filter query-plan evidence remains applicable to that feature without rerunning SQL.

## Budgets

| Budget                                  | Result                                                                                                                                                                                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial route JS ≤180 kB gzip (PERF-04) | Passed on the final production app build: audit **179.63 kB**, users **178.28 kB**, priorities **178.01 kB**, shell **167.28 kB**; every route passes. Compared with the actor checkpoint, users adds 0.06 kB and no route exceeds its budget. |
| API/service P95 (PERF-02)               | Not remeasured; this slice changes no endpoint/query. No new claim of load acceptance.                                                                                                                                                         |
| LCP / INP / CLS (PERF-03)               | Not measured in this bounded review; T8 remains open. Screenshot correctness does not establish Web Vitals.                                                                                                                                    |
| Query structure (PERF-05)               | Unchanged; no new requests or per-row database access.                                                                                                                                                                                         |

No performance blocker found. The production bundle gate passed; the audit route still has little spare capacity. Final screenshot-helper changes affect tests only and do not change the production graph.
