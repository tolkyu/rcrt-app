# ADR-021 — Candidates foundation: schema, scopes, search, Phase 2 applications (C1, enables C2–C10)

- **Status:** Proposed (Phase 2, candidates increment C1); revised 2026-11-24 per security pre-review `docs/security/adr-021-prereview.md` (B-1..B-7, N-1..N-14)
- **Date:** 2026-11-24
- **PRD:** CAND-01..06, VIS-01/02, D8, D13, D19, D20, D48, D49, D50, D52, D53, D57, D65, D66, D138–D147, ARCH-03/04, §13 PERF-01/02/05; stories `docs/stories/phase-2-candidates.md` (conflicts 1–6, 10, 11); builds on ADR-002, ADR-003, ADR-005, ADR-007, ADR-008, ADR-013 (`name_key` precedent)

## Context

Verified code state (2026-11-24):

- No `candidate`, `application`, `candidate_file`, `rejection_reason`, `vacancy_stage_count` table. Last migration `0016`.
- `entity_event.candidate_id` / `application_id` and `audit_log.candidate_id` exist without FKs (ERD §10 deferred).
- `file_object` exists: buckets `cv|polygraph|offer|attachment`, key CHECK `{vertical_id}/{id}`, statuses `PENDING|READY|REJECTED|PURGED`, cleanup index on `PENDING` and `PURGED AND storage_deleted_at IS NULL`.
- `server/authz/permissions.ts` already follows D66 (`candidate.bonus_flags.set` G/V/OWN, `.clear` G + MFA) and holds `candidate.read` G/V/OWN/V≥P/SUB, `candidate.contacts.read` G/V/OWN/V≥P.
- Scope API in code: `scopeWhere(ctx, permission, adapter)` + `findVisibleOrThrow(ctx, readPermission, adapter, load)`; per-resource adapters are module-private (precedent `vacancy-scope.ts`).
- SEC-POS-01: SQL `lower()` follows `LC_CTYPE`, which may be `C` on Supabase → fold keys are app-computed (`position.name_key`).

## Decisions

