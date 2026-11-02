# T6 role editing — performance review

Date: 2026-11-02. Scope: ROLE-01, STORY-ROLE-01-1/01-2, D40/D45, PERF-04/05.

## Load graph and rendering

| Check | Result |
|---|---|
| Role editor | `UserDrawer` dynamically imports `EditRolesDialog`; pointer/focus intent preloads it. The drawer itself remains lazy. |
| Shared matrix | `RoleMatrix` replaces the invitation dialog's duplicate matrix; both consumers are interaction chunks. No new initial list import. |
| Response schemas | Mutation validators are dynamically imported; user detail types are type-only imports. |
| Initial data | Existing RSC list/vertical/selected-detail prefetch remains parallel with query hydration. Opening the editor reuses the vertical query cache. |
| Role diff | Set-based comparison is linear in assignments; editor requests are capped at 50 assignments. No memoization added without profiling. |
| Mutation UI | Drawer and cached list chips update optimistically and roll back on failure. List rollback restores only the edited user's roles, preserving concurrent changes to other users. Pending-mutation browser coverage verifies the update and rollback. |

Invalidation covers the selected user/history, users lists and audit lists concurrently; editing oneself also invalidates `me`. As in previous slices, infinite queries can retain multiple pages, so an active matching query can refetch every retained page. Large-directory virtualization and bounded page retention remain T6/T8 follow-up work.

## Database work

- No new list query or per-user query loop. The last-active-Admin flag is computed inside the existing single-user detail query.
- User/role lookups and deletion use the user primary key and existing `user_role_uq(user_id, role, vertical_id)` index prefix. Vertical validation and role insertion are batched.
- Role events require one insert per changed assignment, within the transaction; this is bounded mutation work, not an N+1 list pattern.
- The D45 membership advisory lock is acquired only for ADMIN removal; other role edits serialize only on their target user/invite. `NO KEY UPDATE` permits actor/creator foreign-key checks during edits of different users.
- The other-active-Admin `EXISTS` checks `role = 'ADMIN'` across users; the existing role index leads with `user_id`, so it does not establish an efficient role-only scan. No new list filter needs an index in this slice. Check the actual plan and latency at large-directory acceptance before adding a role-leading/partial index.

## Measurements and limits

The orchestrator supplied these results from the production build and unchanged `pnpm perf:size` gate for this working tree, including ancestor layout chunks.

| Budget | Result |
|---|---|
| Initial JS ≤180 kB gzip (PERF-04) | Pass: users **178.06 kB**, audit **179.94 kB**, shell **166.59 kB**; all routes pass. Audit has only **0.06 kB** headroom. |
| Mutation P95 <120 ms / card detail P95 <100 ms (PERF-02) | Not measured; functional concurrency tests do not establish latency under load. |
| Desktop/mobile Web Vitals (PERF-03) | Not measured in this bounded slice; T8 remains responsible. |
| Query structure (PERF-05) | No new N+1 list loading; existing target-key indexes reused. No `EXPLAIN ANALYZE` or large-directory benchmark was run by this review. |

No performance blocker found for this bounded slice. Full T8 performance acceptance remains open; do not infer its completion from the bundle gate.
