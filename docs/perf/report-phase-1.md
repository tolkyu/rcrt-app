# Phase 1 performance closure

Scope: Foundation screens and tables only (PERF-02..05, C03/C06). The Phase 2–3 candidate/vacancy/200k-event seed, regional Supavisor verification and production field telemetry remain their documented later-phase gates.

## Reproducible gates

| Gate                          | Harness and workload                                                                                                                                                                                                                                                               | Budget                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Production JavaScript         | Existing `perf:size`, ancestor layout + route chunks, gzip                                                                                                                                                                                                                         | Every route ≤180 kB                                    |
| Authenticated API server time | `tests/perf/foundation.spec.ts`; real local Supabase session + app-verified Admin TOTP; five batches warmup, 40 batches ×4 concurrent successful reads per endpoint; `Server-Timing: app;dur=` covers route factory context, authorization, validation, database and serialization | Lists <150 ms P95; details <100 ms P95                 |
| Actual mutation               | 5 warmups +20 measured audited profile-name writes; original name restored after every sample and in `finally`                                                                                                                                                                     | <120 ms server P95                                     |
| Production rendering          | Profile, users, verticals, priorities, audit; three fresh browser contexts per route/device, median native LCP and worst native CLS                                                                                                                                                | Desktop LCP <1200 ms, CLS <0.05; mobile <2500 ms, <0.1 |
| Lab interaction               | Trusted input opens the lazy theme menu and changes theme; native Event Timing maximum; bounded audit also loads 100 real rows and opens/closes a detail                                                                                                                           | Desktop <100 ms; mobile <200 ms                        |
| Lighthouse in CI              | Pinned Lighthouse 13.6.0 Node API, authenticated built screens, three cold-cache navigations per screen/device; median LCP and CLS, numeric/runtime/redirect validation; TBT recorded diagnostically                                                                               | Existing desktop/mobile LCP and CLS budgets            |
| Warm route transition         | Real settings links, prefetched and warmed; 2 warmups +10 measurements; click dispatch → target h1 in DOM → next paint                                                                                                                                                             | P95 <200 ms                                            |

Run the existing production build/size gate, then `pnpm perf:runtime` (standalone Playwright configuration). JSON measurements are written to gitignored `tests/perf/results/foundation.json` without user identifiers, names, bodies, cookies or tokens. Profile writes create legitimate append-only audit/events; the harness never deletes audit history.

Mobile rendering uses Chromium CDP 150 ms latency, 1.6 Mbit/s download, 750 Kbit/s upload and 4× CPU slowdown at 390×844. Desktop uses 1440×900 and the host CPU. Mobile warm navigation tests cached browser/application data at 4× CPU; network latency is excluded from the perceived warm-cache check. Results characterize this local machine, not a certified reference mid-range laptop or hosted Frankfurt deployment.

Native Event Timing suppresses events below 16 ms; zero denotes no observed ≥16 ms event, not a literally zero-duration interaction. The maximum of scripted events is a **lab interaction proxy**, not field INP. Lighthouse TBT is a diagnostic, with no invented score or TBT threshold. Field telemetry remains a pre-launch follow-up.

`pnpm perf:check` runs build → size → native runtime → `perf:lighthouse`. Lighthouse uses the existing Playwright Chromium executable, an ephemeral persistent profile under ignored `.cache`, a loopback-only debugging port and the application's real Admin/TOTP sign-in. HTTP cache is cleared before each navigation while authentication cookies remain; no auth bypass or downloaded browser is added. Its DevTools throttling matches the native viewport/4G/CPU profiles. Every audited final URL must still identify the requested protected screen.