| #   | Topic                                     | Options                                                                                                                                           | Decision                                                                                                                                                                                                                                                                                                                                 |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Photo (D57, D141)                         | A. `candidate_file kind=PHOTO`; B. `candidate.photo_file_id` → `file_object`, bucket `photo`                                                      | **B.** One current photo, no history (D141) → one nullable FK, private bucket `photo` (2 MiB, JPEG/PNG/WebP). View = `candidate.read`; set/replace/remove = `candidate.update` (D141). Binding, URL and metadata rules: §Photo (gate for C3, B-7). Card DTO: `photo: { fileId } \| null`, never a URL; lists show initials                |
| 2   | Optimistic lock                           | A. `updated_at` compare; B. `candidate.version int`                                                                                               | **B.** `version int NN DEFAULT 1 CHECK > 0`. Every user write on the row (edit, flag set/clear, photo set/remove, merge — both rows, transfer, delete) takes `expectedVersion` and follows §Write order (B-3). System denorm writes (`last_activity_at`) do **not** bump `version`, so pipeline activity never refuses a profile edit   |
| 3   | `application` in Phase 2 (D138, D142)     | A. minimal table now, widen in Phase 3; B. full ERD table now, Phase 3 adds only sub-object tables                                                | **B.** The seed needs `routed`, `routed_from_application_id`, `tl_decision`, `closed_reason_code` (D138). Widening later rewrites 16 indexes. Phase 2 machine = 3 rows (§Pipeline). `rejection_reason` (8 system codes, inserted by the migration) ships in C1 because `REJECTED` rows need `closed_reason_code`                         |
| 4   | Former-employee / referrer rights         | ERD/P2-11 "HREC/HHR/Admin" vs D66                                                                                                                 | **D66 wins** (owner): set = Admin, Head Recruiter (V), Recruiter (own); clear = Admin only, aal2, mandatory reason; Head HR none. `referrer_user_id` is **not** created in Phase 2; it arrives with the Phase 4 bonus migration (D140)                                                                                                    |
| 5   | authz footnotes 8, 9                      | —                                                                                                                                                 | Footnote 8 per D48: TL gets LinkedIn/portfolio URLs and CV files as is; contact fields = email, phone, Telegram. Footnote 9: D50 confirmed, D144 + D146 added                                                                                                                                                                            |
| 6   | Head HR transfer scope                    | —                                                                                                                                                 | `V≥P (source)` = Head HR of the source vertical, candidate has a live application there with `max_stage_reached ≥ POLYGRAPH` (D144). With D50 (no active application) = a candidate whose post-Polygraph application has ended. Pool candidate that never reached Polygraph → 404                                                      |
| 7   | Search vs contacts (D20, D143)            | A. one `search_text` incl. contacts (ERD); B. contacts arm filtered in JS; C. two fold columns, contacts arm only under the contacts scope in SQL | **C.** `search_name` + `search_contacts`, app-computed, GIN trigram each; the contacts arm exists only with a `candidate.contacts.read` grant and is AND-ed with its scope. Text queries travel only in POST bodies (decision 14)                                                                                                         |
| 8   | `candidate.owner_id`                      | nullable (ERD) / NOT NULL                                                                                                                         | **NOT NULL**, = sourcer at creation (Admin creator: the picked recruiter, D140); changes on transfer (D50). «Відповідальний» = `owner_id`                                                                                                                                                                                                |
| 9   | Probation marker in Phase 2 (D64, D138)   | A. `probation` rows in the seed; B. derive from `application.stage_entered_at` + `vacancy.probation_days`                                         | **B** (D138 forbids sub-records). Pure helper `probationProgress({ startedAt, lengthDays }, clock)` → `{ day, length, daysLeft }`, fed **only from visible applications** (B-2); Phase 3 feeds it from `probation`, DTO shape unchanged                                                                                                  |
| 10  | Candidate status, pool, last activity (B-2) | over visible applications / over all                                                                                                            | `status` (`ACTIVE`/`POOL`, computed over **all** live applications) and «Лише резерв» exist only when `seesCandidatePool` is true (G, V, Recruiter with `sourcer_id = me OR owner_id = me`); otherwise the key is **omitted** in list, card, RSC payload and Ctrl+K, and `poolOnly=true` → 400. §DTO per role                          |
| 11  | `candidate_file`, `vacancy_stage_count`   | C1 / first writer                                                                                                                                 | Created with their first writer: `candidate_file` + `photo` bucket CHECKs + photo trigger in C3; `vacancy_stage_count` in C4 with an `INSERT … SELECT … GROUP BY` backfill. C1 card shows no «Файли»/«Резюме» tabs                                                                                                                       |
| 12  | T01 owner after a transfer (B-4)          | a) sourcer only if eligible, else `owner_id`, else pick; b) always pick after transfer; c) keep rule                                             | **a) — documented default, pending owner** (owner question 3). Eligible = active **and** holds REC/HREC in `candidate.vertical_id`. Default owner = sourcer if eligible, else `candidate.owner_id` if eligible, else the actor picks an eligible REC/HREC; `ownerId` sent while a default exists → 400; ineligible pick → 400 `OWNER_NOT_ELIGIBLE`. `application.sourcer_id` stays the candidate sourcer (D50; Phase 4 bonus question) |
| 13  | Application write scope (B-5)             | matrix `own` = owner or sourcer / story "application owner"                                                                                       | **Story wording.** For application **write** actions a Recruiter's `own` = `a.owner_id = :me` (`OWNER_ONLY` arm). The sourcer keeps read access only. Authz §1/§2.3 updated                                                                                                                                                              |
| 14  | Search transport (B-6)                    | `GET ?q=` / `POST` body                                                                                                                           | `q` never appears in page URLs or request query strings: it lives in component state; list and Ctrl+K searches use `POST /api/v1/candidates/search` `{ q, filters, cursor }`. Filters stay in the URL; `GET /candidates` (no `q`) keeps the RSC prefetch                                                                                |

## Write order (B-3; every candidate and application write)

| Step | Check                                                                                                                                         | Failure                                    |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 1    | Caller holds any grant of the write permission (`hasAnyGrant`); Finance: route not granted at all                                            | 403 (Finance 404)                          |
| 2    | Scoped read fetch with the **read** permission (`findVisibleCandidateOrThrow` / application read scope); path ids only, body not parsed yet | 404, same body as an unknown id            |
| 3    | `can(write)` on the loaded row                                                                                                                | 403                                        |
| 4    | Zod `.strict()` body                                                                                                                          | 400                                        |
| 5    | Domain guards (state machine, D50, ROUTE-06, …)                                                                                               | 409 specific code                          |
| 6    | CAS: `UPDATE … WHERE id = $1 AND version = $2 AND deleted_at IS NULL AND <write-permission scope>`                                            | —                                          |
| 7    | 0 rows → re-read with the **read** scope                                                                                                      | no row → 404; row → 409 `STALE_STATE`      |

- A 409 body carries only fields of a row the caller can read. Merge: both rows go through steps 2–7; either one out of scope → 404. T23/T24 apply the same order on `application.version`.
- This supersedes pipeline guard G6 "Zod before G1" for these routes (pipeline doc updated). Recorded in `docs/engineering-self-check.md`.

