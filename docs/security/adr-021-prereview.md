# Security pre-review — ADR-021 Candidates foundation (SEC-ADR-021)

- **Date:** 2026-11-24 · **Reviewer:** security-engineer · **Design status reviewed:** Proposed (uncommitted working tree, branch `phase-2`)
- **Scope:** `docs/adr/021-candidates-foundation.md`; updates in `docs/erd.md` §2.2/§3.8, `docs/authz-matrix.md` §1/§2.2/§3/§4, `docs/security/threat-model.md` (P2-11, T-D06, T-C01..05), `docs/pipeline-state-machine.md` (Phase 2 subset), ADR-003 catalog, ADR-005 `photo` bucket, `docs/stories/phase-2-candidates.md`.
- **PRD:** CAND-01..06, VIS-01, D13, D19, D20, D48, D50, D52, D53, D57, D65, D66, D138–D145.

## STATUS: CHANGES REQUIRED

7 blocking findings. B-1..B-6 change the C1/C4 design. B-7 gates C3. None of them needs a new table. The scope builders already include the vertical check on every arm (D144 holds), and the search split (decision 7) is sound.

## What passed

| Check | Result | Evidence |
| --- | --- | --- |
| 1. Vertical check on every candidate arm (D144) | Pass. `c.vertical_id = ANY(:V)` is on V/own/V≥P/sub, and every application subquery also has `a.vertical_id = ANY(:V)`. `scopeWhere` passes the `verticalIds` of each grant separately (`server/authz/vacancy-scope.ts` precedent), so mixed-role users cannot borrow verticals across grants | ADR-021 L70–79, L83 |
| 1. Head HR `V≥P (source)` | Pass. Transfer needs a live application in the source vertical with `max_stage_reached ≥ 5`, and D50 requires no active application. A pool candidate gets 404 | ADR-021 L27; authz ⁹ |
| 1. Recruiter `own` covers the sourcer of any application | Pass | ADR-021 L77, L82 |
| 2. Search vs contacts | Pass. The contact arm is emitted only with a `candidate.contacts.read` grant and AND-ed with that scope. A PHONE query without a grant returns an empty 200 (not 400 or 404), so the answer does not depend on scope. A query under 5 digits gets 400 for every role, which also does not depend on scope. No totals | ADR-021 L47–66 |
| 2. Card DTO | Pass. Contacts come from `CASE WHEN <contactsWhere>`, and the keys are omitted (not set to null). The list never selects contacts | ADR-021 L125–127 |
| 2. History values | Pass. `candidate.updated` carries field codes only. Values are only in `audit_log` (Admin) | ADR-021 L160; D139 |
| 3. Application chips | Pass. Chips use `applicationReadWhere` only | ADR-021 L125 |
| 4. Photo storage | Pass for C1. Private `photo` bucket, 2 MiB, magic bytes, 60 s URL after authz, no URL in DTOs, replaced photo set to `PURGED` and removed by `files-cleanup` | ADR-021 L22; ADR-005 |
| 6. Purge map | Pass with N-1. Every new PII column is covered: `search_*`, `tags`, `photo_file_id`, `portfolio_urls`, `delete_reason`. `candidate_search_chk` and `photo_file_id` are in `candidate_purged_pii_null_chk`. Event payloads hold ids and enums only | ADR-021 L176–189; ERD §3.8 |
| 7. Phase 2 machine | Pass with B-5. Only T01/T23/T24. Every other action → 409 `INVALID_TRANSITION`. No inert buttons | ADR-021 L144–153 |
| 8. Seed PII | Pass with N-7. Emails on `example.com` (RFC 2606), no `@demo` candidate emails, non-local guard inherited | ADR-021 L191–197 |

## Blocking findings

### B-1 (High, C1) History endpoint can read candidate-level events of any candidate id