Only compact metric/error summaries are written to `tests/perf/results/lighthouse/`, already included in the CI artifact path. Raw Lighthouse results, request headers, screenshots, browser profiles and network traces are not uploaded. Nested cleanup attempts to remove the browser profile even if browser shutdown or summary writing fails. This follows the official [authenticated-page guidance](https://github.com/GoogleChrome/lighthouse/blob/main/docs/authenticated-pages.md) and [Node configuration interface](https://github.com/GoogleChrome/lighthouse/blob/main/docs/configuration.md).

## C06 bounded rendering disposition

The audit query retains exactly two cursor pages of 50 records, so rendering is bounded at 100 records and 100 row elements. A media-query subscription renders one responsive presentation at a time; it updates on resize and uses a matching server/hydration snapshot. Existing E2E verifies both paging directions, row/scroll anchoring, focus, failed loads, refetch and filter reset. New j/k navigation operates only within this retained window, follows the open sheet, respects editing/modifier keys and never fetches another page.

CLAUDE/performance role requires TanStack Virtual for lists **over 100 rows**. Adding a virtualizer to this already bounded window would consume the remaining initial-JS headroom and complicate bidirectional scroll/focus anchoring. Full virtualization is therefore unnecessary for this window, conditional on the measured 100-row interaction gate and independent review. Reassess before increasing the window. The users list uses its separately reviewed lazy virtualizer above 100 loaded rows.

## Measurements

Isolated production runtime run completed **2026-11-06 09:50:28 Europe/Kyiv (07:50:28 UTC): 5/5 tests passed**. Evidence: `.cache/resume-runtime.log`, `tests/perf/results/foundation.json` and per-test JSON artifacts. This run uses the current production build and local Foundation demo database; the PERF-01 large-volume seed remains deferred.

The same production build passes every initial-JavaScript gate (≤180 kB gzip): users **166.10 kB**, audit **166.41 kB**, and the largest route, login, **179.32 kB**. Retain the size gate: login has only 0.68 kB headroom.

| API operation                          | Server P95, ms | Budget, ms | Result |
| -------------------------------------- | -------------: | ---------: | ------ |
| Users list                             |          34.15 |       <150 | PASS   |
| Audit list                             |          35.47 |       <150 | PASS   |
| Settings verticals                     |          42.57 |       <150 | PASS   |
| Priority vertical tabs                 |          22.99 |       <150 | PASS   |
| Vertical Team Lead priorities          |          25.60 |       <150 | PASS   |
| Auth sessions                          |          22.08 |       <150 | PASS   |
| Current profile (`GET /me`)            |          30.79 |       <100 | PASS   |
| User detail                            |          22.02 |       <100 | PASS   |
| Audited profile mutation (`PATCH /me`) |          40.61 |       <120 | PASS   |

Each read P95 uses 160 successful samples under four concurrent requests after warmup; mutation P95 uses 20 actual writes after warmup. These are route-factory server durations, excluding network, middleware and browser time.

| Screen     | Desktop LCP, ms | Mobile 4G LCP, ms | Desktop interaction, ms | Mobile interaction, ms | CLS, both devices |
| ---------- | --------------: | ----------------: | ----------------------: | ---------------------: | ----------------: |
| Profile    |             472 |               952 |                      48 |                    160 |                 0 |
| Users      |             220 |              1100 |                      48 |                    120 |                 0 |
| Verticals  |             508 |              1096 |                      48 |                    112 |                 0 |
| Priorities |             472 |              1056 |                      48 |                    120 |                 0 |
| Audit      |             380 |              1056 |                      64 |                    128 |                 0 |

LCP is the median of three cold-context runs per screen/device; interaction and CLS are the worst observed values across those runs. All five screens meet their device-specific budgets. The highest individual LCP sample was 688 ms desktop and 1184 ms mobile. The slowest scripted route interaction was 64 ms desktop and 160 ms mobile; these are lab samples, not field INP.

| Bounded/warm check                                    |   Desktop |    Mobile | Budget/result                               |
| ----------------------------------------------------- | --------: | --------: | ------------------------------------------- |
| Audit retained records / actual row elements          | 100 / 100 | 100 / 100 | ≤100 actual row elements: PASS              |
| Audit total document elements at 100 rows             |      1301 |       915 | Recorded diagnostic, no invented DOM budget |
| Audit scripted interaction maximum                    |     48 ms |    168 ms | <100 / <200 ms: PASS                        |
| Warm settings navigation P95, 10 measured transitions |   65.7 ms |  118.5 ms | <200 ms: PASS                               |

Full settings-link prefetch and rendering only the active audit presentation resolve the measured navigation and duplicate-row problems. The users virtualizer's 10k-row and shrinking-list regression scenarios passed on both viewports in the separate correctness run reported by QA; this is browser rendering evidence, not a 10k-user database load test.

## Lighthouse measurements

The isolated Lighthouse **13.6.0** run completed **2026-11-06 10:00:00 Europe/Kyiv (08:00:00 UTC): 10/10 tests passed**, covering 30 cold-cache navigations. Evidence: `.cache/resume-lighthouse.log` and `tests/perf/results/lighthouse/summary.json`. Every navigation retained the authenticated target route; all numeric/runtime/redirect checks passed.

| Screen     | Desktop median LCP, ms | Mobile 4G median LCP, ms | Desktop median TBT, ms | Mobile median TBT, ms | Median CLS, both devices |
| ---------- | ---------------------: | -----------------------: | ---------------------: | --------------------: | -----------------------: |
| Profile    |                193.048 |                 1158.323 |                      0 |               258.897 |                        0 |
| Users      |                474.312 |                 1104.518 |                      0 |               208.956 |                        0 |
| Verticals  |                247.753 |                 1053.552 |                      0 |               133.267 |                        0 |
| Priorities |                304.067 |                 1070.430 |                      0 |               145.847 |                        0 |
| Audit      |                521.692 |                 1190.557 |                      0 |               387.405 |                        0 |

All median LCP/CLS results meet the unchanged desktop <1200 ms/<0.05 and mobile <2500 ms/<0.1 budgets. TBT is recorded as a loading diagnostic without a new threshold; it is not INP. The highest individual LCP sample was 573.850 ms desktop and 1220.558 ms mobile; the highest mobile TBT sample was 515.568 ms.

**Performance verdict: APPROVED for local Foundation C03/C06.** Fresh production JavaScript, authenticated API P95, native rendering/interaction, bounded audit/warm navigation and Lighthouse gates all pass. Audit window virtualization is unnecessary at its enforced 100-record/100-row limit, supported by the measured interaction results above. The mobile 100-row interaction retains 32 ms headroom. The orchestrator owns the separate phase-quality, accessibility, screenshot and review gates. No hosted-region, pooler, large-volume or field-INP certification is implied.

## Audit polish dispositions

- G13: native controls retain their platform keyboard/mobile picker semantics and now share the chevron/visual alignment with custom triggers. Replacing the three native controls with Radix Select remains optional polish because it adds initial JavaScript and changes the existing interaction contract.
- G14/15/17/18/31: stable desktop columns with an internal horizontal scroller, Ukrainian count plurals, chips for non-default filters, lifecycle action order and full-width mobile view toggle. Horizontal scroll keeps the specified columns readable within the settings frame.