## Schema delta (C1 migration `0017`; DB engineer owns the SQL)

| Object                        | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app.stage_rank(text)`        | `IMMUTABLE` ordinal (NEW 1 … PROBATION_PASSED 8; terminal ✖ 0)                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `rejection_reason`            | ERD §2.2; 8 PRD §6.4 codes `is_system = true`, `OTHER.requires_comment = true`                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `candidate`                   | ERD §2.2 as amended here: `+ version`, `+ photo_file_id uuid null FK file_object UQ`, `+ search_name text NN DEFAULT ''`, `+ search_contacts text NN DEFAULT ''`, `− search_text`, `− referrer_user_id` (Phase 4), `owner_id NN`, `source_channel` CHECK 5 values (D140). CHECKs: existing + `candidate_version_chk`, `candidate_search_chk` (`purged_at IS NULL OR (search_name = '' AND search_contacts = '')`), `photo_file_id` in `candidate_purged_pii_null_chk`, `cardinality(tags) <= 20` |
| `candidate_vertical_transfer` | ERD §2.2; append-only (REVOKE + trigger)                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `application`                 | full ERD §2.2 table + CHECKs; trigger `application_candidate_vertical`; trigger `candidate_vertical_guard` on `candidate`; ROUTE-06 `application_active_in_group_uq`                                                                                                                                                                                                                                                                                                                             |
| FKs                           | `entity_event.candidate_id`, `entity_event.application_id`, `audit_log.candidate_id` (`NOT VALID` + `VALIDATE`)                                                                                                                                                                                                                                                                                                                                                                                  |
| Indexes (C1)                  | candidate: IDX-14, IDX-15, N31, IDX-16 (`search_name`), IDX-16c (`search_contacts`), IDX-17, IDX-18..21 (UQ, D49), IDX-22, N01, UQ `public_no`; application: IDX-04, IDX-05, IDX-06, IDX-07, IDX-08, IDX-11, IDX-12, N26; transfer: N27. Board (IDX-01/02/03/51), archive (IDX-09/10), STAT (IDX-13) come with their readers unless the C1 EXPLAIN gate needs one                                                                                                                                |
| Grants                        | `app_rw`: `SELECT` on the four new tables. `INSERT`/column `UPDATE` grants arrive with their writers (C2 candidate, C4 application, C7 transfer/delete) — precedent `0012`                                                                                                                                                                                                                                                                                                                       |
| C3 additions                  | `file_object_bucket_chk` + `photo`, size/MIME CHECK rows; trigger `candidate_photo_guard` (§Photo)                                                                                                                                                                                                                                                                                                                                                                                               |

## Search (C1 list, C10 Ctrl+K)

- Fold (`lib/candidate-search.ts`, one function for writes, seed and queries): NFC → `toLocaleLowerCase('uk')` → apostrophes `ʼ’'\`` → `'` → whitespace collapsed.
  - `search_name = fold(full_name)`; `search_contacts = fold(email_normalized) ‖ ' ' ‖ digits(phone_e164) ‖ ' ' ‖ telegram_normalized` (nulls skipped).
  - The repository writes both in the same `INSERT`/`UPDATE` that changes a source field; purge sets both to `''`.
- Transport (B-6): `POST /api/v1/candidates/search` `{ q, filters, cursor, mode: 'LIST' | 'PALETTE' }`, Zod `.strict()`, existing Origin/CSRF check, 120/min/user, response `Cache-Control: private, no-store`. `q` never in a page URL, query string, log line or Sentry breadcrumb; TanStack key `['candidates', 'search', { filters, qHash }]` (in-memory hash, not persisted).
- Query classes (shared search schema: NUL → 400, `max(100)` → 400, N-4):
  - `PHONE`: only digits, spaces, `+ ( ) -` → `digits(q)`; fewer than 5 digits → 400 `SEARCH_QUERY_TOO_SHORT` for every role; contacts arm only.
  - `TEXT`: `fold(q)` ≥ 3 characters, else 400 `SEARCH_QUERY_TOO_SHORT`; `LIKE '%' ‖ escape(q) ‖ '%'` (escape `% _ \`, default escape, T-X07).
- Predicate:

```sql
c.deleted_at IS NULL AND <candidateReadWhere(ctx)>
AND ( c.search_name LIKE $p                                            -- TEXT only
      OR (c.search_contacts LIKE $p AND <candidateContactsWhere(ctx)>) ) -- arm omitted without a contacts grant