- **Doc:** ADR-021 L80, L100–103 (`candidateEventReadWhere(ctx, candidateIds)`), L128 (`GET /candidates/{id}/history`).
- **Scenario:** The predicate filters only *application* events (`e.application_id IS NULL OR EXISTS readable application`). Candidate-level events pass for any id. The ADR does not require a scoped candidate fetch before the history query. Example: `recruiter2` calls `GET /candidates/<recruiter1's candidate>/history`, or `vasyl.tl` calls it for the **transferred** candidate, or anyone calls it for the **deleted** candidate. The response is 200 with `candidate.created {sourcerId}`, `candidate.updated {fields}`, `candidate.vertical_transferred {newOwnerId}` and `candidate.deleted`, plus any `entity_event_pii` reasons rendered. An empty list (no events) versus a non-empty list is also an existence oracle.
- **Required change:**
  1. The history service first calls `findVisibleCandidateOrThrow` (404 with the same body as an unknown id), then reads events.
  2. The merged ids (`merged_into_id = winner`) are derived server-side from the scoped winner row, never from input.
  3. Change the signature so it cannot be called with raw ids: `candidateEventReadWhere(ctx, visible: VisibleCandidate)`. `VisibleCandidate` is a branded type that only `findVisibleCandidateOrThrow` returns.
  4. Add tests: out-of-scope, deleted and transferred ids → 404 on `/history` for every filter value.

### B-2 (High, C1) Status, probation marker and last activity reveal applications the viewer cannot see (T-C03 incomplete)

- **Doc:** ADR-021 decision 10 (L31) hides only the pool badge and filter. Stories L67 (row: last activity, probation marker) and L86 (card header status «Активний»/«Резерв»). ADR-021 L125 (`last_activity_at` order and value).
- **Scenario:** Seeded routed candidate. Vasyl's application is `REJECTED routed=true` and Taras's application is active.
  - The card header shows Vasyl «Активний». With only an ended application in his view, he learns the candidate is in another pipeline.
  - On the probation candidate, the list probation marker «Випробувальний · N дн.» is derived from *any* application. Taras sees it when his own application ended but Vasyl's is in `PROBATION`.
  - `candidate.last_activity_at` moves with activity on invisible applications. TL and HR see "last activity yesterday" for a candidate whose visible application closed months ago.
- **Required change:**
  1. `status` (`ACTIVE`/`POOL`) is a single key returned only when `seesCandidatePool` is true. Otherwise the key is omitted (not `ACTIVE`, not null). This applies to the list, card, RSC payload and Ctrl+K.
  2. The probation marker and stepper are computed only from the rows of the visible-applications `LATERAL`.
  3. When `seesCandidatePool` is false, the displayed "last activity" is `max(a.last_activity_at)` over *visible* applications (it is already in the LATERAL). Sort order stays on `c.last_activity_at` (index IDX-14). The residual ordering signal is accepted Low (see N-3).
  4. Add per-role DTO snapshot tests (T-C02/T-C03).

### B-3 (High, C2+, decided in C1) Compare-and-set has no scope and no fixed order

- **Doc:** ADR-021 decision 2 (L23): `UPDATE … WHERE id = $1 AND version = $2`; "0 rows → re-read scoped → 404 or 409".
- **Scenario:**
  1. If the CAS runs before or without the scoped authz, a caller with any `candidate.update` grant can write an out-of-scope row when the version guess is right. Versions are small integers, so guessing is easy.
  2. Race: the HREC reads in scope at version 5. A transfer commits (version 6, now outside his scope). His request, with an `expectedVersion: 6` guess, updates a candidate he can no longer read.
  3. If the version is validated before the scoped read, a 409 confirms that an out-of-scope id exists.
- **Required change:** Fix the order for every candidate and application write. Write this into ADR-021 §Optimistic lock and into `docs/engineering-self-check.md`:
  1. No grant for the permission at all → 403. Finance gets 404 at the route.
  2. Scoped read fetch → 404.
  3. `can(write)` on the loaded row → 403.
  4. Zod body → 400.
  5. Domain guards → 409.
  6. CAS: `UPDATE … WHERE id = $1 AND version = $2 AND deleted_at IS NULL AND <write-permission scope>`.
  7. 0 rows → re-read with the **read** scope. No row → 404, otherwise 409 `STALE_STATE`. A 409 body carries only the fields of a readable row.

  The same applies to merge (both rows, either out of scope → 404) and to T23/T24 on `application.version`.

