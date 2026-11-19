# ADR-007 — Data loading, caching and live updates

- **Status:** Accepted — **Realtime change feed: YES** (Supabase Realtime Broadcast, private channels)
- **Date:** 2026-10-30
- **PRD:** UI-07, PERF-02/03/04, VIS-02, `CLAUDE.md` §2 (client data, live updates)

## Context

- First screen must arrive with data in HTML (LCP < 1.2 s); subsequent navigations instant (< 200 ms perceived).
- Boards (candidate kanban, vacancy grid, My tasks) are shared by several users; stale boards cause wrong drags (409s).
- No user-scoped data may be cached across users.

## Options — data loading

| Option                                                                                                  | Pros                                                                      | Cons                                                               |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **A. RSC prefetch into a per-request QueryClient → `HydrationBoundary` → TanStack Query on the client** | Data in first HTML, instant client cache afterwards, optimistic mutations | Must keep server and client query functions returning the same DTO |
| B. RSC only + `router.refresh()`                                                                        | Simple                                                                    | Every navigation re-renders on server; no optimistic UI            |
| C. Client-only fetch                                                                                    | Simple                                                                    | Waterfall, slow LCP                                                |

## Options — live updates

| Option                                                                                                                 | Pros                                                                      | Cons                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| D. No live updates (refetch on focus/interval)                                                                         | Zero infra                                                                | Boards stale up to interval; polling cost                                                                            |
| E. Realtime **Postgres Changes** on `change_feed` with RLS                                                             | Easy                                                                      | Each change × subscriber RLS check in a single thread — documented scaling limit; payload rows exposed to RLS design |
| **F. Realtime Broadcast (private channels) emitted from DB in the writing transaction via a trigger on `change_feed`** | Delivered only after commit; authorized per channel; scales; tiny payload | Channel authorization policies on `realtime.messages`                                                                |
| G. Own SSE endpoint                                                                                                    | No vendor                                                                 | Long-lived serverless connections — poor fit                                                                         |

## Decision

**A + F.**

### Server prefetch

- `getQueryClient()` wrapped in `React.cache` (one per request). Pages call `Promise.all([...prefetchQuery])` for independent data; secondary panels stream behind `Suspense`.
- Server `queryFn` calls the **service** directly (no HTTP hop); client `queryFn` calls `/api/v1`. Both return the same DTO validated by the shared Zod response schema (contract test per query key).
- No Next Data Cache for user-scoped data. Reference data (verticals, positions, rejection reasons, polygraph locations, bonus scheme names) uses `unstable_cache` with tags, revalidated by `revalidateTag` on Admin edits; filtered by scope after load (tables < 1k rows). The shared cache holds only non-sensitive fields (names/codes; never bonus amounts, BONUS-16 rewards or salaries) (DG-15).

### Client cache

| Setting                | Value                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `staleTime`            | 30 s default; reference data 10 min; statistics 5 min                                                       |
| `gcTime`               | 10 min                                                                                                      |
| Lists                  | `placeholderData: keepPreviousData` for filter/page changes                                                 |
| `refetchOnWindowFocus` | on (fallback if Realtime missed)                                                                            |
| Prefetch               | `Link` viewport prefetch + `queryClient.prefetchQuery` for card detail on hover/focus (150 ms intent delay) |

### Query keys (`lib/query-keys.ts`, factory)

| Key                                                              | Data                                  |
| ---------------------------------------------------------------- | ------------------------------------- |
| `['me']`                                                         | profile, grants summary for UI gating |
| `['tasks','me']`                                                 | My tasks inbox                        |
| `['vacancies','list',filters]` / `['vacancies','board',filters]` | vacancy grid/kanban                   |
| `['vacancy',id]` / `['vacancy',id,'funnel']`                     | card, mini-funnel                     |
| `['applications','board',filters]`                               | candidate kanban                      |
| `['application',id]` / `['application',id,'actions']`            | detail + available transitions        |
| `['candidates','list',filters]` / `['candidate',id]`             | list, card                            |
| `['timeline',entityType,id]`                                     | infinite timeline                     |
| `['calendar',range,filters]`                                     | interviews & polygraphs               |
| `['notifications','me']` / `['notifications','me','unread']`     | inbox, bell                           |
| `['bonuses','me',filters]`, `['bonuses','list',filters]`         | bonuses                               |
| `['stats',section,filters]`                                      | statistics                            |
| `['ref',name]`                                                   | reference data                        |