```

- No contacts grant: `PHONE` → empty 200; `TEXT` → name arm only. Mixed-role caller: the contacts arm matches only rows inside his contacts scope.
- `LIKE` on pre-folded columns is locale-independent. **Gate:** pg_trgm extracts trigrams from word characters per `LC_CTYPE`; with plain `C`, Cyrillic gives no trigrams. The DB engineer checks `SHOW lc_ctype` locally and on Supabase and keeps an `EXPLAIN` test with a Cyrillic `q` (bitmap index scan on IDX-16).
- LIST mode keeps the list order and cursor; PALETTE orders by `similarity(search_name, q) DESC`, `LIMIT 10`, no total.
- Accepted residuals (N-3, Low): trigram bitmap work and list order reveal nothing usable through 120/min, no totals and network noise.

## Scope builders (`server/authz/candidate-scope.ts`; adapters private, like `vacancy-scope.ts`)

| Resource / permission                                    | Scope      | SQL (AND `deleted_at IS NULL`)                                                                                                                                                                                   | Index                       |
| -------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| application `application.read`                           | V          | `a.vertical_id = ANY(:V)`                                                                                                                                                                                        | IDX-04/05/08                |
|                                                          | own        | `a.vertical_id = ANY(:V) AND (a.owner_id = :me OR a.sourcer_id = :me)`                                                                                                                                           | IDX-06, IDX-12              |
|                                                          | V≥P        | `a.vertical_id = ANY(:V) AND a.max_stage_reached >= 5`                                                                                                                                                           | IDX-08                      |
|                                                          | sub        | `a.vertical_id = ANY(:V) AND a.team_lead_id = :me AND a.max_stage_reached >= 3`                                                                                                                                  | IDX-07                      |
| application writes (`reject.recruiting`, `withdraw`, …)  | own (B-5)  | `a.vertical_id = ANY(:V) AND a.owner_id = :me` (`OWNER_ONLY` arm)                                                                                                                                                | IDX-06                      |
| candidate `candidate.read` and `candidate.contacts.read` | V          | `c.vertical_id = ANY(:V)`                                                                                                                                                                                        | IDX-14                      |
|                                                          | own        | `c.vertical_id = ANY(:V) AND (c.sourcer_id = :me OR c.owner_id = :me OR c.id IN (SELECT a.candidate_id FROM application a WHERE (a.owner_id = :me OR a.sourcer_id = :me) AND a.vertical_id = ANY(:V) AND LIVE))` | IDX-15, N31, IDX-06, IDX-12 |
|                                                          | V≥P        | `c.vertical_id = ANY(:V) AND c.id IN (SELECT a.candidate_id … a.vertical_id = ANY(:V) AND a.max_stage_reached >= 5 AND LIVE)`                                                                                    | IDX-08                      |
|                                                          | sub        | `c.vertical_id = ANY(:V) AND c.id IN (SELECT a.candidate_id … a.team_lead_id = :me AND a.max_stage_reached >= 3 AND LIVE)`                                                                                       | IDX-07                      |
| `entity_event` on a candidate card (B-1)                 | —          | `e.candidate_id = ANY(<server-built ids of a VisibleCandidate>) AND (e.application_id IS NULL OR EXISTS (SELECT 1 FROM application a WHERE a.id = e.application_id AND <applicationReadWhere>))` + `sensitivity` redaction | IDX-31 + application PK     |

- Candidate `own` covers the **sourcer** of any of its applications (differs from the candidate sourcer only after a merge), so every readable application opens its card (contract list ⊆ `can(read)`).
- `c.vertical_id = ANY(:V)` on every arm gives D144; `a.vertical_id = ANY(:V)` gives D146 (old-vertical closed applications on the card: Admin only). A sourcer who also holds REC in the new vertical regains access (N-8, intended, pinned by a test).
- History (B-1): the service calls `findVisibleCandidateOrThrow` first (404 otherwise, for every filter value); merged ids come from `merged_into_id = winner` on the server, never from input.
- C4 must extend `vacancyEventReadWhere` with the same `application_id` arm, open D53, and in vacancy lists show a candidate it cannot read as name only (no link, no contacts), a deleted one as «Кандидат #N (видалено)» (N-5).

```ts
// server/authz/candidate-scope.ts
import type { SQL } from 'drizzle-orm';
import type { AuthContext } from './context';
import type { UserId } from './types';

declare const visibleCandidate: unique symbol;
/** Produced only by findVisibleCandidateOrThrow; carries the server-built merged ids. */
export type VisibleCandidate = {
  readonly id: string;
  readonly verticalId: string;
  readonly sourcerId: UserId;
  readonly ownerId: UserId;
  readonly version: number;
  readonly timelineIds: readonly string[]; // id + merged_into_id = id rows
  readonly [visibleCandidate]: true;
};