### B-4 (High, C4, decide now) T01 owner rule breaks after a transfer

- **Doc:** ADR-021 L148 ("ownerId only when the sourcer is inactive"); pipeline T01 (owner = sourcer if active, D142); story L263; authz ⁹ (sourcer unchanged on transfer, D50).
- **Scenario:** Seeded candidate transferred Гемблінг → Крипто. Sourcer = `recruiter1.gambling` (still active), owner = `recruiter.crypto`. `recruiter.crypto` adds the candidate to a Крипто vacancy. The rule sets `application.owner_id = recruiter1.gambling`, who has no role in Крипто. Results:
  - `recruiter.crypto` cannot see the application he just created (`own` needs `owner_id`/`sourcer_id = me`).
  - The application belongs to an old-vertical user who cannot see it either (D144).
  - The ROUTE-06 slot is taken by an application nobody can see.
- **Required change:** "Sourcer is eligible" means active **and** holds REC/HREC in `candidate.vertical_id`. Otherwise the default owner is `candidate.owner_id` if eligible, else the actor picks an eligible REC/HREC (400 `OWNER_NOT_ELIGIBLE` for anyone else). This reads D142 in line with D50, but it changes the visible default, so the owner must confirm (owner question 1). `application.sourcer_id` for a transferred candidate is a Phase 4 bonus question: keep the D50 default (unchanged) and note it in OPEN_QUESTIONS.

### B-5 (Medium, C4) Write scope `own` for T23/T24 does not match the story

- **Doc:** authz §1 `own` (Application: `owner_id = me OR sourcer_id = me`) and §2.3 `application.reject.recruiting` / `.withdraw` = REC `own`. Story L279 says "Recruiter (**application owner**)".
- **Scenario:** The candidate's sourcer (REC A) and the application owner (REC B, picked because A was inactive at T01) differ. A is reactivated. Under the matrix, A may reject B's application, and in Phase 3 B's bonus-relevant pipeline. The story forbids this.
- **Required change:** For application **write** actions, Recruiter `own` = `a.owner_id = :me`. The sourcer keeps read only. Add a separate `ownerOnly` arm in the application scope adapter. Update authz §1 and §2.3 to match. If the architect wants the matrix wording instead, ask the owner. The story is the BA's reading of the PRD, so I recommend the story.

### B-6 (High, C1) Search text (names, phones, emails) ends up in URLs and platform logs

- **Doc:** ADR-021 L125 (`GET /candidates` with `q`), L66 (Ctrl+K); story L69 ("URL, reload and Back keep [filters]").
- **Scenario:** `GET /api/v1/candidates?q=0671234567` and the page URL `/candidates?q=ivan@example.com` are written to Vercel request logs (path plus query, outside our pino redaction) and to browser history. This breaks CLAUDE.md §3.8 ("No PII in logs") and DG-16. `Referrer-Policy: no-referrer` (next.config.ts L62) already stops Referer leaks.
- **Required change:**
  1. `q` is never placed in the page URL. It lives in component state. Filters stay in the URL.
  2. Requests that carry `q` (list and Ctrl+K) use `POST /api/v1/candidates/search` with body `{ q, filters, cursor }`: Zod `.strict()`, the existing Origin/CSRF check, same scope, the rate limit of 120/min.
  3. `GET /candidates` without `q` keeps the RSC prefetch.
  4. The TanStack key for search is `['candidates', 'search', {filters, qHash}]`.
  5. OpenAPI and Postman are updated.

### B-7 (High, C3 gate) Photo binding and URL issuance need explicit rules

