# Mobile polish — performance review

Date: 2026-11-04. Scope: gallery step C, UX-G-07/08/09/12, STORY-ROLE-05-8, STORY-SEC-AUTH-5, PERF-04/05.

**Status: APPROVED.** Static review found no performance blocker; the orchestrator's fresh production build and all initial-JS gates passed.

| Area                | Evidence                                                                                                                                                                                                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile filter sheet | `users-view.tsx` loads the sheet only when opened, with raw hover/focus preloading. The actual import uses the existing bounded `loadOrReload` recovery and a translated loading status. Opener ref, dialog attributes and explicit close-focus restoration are retained. No new dependency.              |
| Filter data path    | Repeated values are validated, deduplicated, sorted and capped at the existing ten-value API limit. RSC and client derive matching query keys from the canonical filters; URL/API serialization preserves every selected value. The sheet prevents selecting an eleventh value.                           |
| Request cost        | The sheet reuses the already-prefetched vertical list. Draft checkbox changes stay local until Apply. Existing search debounce, query abort signal and cursor pagination remain intact. Parallel RSC prefetch, server authorization and database statements are unchanged; no new per-row request or N+1. |
| Other changes       | Navigation promotion and larger touch targets add no data loading. MFA exit links reuse existing routes; an in-flight TOTP request is aborted on unmount and cannot redirect after cancellation.                                                                                                          |

Measurements supplied by the orchestrator from `pnpm build` and `pnpm perf:size`; values include ancestor-layout chunks, unlike the Next CLI route summary.

| Initial JavaScript | gzip kB | Limit kB |
| ------------------ | ------: | -------: |
| Users              |  179.15 |      180 |
| Audit              |  179.28 |      180 |
| Priorities         |  178.11 |      180 |
| Verticals          |  174.17 |      180 |
| Settings index     |  169.53 |      180 |
| Shell              |  167.35 |      180 |
| Profile            |  174.99 |      180 |
| Login              |  172.34 |      180 |
| Invite             |  163.15 |      180 |
| Confirmation       |  162.37 |      180 |
| MFA setup          |  176.01 |      180 |
| MFA verify         |  175.70 |      180 |
| Session expired    |  159.33 |      180 |
| Not found          |  103.40 |      180 |

Users increased by 0.70 kB from 178.45; audit by 0.09 kB from 179.19. Their remaining headroom is 0.85 and 0.72 kB respectively, so future changes still need the actual all-route gate.

API P95 and LCP/INP/CLS were not remeasured in this bounded review. The slice changes no endpoint or SQL statement; broader T8 load and Web Vitals acceptance remains open.