/** The only candidate read predicate: list, card, search, filter options, pickers, counts. */
export declare function candidateReadWhere(ctx: AuthContext): SQL;
/** Rows whose email/phone/Telegram the caller may see; `null` when the caller holds no contacts grant (arm omitted). */
export declare function candidateContactsWhere(ctx: AuthContext): SQL | null;
/** Write-permission scope for the CAS step (§Write order). */
export declare function candidateWriteWhere(
  ctx: AuthContext,
  permission:
    | 'candidate.update'
    | 'candidate.bonus_flags.set'
    | 'candidate.bonus_flags.clear'
    | 'candidate.merge'
    | 'candidate.delete'
    | 'candidate.transfer_vertical',
): SQL;
/** The only application read predicate (card list, vacancy list, timelines, counts). */
export declare function applicationReadWhere(ctx: AuthContext): SQL;
/** Application write scope; Recruiter `own` = owner only (B-5). */
export declare function applicationWriteWhere(
  ctx: AuthContext,
  permission: 'application.reject.recruiting' | 'application.withdraw',
): SQL;
/** Candidate-card timeline filter; accepts only a scoped candidate (B-1). */
export declare function candidateEventReadWhere(
  ctx: AuthContext,
  visible: VisibleCandidate,
): SQL;
/** True when status / pool may be computed for this row (decision 10); SQL twin of seesCandidatePool. */
export declare function candidatePoolVisibleWhere(ctx: AuthContext): SQL;
export declare function seesCandidatePool(
  ctx: AuthContext,
  row: Pick<VisibleCandidate, 'verticalId' | 'sourcerId' | 'ownerId'>,
): boolean;
/** Scoped single fetch; no row ⇒ NotFoundError (404), same body as an unknown id. */
export declare function findVisibleCandidateOrThrow(
  ctx: AuthContext,
  candidateId: string,
): Promise<VisibleCandidate>;
```

## C1 read endpoints and query shapes

All candidate responses: `Cache-Control: private, no-store`, no ETag; the TanStack cache is cleared on sign-out (N-9).

| Endpoint (`/api/v1`)                   | Query                                                                                                                                                                                                                                                                                                                                                                                                          | Budget (PERF-01 seed) |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `GET /candidates` (filters, no `q`)    | one query: `candidateReadWhere` + filters + keyset `(last_activity_at, id) < cursor` `ORDER BY last_activity_at DESC, id DESC LIMIT 51`; `LATERAL` over visible live applications (`applicationReadWhere`): active chips (≤ 5, vacancy number/title/probation_days) + `max(a.last_activity_at)`; status via `candidatePoolVisibleWhere` + `NOT EXISTS` on IDX-11. Never selects `summary_doc` or contacts | P95 < 150 ms          |
| `POST /candidates/search`              | same query + §Search predicate (LIST) or PALETTE shape                                                                                                                                                                                                                                                                                                                                                         | P95 < 150 ms          |
| `GET /candidates/filter-options`       | `Promise.all`: owners of scoped candidates (`DISTINCT owner_id` via N31/IDX-14, join `app_user`), readable vacancies with a visible application, verticals of the caller. Tags: `GET /candidates/tags?prefix=` autocomplete over scoped rows, `LIMIT 20` (a tag prefix is not a person identifier)                                                                                                            | < 150 ms              |
| `GET /candidates/{id}`                 | `findVisibleCandidateOrThrow` shape: row + contacts as `CASE WHEN <candidateContactsWhere> THEN … END` + `LATERAL json_agg` of readable applications (IDX-05) + owner/sourcer active flags (D142); DTO per §DTO                                                                                                                                                                                                | card < 100 ms total   |
| `GET /candidates/{id}/history?filter=` | `findVisibleCandidateOrThrow` (404) → IDX-31 cursor `(occurred_at, id)`, `LIMIT 31`, `candidateEventReadWhere(ctx, visible)`; filters «Етапи / Поля / Файли» = `type = ANY(...)`                                                                                                                                                                                                                               | in the card budget    |

| Filter (C1)      | Predicate                                                                                                      | Index                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| «Етап»           | `EXISTS (application a WHERE a.candidate_id = c.id AND a.stage = ANY($s) AND LIVE AND <applicationReadWhere>)` | IDX-05 probe / IDX-04                    |
| «Вакансія»       | same with `a.vacancy_id = $v`; `$v` outside `vacancyReadWhere` or unknown → empty 200                          | IDX-04                                   |
| «Вертикаль»      | `c.vertical_id = $v` (outside the caller's verticals → empty, not an error)                                    | IDX-14                                   |
| «Відповідальний» | `c.owner_id = $u`                                                                                              | N31                                      |
| «Джерело»        | `c.source_channel = ANY($s)`                                                                                   | row filter on the scope index (5 values) |
| «Теги»           | `c.tags && $t` — any of the selected tags (D147)                                                               | IDX-22                                   |
| «Лише резерв»    | `<candidatePoolVisibleWhere> AND NOT EXISTS (active application)`; TL/HR/Head HR → 400 (not offered)           | IDX-11 (leading `candidate_id`)          |
| `q`              | §Search, POST only                                                                                             | IDX-16, IDX-16c                          |

- Cursor = opaque base64 `{t, id}`; any filter change resets it; a tampered cursor only repositions inside the scope. `last_activity_at` is written from `ctx.clock` at ms precision (seed too).
- Query keys: `['candidates', 'list', filters]`, `['candidates', 'search', { filters, qHash }]` (infinite), `['candidates', 'filterOptions']`, `['candidate', id]`, `['candidate', id, 'history', filter]` (infinite).

## DTO per role (B-2, N-2, N-12, N-13)

| Field                                  | G / V / Recruiter as candidate sourcer or owner | Recruiter via application only, TL, HR, Head HR                                  |
| -------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------- |
| `status` (`ACTIVE`/`POOL`)             | over all live applications                      | key omitted                                                                      |
| Probation marker, stepper              | from visible applications                       | from visible applications                                                        |
| Displayed last activity                | `c.last_activity_at`                            | `max(a.last_activity_at)` over visible applications (sort stays on IDX-14; N-3) |
| Contacts                               | per `candidateContactsWhere`                    | per `candidateContactsWhere` (TL never)                                          |
| `formerEmployee` flag                  | shown                                           | omitted (bonus context, N-13)                                                    |
| `routedFromApplicationId`              | only if that application is readable            | only if that application is readable (N-12)                                     |

`entity_event_pii` rendering (N-2): `flag_set/flag_cleared` reason → G/V/own (candidate sourcer or owner); `application.stage_changed` comment → readers of that application; `vertical_transferred` reason → G and V of the new vertical; `deleted` reason → archive readers (Phase 5). Comment fields carry the hint «Не вказуйте контакти в коментарях» _(proposed copy)_. Per-role DTO snapshot tests cover list, card, RSC payload and PALETTE.

## Photo (gate for C3, B-7)

- **Binding:** the upload intent stores `owner_type='candidate'`, `owner_id`, purpose `photo` and `expectedVersion` server-side. `POST /files/{id}/complete` links the photo from those stored values (§Write order on the candidate, `candidate.update`); no endpoint accepts a client photo `fileId`. Remove = `DELETE /candidates/{id}/photo?expectedVersion=`.
- **DB trigger** `candidate_photo_guard` (`BEFORE INSERT OR UPDATE OF photo_file_id ON candidate`, when not null): the file row has `bucket='photo' AND owner_type='candidate' AND owner_id = NEW.id AND status='READY'`, else `P0001 PHOTO_FILE_INVALID`.
- **URL issue** (`GET /files/{id}/url`): parent loaded through `findVisibleCandidateOrThrow` (current vertical); `file_object.vertical_id` is never used for authz (it keeps the upload vertical after a transfer). For `photo` also `candidate.photo_file_id = file.id`, else 404 (replaced, `PENDING`, foreign).
- **Metadata:** `complete` for `photo` downloads the object server-to-storage (≤ 2 MiB), re-encodes it without EXIF/XMP (`sharp`), stores the clean object under a new `file_object` key and deletes the original; stored `contentType` = sniffed type; bucket `allowed_mime_types` stays the second gate.
- **Cache:** upload with `cacheControl: 'private, max-age=60'`.
- **Audit (security decision):** no audit row on a successful photo URL; limiter key `file_url:photo` 60 issues/min/user; above it 429 + one `audit_log` `DENIED` security event without candidate data. CV and attachment URLs stay audited (ADR-005).

## Pipeline in Phase 2 (`server/domain/pipeline/`, one table)

| ID  | Action           | From → To                | Permission                                    | Required data                                                                     | Increment |
| --- | ---------------- | ------------------------ | --------------------------------------------- | --------------------------------------------------------------------------------- | --------- |
| T01 | `ADD_TO_VACANCY` | ∅ → NEW                  | `application.create`                          | candidateId, vacancyId; `ownerId` only when no eligible default owner (decision 12) | C4        |
| T23 | `REJECT`         | **NEW only** → REJECTED  | `application.reject.recruiting` (REC: owner)  | reasonCode (active `rejection_reason`), comment (Q-118 default)                   | C4        |
| T24 | `WITHDRAW`       | **NEW only** → WITHDRAWN | `application.withdraw` (REC: owner)           | comment (Q-56 default)                                                            | C4        |

- The code table holds only these rows; Phase 3 widens `from` and adds rows. Any other action or stage → 409 `INVALID_TRANSITION`; `availableActions()` derives the card buttons from the same table. No disabled Phase 3 buttons.
- Checks follow §Write order. Side effects of T23/T24 at NEW: `closed_at/by`, `closed_reason_code` (REJECT), `version + 1`, `stage_entered_at`, application and candidate `last_activity_at` (D8: stage change), `vacancy_stage_count` NEW −1, `application.stage_changed {from, to, reasonCode?}`, comment in `entity_event_pii`, audit. ROUTE-06 slot freed.

## Events (`entity_event`, payload ids/enums only; PII in `entity_event_pii` or `audit_log`)

| Type                                     | Payload (`v: 1`)                                                           | `entity_event_pii`                                 | Increment    |
| ---------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------- | ------------ |
| `candidate.created`                      | `verticalId, sourceChannel, sourcerId`                                     | —                                                  | C2           |
| `candidate.updated`                      | `fields: FieldCode[]` (D139)                                               | — (values in `audit_log.before/after`, Admin only) | C2           |
| `candidate.flag_set`                     | `flag: 'FORMER_EMPLOYEE'`                                                  | —                                                  | C2           |
| `candidate.flag_cleared`                 | `flag`                                                                     | `reason`                                           | C2           |
| `candidate.photo_set` / `.photo_removed` | subject `file_object`                                                      | —                                                  | C3           |
| `candidate.file_uploaded`                | `kind, version`, subject `file_object`                                     | `filename`                                         | C3           |
| `candidate.file_removed`                 | `kind`, subject `file_object`                                              | —                                                  | C3           |
| `application.created`                    | `vacancyId, sourceType, ownerId`                                           | —                                                  | C4 (seed C1) |
| `application.stage_changed`              | `from, to, reasonCode?`                                                    | `comment`                                          | C4 (seed C1) |
| `application.owner_reassigned`           | `fromUserId, toUserId`                                                     | `reason`                                           | C4           |
| `candidate.merged`                       | winner `mergedCandidateId`; loser `intoCandidateId`                        | —                                                  | C6           |
| `candidate.vertical_transferred`         | `fromVerticalId, toVerticalId, newOwnerId`                                 | `reason`                                           | C7 (seed C1) |
| `candidate.deleted`                      | —                                                                          | `reason`                                           | C7 (seed C1) |
| audit only                               | `candidate.duplicate_blocked {matchKind}`, file-URL issue (CV, attachment) | —                                                  | C2, C3       |

- Correlation: candidate events set `vertical_id`, `candidate_id`; application events also `vacancy_id`, `application_id`. Every write = row + event + audit in one transaction.
- An event on application A never names another application or vacancy in its payload (N-6, ADR-003 rule); a seed scan test checks it.
- C2 notes: an edit hitting a dedupe unique index maps to `{ match: 'HIDDEN' }` and counts toward the 20/day limit, never naming the constraint (N-10). C7 note: the Head HR transfer owner picker returns only `id`, `name` of active REC/HREC of the target vertical (N-11).

## Soft delete and purge map (matches ERD §3.8, N-1)

| Column                                                                                                                                                                       | Soft delete (C7)                                                       | Purge (Phase 5, `app.purge_candidate`)                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `full_name`, contacts + normalized keys, `linkedin_url/_normalized`, location, company, title, `expected_salary_minor/_currency`, `summary_doc`, `former_employee_left_on`, `delete_reason` | kept; row 404 outside the archive; unique keys freed (partial indexes) | NULL                                                                                                                                                                            |
| `portfolio_urls`, `tags`                                                                                                                                                     | kept                                                                   | `'{}'`                                                                                                                                                                          |
| `search_name`, `search_contacts`                                                                                                                                             | kept (excluded by `deleted_at`)                                        | `''`                                                                                                                                                                            |
| `photo_file_id` → `file_object` (`photo`)                                                                                                                                    | kept, URL only via archive permission                                  | `photo_file_id` NULL; `file_object` → `PURGED`; object deleted                                                                                                                  |
| `application` (no PII)                                                                                                                                                       | untouched (D65: recruiters reject)                                     | untouched                                                                                                                                                                       |
| `entity_event_pii` rows of candidate/applications                                                                                                                            | kept                                                                   | DELETE                                                                                                                                                                          |
| `audit_log.before/after` by `candidate_id`                                                                                                                                   | kept                                                                   | NULL                                                                                                                                                                            |
| Kept as stub                                                                                                                                                                 | —                                                                      | `id, public_no, vertical_id, sourcer_id, owner_id, sourcer_since, source_channel, former_employee, referrer_user_id (Phase 4), merged_into_id, consent_given_on, version, created_*, deleted_at, deleted_by` |

Every PII column above is tagged `pii` in Drizzle; the DG-20 CI test compares tags with the purge function.

## Seed (STORY-SEED-3, D138, CLAUDE.md §8)

- ~30 candidates, ids `demoId('candidate:<key>')`, inserted in a fixed order (stable `public_no`), fixed clock, timestamps at ms precision, search keys through the shared fold.
- Distribution: owners `recruiter1`, `recruiter2`, `recruiter.crypto`, one sourced by `head.recruiter.gambling`; ≥ 2 talent pool; applications on Vasyl's and Taras's «Медіабаєр — Facebook» across all stages: one `PROBATION` with `stage_entered_at` = clock day − 34 (day 35 of `vacancy.probation_days`), one `REJECTED` (`closed_reason_code`), one routed Vasyl → Taras (`REJECTED routed=true` + `ROUTED` with `routed_from_application_id`), one at `POLYGRAPH` (visible to HR), one `IN_WORK` on Vasyl (Андрій Мельник, invisible to Vasyl), one soft-deleted candidate, one transferred Гемблінг → Крипто (owner `recruiter.crypto`, sourcer `recruiter1`) whose closed Гемблінг application **reached `POLYGRAPH`** (`max_stage_reached ≥ 5`) so the HR/Head HR denials are meaningful.
- Rows + `entity_event` chain only (`application.created`, `application.stage_changed` per step, `candidate.vertical_transferred`, `candidate.deleted`); no interview/polygraph/offer/probation rows (D138); no CV files until C3. Every CHECK/trigger applies (no bypass); `tl_decision` set for `max_stage_reached ≥ 3`.
- Synthetic identifiers only (N-7): emails `@example.com`, Telegram `demo_cand_NNNN`, LinkedIn `https://linkedin.com/in/demo-candidate-NNNN`, phones from a fictional `+38067 000 xx xx` range; no `@demo` candidate emails. Test: no seeded name, phone, email, handle or slug in `entity_event.payload` or `audit_log.details`.
- Perf seed (`db:seed:perf`, PERF-01) in C1, same generator + non-local guard: 50k candidates (5 % deleted, 1 % purged stubs), ~65k applications (~20k active, routed chains), ≈500 transfers, 200k events; only C1 tables; `ANALYZE` after load. EXPLAIN gate per role fixture (Admin, Head Recruiter, Recruiter, HR, TL): list unfiltered, each filter, search name, search phone, card, history.
- Allowed/denied test set: the 83 cases of `docs/security/adr-021-prereview.md` (fixtures XT, XD, XR, XP, XN, XA) — C1 builds the read cases, C2–C4 the write cases.