- **Doc:** ADR-021 decision 1 (L22); ADR-005 Upload/Download flow; ERD `file_object` (`vertical_id` fixed after transfer).
- **Scenarios and required changes:**
  - **(a) IDOR through a client-supplied fileId.** If a "set photo" call accepts `{ fileId }`, a REC can point `photo_file_id` at another candidate's CV or photo. The photo URL check (`candidate.read` on *this* candidate) would then sign a foreign file. Required:
    - The photo is linked only inside `POST /files/{id}/complete`, from the intent's server-stored `owner_type='candidate'`, `owner_id` and purpose `photo`. `expectedVersion` travels with the intent.
    - No endpoint accepts a client photo `fileId`.
    - A DB trigger on `candidate.photo_file_id` requires `bucket='photo' AND owner_type='candidate' AND owner_id = candidate.id AND status='READY'`.
  - **(b) Wrong vertical on URL issue.** Authz must load the parent candidate through `candidateReadWhere`. It must never use `file_object.vertical_id`: after a transfer it still names the old vertical. For bucket `photo`, also require `candidate.photo_file_id = file.id` (not a replaced or `PENDING` row) → otherwise 404.
  - **(c) EXIF/XMP metadata (GPS location, device, owner name) is PII.** It is shown to TL and HR. Required: `complete` for `photo` downloads the object (≤ 2 MiB, server to storage, not through the request body), re-encodes it without metadata (`sharp`, free), and stores the clean object under a new key. This also neutralises malformed-image parser payloads. The bucket `allowed_mime_types` stays the second gate, and the stored `contentType` must equal the sniffed type.
  - **(d)** Upload with `cacheControl: 'private, max-age=60'` so the browser does not keep the image for the 1 h Supabase default.

## Decision: photo URL audit (T-C04)

**Not audited on success.** Rate-limited at 60 URL issues per minute per user (own limiter key `file_url:photo`). Over the limit → 429 plus one `audit_log` security event (`result=DENIED`, no candidate data).

Rationale:
- The photo shows less than the card it sits on, and card reads are not audited (D139 and the existing pattern).
- CV and polygraph URLs stay audited (ADR-005, DG-21) because those files carry contacts and special-category data.
- Auditing every header render would add a write to the card path (PERF budget) without detection value.

Update T-C04 to "decided: not audited, rate-limited, B-7 rules".

## Non-blocking items

