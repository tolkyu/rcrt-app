# T6 audit viewer — performance review

Date: 2026-11-01. Scope: STORY-AUD-2, PERF-02/04/05; first audit-viewer slice.

## Structural checks

| Check | Evidence / result |
|---|---|
| Initial data | RSC prefetch + `HydrationBoundary`; identical client query key; shared 30 s stale time avoids immediate duplicate fetch |
| List SQL | One joined query; projects summary columns, excludes JSON payloads; no count query or per-row requests |
| Pagination | Keyset `(occurred_at, id) DESC`; default 50, API maximum 100, fetches one extra row |
| Detail | Two independent bounded queries in parallel; no list-dependent waterfall |
| Client growth | `auditQuery` now sets `maxPages: 2`: at most two 50-row pages; older loads evict earlier pages. Desktop/mobile markup stays bounded |
| Full wireframe | TanStack Virtual and navigation through retained earlier pages remain outside this bounded first slice; do not claim the entire wireframe complete |

## Query-plan diagnostic

Local PostgreSQL 17.11, temporary synthetic tables only: 200,000 audit rows, 10,000 users, 10 verticals. Audit indexes copied from the current schema; tables analyzed. Entire transaction rolled back. No application data was changed. The real test audit table was empty, so its plan cannot establish performance at scale.

| Query | Single execution | Plan evidence |
|---|---:|---|
| Original label joins (`entity_user.id::text = entity_id`) | 89.326 ms | 510,000 user rows rejected by join filter for 51 results |
| Indexable UUID label joins | 0.279 ms | User/vertical primary-key lookups; 51 result rows |
| Rare action without action index | 10.513 ms | 50,949 rows discarded to return 51 matches |
| Rare result without result index | 7.042 ms | 50,949 rows discarded to return 51 matches |

These are diagnostic samples, not API/service P95 or a production benchmark. The join comparison used valid synthetic UUIDs. Production must additionally guard malformed text IDs inside the `CASE` containing the cast:

```sql
entity_user.id = CASE
  WHEN audit_log.entity_type = 'user'
   AND audit_log.entity_id ~ '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
  THEN audit_log.entity_id::uuid
  ELSE NULL::uuid
END
```

The same pattern applies to verticals. Keeping the UUID column uncast allows its primary-key index; placing the text cast inside `CASE` prevents invalid legacy/future IDs from throwing.

## Remediation verified in source

- Repository label joins now compare indexed UUID columns against a regex-guarded UUID `CASE`; malformed text IDs do not throw.
- Migration `0006_audit_viewer_indexes.sql` adds action/result/entity-type indexes ending in `(occurred_at DESC, id DESC)` and adds `id DESC` to the entity-specific index. Database engineer reports fresh PG17 migration, Drizzle check and repeat no-drift generation passed.
- Client retained pages are bounded as agreed above. Earlier loaded pages are displaced; full virtualization/backward-page navigation remains a later UX improvement.

## Initial JavaScript gate

Final clean production build succeeded. Read-only inspection of its `.next` manifest and level-9 gzip per file (the `@size-limit/file` algorithm) confirms the size gate remains red:

| Route | Initial gzip | 180 kB gate |
|---|---:|---|
| App shell / home | 188.02 kB | Fail |
| Settings | 190.90 kB | Fail |
| Audit | 206.06 kB | Fail |
| Verticals | 194.66 kB | Fail |
| Profile | 195.30 kB | Fail |
| Public/auth routes | 102.97–175.35 kB | Pass |

Audit adds 18.04 kB net over the app shell. The shell/provider files have no changes in this slice; the base shell excess is inherited, while the audit route also exceeds the gate. Do not claim PERF-04 passed. T8 must resolve these route budgets before phase completion. The next small task, before users/settings expansion, is shared-shell JavaScript optimization.

Applied bounded import optimizations: moved audit validation schemas out of the initial client graph, added `optimizePackageImports: ['radix-ui']`, and dynamically loaded `VerticalNameDialog`. Audit fell from the first inherited 237.86 kB checkpoint to 208.74 kB after the schema fix, then to 206.06 kB; verticals fell from 227.19 to 194.66 kB. These improvements do not satisfy the 180 kB gate yet.

`scripts/client-size-config.mjs` correctly unions each page with its ancestor layout/template chunks and deduplicates files. The earlier Next.js CLI figure (audit ~168 kB) was smaller because its `getJsPageSizeInKb` sums only the page entry plus `/_app`; it omits App Router ancestor entries. Dropping ancestor chunks would hide real initial dependencies, so the script and 180 kB budget remain unchanged.

The earlier build's largest shell chunks included Radix primitives (~23.4 and ~15.2 kB gzip), shared utilities/query runtime (~12.6 kB), next-intl (~12.1 kB), and base framework (~102.7 kB). Further interaction-only shell component splitting needs its own small implementation/review cycle; no broad shell refactor was added to this audit slice.

## Budgets and limits

| Budget | Status |
|---|---|
| List P95 <150 ms, detail <100 ms (PERF-02) | Not measured by this diagnostic; retained for T8 load tests |
| Initial JS ≤180 KB gzip (PERF-04) | Fail on current build; exact route measurements above; T8 follow-up |
| Desktop/mobile LCP, INP, CLS (PERF-03) | Not measured; production browser checks remain T8 |
| No N+1 / indexed filters (PERF-05) | Query structure and corrected index definitions pass source review |

Final verification must use the corrected repository and migrated indexes; synthetic baseline timings alone do not establish the finished slice's budgets.