## Owner questions (answered 2026-11-24: both recommendations accepted, D146 and D147)

| #   | Question                                                                                                                                                     | Options                                                                                              | Recommendation                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | After a vertical transfer, do the roles of the **new** vertical (other than Admin) see the candidate's old closed applications (other vertical) on the card? | a) no — only Admin; new vertical sees the transfer event and its own applications; b) yes, read-only | a) — no new scope rule, less PII spread; the transfer event says where the candidate came from |
| 2   | Filter «Теги» with several tags selected: candidate has **any** of them, or **all**?                                                                         | a) any; b) all                                                                                       | a) — same as other multi-value filters                                                         |

## Owner question pending

| #   | Question                                                                                                                       | Options                                                                                                                                                         | Recommendation (applied as default, pending owner)       |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 3   | «Додати до вакансії» after a transfer: the candidate's sourcer works in another vertical. Who owns the new application? (B-4) | a) the sourcer only if active **and** in the candidate's vertical, otherwise «Відповідальний», otherwise a manual pick; b) always a manual pick after a transfer; c) keep the rule (application invisible to everyone except Admin) | a) — no extra click; keeps D50 and D142                  |

## Consequences

- (+) C1 is unblocked: schema, scope predicates, write order, search, seed and perf gate are fixed; C2–C7 add writes and grants only.
- (+) Contacts and other applications' state never leave the database for callers without that scope — not in DTOs, status, search matches, history or URLs.
- (−) Two app-computed fold columns must be written on every source change; mitigated by one shared function and a repository test.
- (−) Search needs a POST route next to the GET list; the search text is not restored after reload (filters are).
- (−) Phase 2 probation marker is derived from the stage date; Phase 3 switches the source behind the same helper.
- (−) Photo needs a second request after the card renders, and `complete` re-encodes the image (one server-to-storage round trip, off the card path).