| ID | Item | Recommendation |
| --- | --- | --- |
| N-1 | ADR-021 purge table L187 keeps `deleted_*`, but L180 nulls `delete_reason`. `expected_salary_currency` and `portfolio_urls` are not named | Align with ERD §3.8: keep `deleted_at, deleted_by`; null `delete_reason, expected_salary_currency`; `portfolio_urls → '{}'`. DG-20 tag test lists all of them |
| N-2 | `entity_event_pii` rendering per role is not defined: transfer reason, flag-clear reason (bonus context), stage-change comment | Reasons for `flag_set/cleared`: G/V/own only. `stage_changed` comment: application readers. `vertical_transferred` reason: G/V of the new vertical. Help text: "do not enter contacts in comments" |
| N-3 | Timing and order residuals: trigram bitmap scans count matches across all verticals, and list order follows `c.last_activity_at` | Accepted Low: rate limit of 120/min, no totals, network noise far above the differences. Record in threat model |
| N-4 | `q` has no maximum length | Zod `max(100)`; test `%`, `_`, `\` escaping (T-X07) |
| N-5 | C4 vacancy lists show a transferred candidate's closed applications (D144). The name join bypasses `candidateReadWhere`. Deleted candidates are not defined | Name only, no link or contacts. Deleted candidate → «Кандидат #N (видалено)». Fix in the C4 ADR |
| N-6 | Event payload cross-reference: an event on application A must not name application or vacancy B (routed chain, Phase 3 `application.routed`) | Add to ADR-003 rule; seed scan test |
| N-7 | Seed: Telegram handles and LinkedIn slugs could be real accounts. The `+38067 000 …` range is not reserved | Synthetic patterns (`demo_cand_0001`, `/in/demo-candidate-0001`). Phones acceptable: no outbound messaging. The perf seed uses the same generator plus the non-local guard. Test: no seeded PII string in `entity_event.payload` |
| N-8 | Sourcer arm after transfer: if the old sourcer also holds REC in the new vertical, he regains access | Intended (he is now a role of the new vertical). Pin with a test |
| N-9 | Candidate APIs and RSC responses carry PII | `Cache-Control: private, no-store`, no ETag. Clear the TanStack cache on sign-out |
| N-10 | C2 update dedupe: the unique-violation constraint name reveals which field matched | Map to `{ match: 'HIDDEN' }`, count toward 20/day (DG-11) |
| N-11 | Head HR transfer: the target-vertical owner picker lists users of another vertical | Return only `id`, `name` of active REC/HREC |
| N-12 | ROUTED application DTO for Taras exposes `routed_from_application_id` (Vasyl's application) | Omit unless that application is readable |
| N-13 | `former_employee` flag visibility on the card for TL/HR is not defined | Show to G/V/own only (bonus context) |
| N-14 | Owner question 1 of ADR-021 (new vertical sees old closed applications?) | Security supports a) Admin only |

## Allowed / denied tests (seeded fixtures)

Fixtures:

| Fixture | Seed state |
| --- | --- |
| **XT** | Transferred Гемблінг → Крипто. Owner `recruiter.crypto`, sourcer `recruiter1`. Closed application on Vasyl's vacancy. **The seed must set that application's `max_stage_reached ≥ 5`** so that the HR and Head HR denials are meaningful |
| **XD** | Soft-deleted |
| **XR** | Routed. Vasyl's application `REJECTED routed=true` (≥ 3), Taras's `ROUTED` active (≥ 3, < 5) |
| **XP** | Ігор Бондаренко, `PROBATION` day 35 on Vasyl's vacancy |
| **XN** | Олена, `NEW` (owner `recruiter1`) |
| **XA** | Андрій Мельник, `IN_WORK` on Vasyl's vacancy |

`REC1` = recruiter1 (owner/sourcer unless stated), `REC2` = recruiter2.gambling, `RECC` = recruiter.crypto, `HREC` = head.recruiter.gambling. `hr@demo` / `head.hr@demo` hold both verticals.

| # | Role | Fixture / action | Expected |
| --- | --- | --- | --- |
| 1 | ADM | XT card | 200, contacts, old Гемблінг application and its events visible |
| 2 | RECC | XT card | 200, contacts, **no** old application or its events (owner Q1 a), `vertical_transferred` event visible, `status=POOL` |
| 3 | RECC | XT search by phone (≥ 5 digits) | match |
| 4 | HREC | XT card, `/history`, list, `?verticalId=Крипто` | 404, 404, absent, empty 200 |
| 5 | REC1 (sourcer) | XT card, search by name and phone | 404, no match |
| 6 | TL Vasyl | XT card and `/history` | 404 (D144) despite `sub` on the closed application |
| 7 | HR, HHR (both verticals) | XT card | 404 (no application ≥ 5 in Крипто) |
| 8 | HHR | XT transfer back | 404 (no longer source vertical) |
| 9 | TL Крипто, REC2 | XT card | 404 |
| 10 | user REC in Крипто + sourcer | XT card | 200 (N-8, intended) |
| 11 | RECC / HREC | XT photo or CV URL (C3) | 200 / 404 (ignores `file_object.vertical_id`) |
| 12 | every role incl. ADM | XD card, `/history`, list, Ctrl+K, search by name and phone | 404, 404, absent, absent, no match |
| 13 | ADM / HREC | XD in filter-options owners and tag autocomplete | not counted, tags absent |
| 14 | HREC | XD `PATCH` with correct and with stale `expectedVersion` (C2) | 404 both, never 409 |
| 15 | any | XD photo URL | 404 |
| 16 | ADM, HREC | XR card | 200, both applications, `status=ACTIVE` |
| 17 | REC1 | XR card | 200, both applications, contacts, status |
| 18 | REC2, TL Крипто, RECC | XR card | 404 |
| 19 | TL Vasyl | XR card | 200, only his ended application, no chips, **no `status` key**, no contact keys in JSON, RSC payload or HTML |
| 20 | TL Vasyl | XR `/history` | no event of Taras's application |
| 21 | TL Vasyl | XR `?app=<Taras's application>` | opens on his own application, hidden id not acknowledged |
| 22 | TL Vasyl | XR list "last activity" | from his visible application only (B-2) |
| 23 | TL Taras | XR card | 200, only his application, chip, no `status`, no contacts, no `routed_from_application_id` (N-12) |
| 24 | HR, HHR | XR card | 404 (< POLYGRAPH) |
| 25 | TL Vasyl | XP card | 200, stepper «День 35 з 90», LinkedIn link, no email, phone or Telegram anywhere in the response |
| 26 | TL Vasyl | XP search by phone digits / by email / by name | empty / empty / match |
| 27 | TL Taras | XP card, list, probation marker | 404, absent, marker never shown on any other candidate he reads |
| 28 | HR, HHR | XP card | 200, contacts, application visible, no `status`, probation marker from the visible application |
| 29 | HR | XP search by phone | match |
| 30 | REC1 / REC2 / RECC | XP card | 200 contacts / 404 / 404 |
| 31 | HREC | XP card | 200 |
| 32 | FIN | XP: list, card, `/history`, filter-options, search, photo URL | 404 on each route |
| 33 | ADM | T23 or T24 on XP's application | 409 `INVALID_TRANSITION` |
| 34 | REC2 | T23 on XP's application, correct and stale version | 404 both |
| 35 | TL Vasyl, HR | T23 on XP's application | 403 (no grant, checked before body parsing) |
| 36 | HR | XA card; search by XA's phone | 404; empty |
| 37 | TL Vasyl | XA card and list | 404 and absent (< SUBMITTED_TO_TL) |
| 38 | REC1 (owner) | XN T23 with an active reason | 200: `REJECTED`, event, audit, comment in `entity_event_pii`, counter −1 (C4) |
| 39 | REC1 | XN T24 | 200 `WITHDRAWN` |
| 40 | REC1 | XN T23 again after close | 409 `INVALID_TRANSITION` |
| 41 | REC1 | XN T23 with a stale version | 409 `STALE_STATE` |
| 42 | HREC, ADM | XN T23 | 200 |
| 43 | sourcer-not-owner REC | XN T23 | 404 (B-5) |
| 44 | REC2, RECC | XN T23 | 404 |
| 45 | TL, HR, HHR | XN T23 | 403 |
| 46 | REC1 | XN T23 without a reason / inactive reason / `OTHER` without comment | 400 |
| 47 | REC1 | T01 own candidate on V-0007 | 201, owner = sourcer |
| 48 | REC1 | T01 sending `ownerId` while sourcer is eligible | 400 |
| 49 | RECC | T01 XT on a Крипто vacancy | owner = RECC (B-4), application visible to RECC |
| 50 | ADM | T01 with an ineligible `ownerId` (other vertical or inactive) | 400 `OWNER_NOT_ELIGIBLE` |
| 51 | ADM / REC1 | T01 on a vacancy of another vertical | 409 `CANDIDATE_VERTICAL_MISMATCH` / 404 |
| 52 | ADM | T01 on a non-`OPEN` vacancy | 409 `VACANCY_NOT_OPEN` |
| 53 | any | T01 on XD | 404 |
| 54 | any | T01 concurrent with delete or transfer | one wins, the other 404/409, no orphan |
| 55 | REC1 | T01 on another recruiter's vacancy / other REC's candidate | 404 / 404 |
| 56 | ADM | T01 while another active application exists in the routing group | 409 `ACTIVE_APPLICATION_IN_GROUP`, no vacancy named |
| 57 | every role | search `q` with 4 digits | 400 `SEARCH_QUERY_TOO_SHORT` (same for all roles) |
| 58 | every role | text `q` of 2 characters / NUL / 101 characters | 400 / 400 / 400 |
| 59 | any | `q = '%%%'` / `'_'` | no match across the whole table (escaped) |
| 60 | any | 121st search within a minute | 429 |
| 61 | any | search or Ctrl+K response | no total field |
| 62 | mixed user (REC Гемблінг + TL Крипто) | phone of a Крипто submitted candidate | no match; that candidate's card has no contacts |
| 63 | mixed user | phone of an own Гемблінг candidate | match |
| 64 | mixed user (TL now, was REC and sourcer, same vertical) | card of a submitted candidate | no `status` key; no contacts |
| 65 | any | `q` in the page URL, request query string or pino logs (B-6) | never |
| 66 | TL, HR, HHR | `poolOnly=true` | 400 (filter not offered) |
| 67 | REC who reads only as application owner, not as candidate sourcer or owner | card or list | no `status` key |
| 68 | any | tampered cursor | repositions inside scope only; no foreign row |
| 69 | REC1 | `vacancyId` filter with a vacancy outside scope / unknown | empty 200 / empty 200 |
| 70 | REC1 | filter-options and tag autocomplete | values from own candidates only |
| 71 | REC1 | upload JPEG, PNG, WebP of 2 MiB | 200, EXIF removed (B-7c) |
| 72 | REC1 | photo upload: 2 MiB + 1 B / GIF / SVG / HEIC / PNG bytes declared JPEG / HTML with an image MIME | 400 for each |
| 73 | REC2 | `complete` of REC1's intent | 404 |
| 74 | DB | set `photo_file_id` to another candidate's file or a CV file | trigger raises (B-7a) |
| 75 | TL Vasyl / TL Taras | XP photo URL | 200 (60 s, `no-store`) / 404 |
| 76 | any | photo URL of a replaced photo / `PENDING` file / after 60 s | 404 / 404 / expired |
| 77 | any | 61st photo URL within a minute | 429 + one `DENIED` audit row |
| 78 | TL, HR | photo upload intent | 403 |
| 79 | REC1 | `PATCH` own candidate with a stale version | 409 `STALE_STATE` with own row only |
| 80 | REC2 | `PATCH` REC1's candidate, correct or stale version | 404 |
| 81 | HREC | `PATCH` racing a transfer to Крипто | 404 (B-3 CAS scope) |
| 82 | DG-20 | Drizzle `pii` tags include `search_name`, `search_contacts`, `tags`, `photo_file_id`, `portfolio_urls`, `delete_reason`, `expected_salary_currency` | equal to purge list |
| 83 | seed | every candidate email ends `@example.com`; no seeded name, phone, email, handle or slug in `entity_event.payload` or `audit_log.details`; perf seed refuses a non-local DB | pass |