### Mutations

- Optimistic for stage moves (kanban drag), comments, assignments: `onMutate` snapshot + patch caches → `onError` rollback + toast (Ukrainian message by error `code`) → `onSettled` invalidate the affected keys (table below).
- Stage moves send `expectedStage` + `expectedVersion`; 409 `STALE_STATE` ⇒ rollback + refetch the board.

### Realtime change feed

- Services call `changeFeed.emit(tx, { entityType, entityId, verticalId, kind, mutationId })` (`mutationId` = per-tab random id the client sends in `X-Mutation-Id`; null for jobs) → insert into `change_feed` (in the business transaction) → `AFTER INSERT` trigger calls `realtime.send(payload, 'change', topic, private := true)`. Delivered only if the transaction commits.
- Topics: `vertical:{verticalId}` (vacancy/application/candidate changes), `user:{userId}` (notifications, tasks). Global-scope users (Admin) subscribe to every vertical topic (verticals are never deactivated).
- Channel authorization (DG-11): Realtime project setting **private channels only** (public channels disabled). RLS policy on `realtime.messages` allows `SELECT` when `realtime.topic()` is `user:<auth.uid()>`, or `vertical:<id>` where the user holds any non-Finance role in that vertical (or Admin); the role lookup is a `SECURITY DEFINER` helper with fixed `search_path`. **No `INSERT` policy** for clients — browsers can't broadcast or spoof events; only the DB trigger sends. Finance subscribes to nothing.
- Payload contains **only** `{ entityType, entityId, verticalId, kind, mutationId, at }` — opaque ids, no stage, no names, **no `actorId`** (DG-11: would reveal who works on what) (VIS-02). Receiving an id of an invisible object reveals nothing; the subsequent refetch goes through scoped queries.
- Client: one `RealtimeBridge` component; buffers events 250 ms, maps them to query keys, calls `invalidateQueries` (active queries refetch, inactive marked stale). Events whose `mutationId` was generated by this tab are ignored (own echo). On reconnect ⇒ invalidate all active queries.
- `change_feed` pruned after 24 h (ADR-004).

### Invalidation map

| Change                                                      | Invalidate                                                                                                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| application stage/owner/interview/polygraph/offer/probation | `['application',id]`, `['applications','board']`, `['vacancy',vacancyId,'funnel']`, `['candidate',candidateId]`, `['timeline']` for those ids, `['tasks','me']`, `['calendar']` |
| vacancy fields/status/assignment                            | `['vacancy',id]`, `['vacancies']`                                                                                                                                               |
| candidate profile/files                                     | `['candidate',id]`, `['candidates','list']`                                                                                                                                     |
| notification for me                                         | `['notifications','me']`, `['tasks','me']`                                                                                                                                      |
| bonus tranche                                               | `['bonuses']`, `['application',id]`                                                                                                                                             |
| stats                                                       | none (5 min stale; nightly reconcile)                                                                                                                                           |

## Hot path & budget

- First paint: page RSC → `Promise.all` of ≤ 3 service calls, each one SQL query (PERF-05) → < 150 ms server; HTML streamed.
- Navigation to a hovered card: served from cache (0 ms) then background refetch.
- Realtime: 1 WebSocket per tab; refetch only active queries.

## Consequences

- (+) Instant navigation, fresh boards without polling, no data in events.
- (−) Two `queryFn` paths (service vs HTTP) → contract tests.
- (−) Depends on Supabase Realtime Broadcast-from-database and private channels (Supabase Auth JWT on the client); if Realtime is down, focus refetch keeps data acceptable.
