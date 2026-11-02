# T6 user invite actions — performance review

Date: 2026-11-01. Scope: ROLE-05, D70, STORY-ROLE-05-3, PERF-04/05. Resend, revoke and re-invite in the existing user drawer.

## Static load graph

| Check | Result |
|---|---|
| Actions and confirmation dialogs | `UserInviteActions` and Radix `AlertDialog` are imported by the lazy `UserDrawer`, not the initial users list |
| Drawer loading | Existing dynamic import; prefetched only on row pointer/focus intent, mounted when the URL selects a user |
| Validators | User detail types are type-only imports; mutation response validators use dynamic schema imports |
| Shared audit additions | Three action-name strings; no schema/validation dependency added to the audit constants |
| Initial data | Existing RSC list/vertical/detail prefetch remains parallel; no new page-load API call |

Opening a drawer through its URL legitimately loads its interaction code. The initial list-route budget does not measure the complete opened-drawer experience.

## Mutation and query work

- One action submits one POST. Pending state disables repeat actions until invalidation/refetch settles.
- Invalidation runs concurrently for the selected user key (including that user's event history), users-list namespace and audit-list namespace. Other user-detail keys, profile/session queries and unrelated settings are unaffected. Inactive queries are marked stale rather than immediately refetched by default.
- SQL work is a fixed sequence per target user. Current roles and vertical validity are loaded in batches, without one request/query per role. No new list query or N+1 lookup is introduced.
- Email delivery happens after the write transaction commits, so provider latency does not extend the transaction/row lock. The HTTP mutation still awaits delivery; no mutation-P95 claim is made here.
- Resend/revoke target the one pending invite covered by `user_invite_pending_uq`; reinvite locks the user through its primary key. Event/audit writes remain in the transaction.

## Invite-history index and existing scale follow-up

| Item | Limit / concrete follow-up |
|---|---|
| Retained users/history pages | These existing infinite queries have no `maxPages`. A mutation can refetch every retained page of an active matching query. Namespace scope is targeted, but request count is not constant. Add bounded retention or virtualization with explicit earlier-page navigation before large-directory acceptance |
| New historical invite lookup | Migration `0008_user_invite_latest_index.sql` adds the full expression index below; both the new query and existing user-detail lateral lookup have identical predicate/order. Fresh PostgreSQL 17 migration and contract/EXPLAIN checks pass. Application to the existing demo DB is blocked by its prior migration-history divergence, tracked in `docs/PROGRESS.md` → Gaps («Local demo DB migration ledger») |

```sql
CREATE INDEX user_invite_latest_idx ON app.user_invite
  (user_id, (status = 'PENDING') DESC, created_at DESC, id DESC);
```

This allows a direct first-row lookup for either consumer. An index on `(user_id, created_at DESC, id DESC)` would still sort that user's history because the leading pending-first order is missing. No included payload columns are needed. The database engineer verified the index definition and a plan without Sort with sequential/bitmap scans disabled; that is a capability check, not a production latency benchmark.

No production change, migration, database reset or load test was performed by this review.

## Measurements

| Budget | Evidence / status |
|---|---|
| Initial route JS ≤180 kB gzip (PERF-04) | Pass on final production build: users 177.79 kB, audit 179.59 kB, shell 166.42 kB; all routes pass the unchanged gate. Audit headroom remains about 0.41 kB |
| Mutation P95 <120 ms (PERF-02) | Not measured; local functional tests are not load-test evidence |
| Desktop/mobile Web Vitals (PERF-03) | Not measured in this bounded slice; T8 remains responsible |
| No new N+1 / indexed filters (PERF-05) | No per-item query loop; new index migration verified on a fresh DB. Existing local migration-history divergence blocks demo deployment; retained-page caveat above remains |

Use the existing `perf:size` gate, including ancestor layout/template chunks, without changing the 180 kB limit. Do not infer initial route size from the smaller Next.js CLI page-only figure.