**Test list size: 83.**

## Owner questions

| # | Question | Options | Recommendation |
| --- | --- | --- | --- |
| 1 | B-4: who owns a new application when the candidate's sourcer works in another vertical (after a transfer)? | a) the sourcer only if active **and** in the candidate's vertical, otherwise «Відповідальний» (`owner_id`), otherwise a manual pick; b) always a manual pick after a transfer; c) keep the rule (the application becomes invisible to everyone except Admin) | **a)**: no extra click, keeps D50 and D142 |

No other item needs the owner. B-5 needs the owner only if the architect prefers the matrix wording over the story.

## Required follow-ups (architect, then DB and fullstack engineers)

- ADR-021: B-1 (history gate, branded type), B-2 (status, marker and last activity per scope), B-3 (write order and scoped CAS), B-4 (T01 owner eligibility), B-5 (`ownerOnly` write arm), B-6 (`POST /candidates/search`, no `q` in URLs), B-7 (photo binding, trigger, EXIF re-encode; C3 gate), N-1 purge table.
- Threat model: T-C03 widened by B-2; T-C04 decided; add T-C06 (search text in logs, B-6) and T-C07 (photo metadata, B-7c).
- `docs/engineering-self-check.md`: add the write-order rule (B-3) and "no PII-bearing query strings" (B-6).
