# Phase 2 — Vacancies & candidates · User stories

> Owner started Phase 2 on 2026-11-06, beginning with «Вакансії». Visual reference: `UI FROM DESIGNER` and `docs/ux/reference/03-vacancies.webp`; approved adaptations and Ukrainian glossary win over mockup copy. PRD §15 remains the scope of the whole phase.
> This checkpoint specifies the vacancy increments. Candidate/files/dedupe/talent-pool/dashboard/custom-role stories are added when those increments start; they are not completed by the vacancy slice.

## Delivery order

| Increment | Deliverable                                                                                                                   | Readiness                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| V1        | Real scoped vacancy list, search/status/vertical filters, working read-only preview/detail, navigation and deterministic seed | Ready for design; include the open-work safety dependency below                                        |
| V2        | Positions catalog and vacancy creation/request form                                                                           | Unblocked by D76/D78/D87/D89..D96 (stories below); no open questions (Q-171, Q-172 resolved: D98, D99) |
| V3        | Field editing, status changes, Team Lead/recruiter assignment and open-work reassignment                                      | Owner-approved D75/D77/D78 plus D1 assignment and D24/D43 safety; delivered after V1                   |
| V4        | Applications, visible-only funnel/counts, full vacancy history and clone/delete flows                                         | Depends on candidate/application tables and relevant answers; deletion also Q-100                      |
| Later     | Routing, polygraph/offer/probation actions; bonus engine; archives/notifications; Telegram                                    | Phases 3/4/5/6 respectively                                                                            |

## Shared rules

- **Owner policy confirmed 2026-11-06 (D75–D78):** Team Lead edits own vacancy except bonus scheme/priority/probation and may pause/cancel; assigned Recruiter edits description/requirements only, no status. Head Recruiter/Admin manage operational fields/statuses, including reopening FILLED; specific Admin-only bonus and Admin/Head-HR probation controls take precedence. Admin/Head Recruiter manages the position catalog in scope and assigns the Team Lead on recruiter-initiated vacancies. No Team Lead means no submission/routing. Probation defaults to 90, range 30–90 days; only Admin/Head HR changes it; PROB-05 remains.

- **Visibility:** Admin all; Head Recruiter, Head HR and HR within their role's verticals; Team Lead only current own vacancies (`team_lead_id`, D67); Recruiter assigned vacancies plus unassigned `OPEN` in their verticals (D1). D53 application-owner read access is added with applications, before routing ships. No broader creator-based access is inferred.
- **Scope parity:** list, detail, search, filter options, counts and shared links use the same server-side scope. Finance/foreign vertical/deleted objects do not leak existence and return the inherited 404 behavior. Existing D63 MFA handling remains authoritative.
- **Persistence:** real database records through API/services/repositories; no application mock data. Migrations are additive, vacancy numbers never reused, soft-delete rules remain.
- **Writes:** validation and authorization on the server; stale versions reject atomically; every state change records audit and business history. The read slice emits no synthetic write events.
- **UI:** Ukrainian via messages; desktop and mobile; keyboard access; light/dark; distinct loading/error/empty/filtered-empty states. Heavy future blocks remain absent until real data and behavior exist.
- **Future integrations:** pipeline, candidate counts, bonuses and notifications are not represented by invented amounts, counts, timelines or inert controls.

## V1 — first end-to-end slice

### STORY-VAC-04-1: View and find permitted vacancies

As a **recruiting participant in my vertical**, I want a searchable list of the vacancies I may open, so that I can find the relevant hiring request.

**Acceptance criteria**

- Given persisted vacancies, When I open «Вакансії», Then the first screen already contains permitted data and the list remains consistent after reload.
- Given several vertical/role assignments, When I search by vacancy title/number or apply status/vertical filters, Then the result is the intersection of the filters and my allowed vacancies; URL/reload/Back preserve the selected filters.
- Given more than one page, When I page forward/back, Then a stable cursor order avoids duplicate or missing records; an invalid/unavailable cursor cannot reveal another scope. Output is bounded and long retained lists use the project's rendering policy.
- Given a vacancy, Then its number, title, vertical, available Team Lead/recruiter identities, actual VAC-02 status and urgency/source badges reflect persisted values. «Термінова» and «З бота» are badges rather than statuses (A-14/A-31).
- Given a Team Lead view, Then the list contains only their current own vacancies; a recruiter sees only assigned plus unassigned-open vacancies in their role's verticals. Changing the creator does not widen either scope.
- Given no data or no filter matches, Then the appropriate empty state is shown; filtered empty offers «Скинути фільтри». Given a failed request, Then retry is available and unrelated shell controls stay usable.
- (negative) Given Finance, a foreign-vertical user, or a recruiter seeking another recruiter's assigned vacancy, When they request the list/detail/search/filter options, Then no forbidden record, identity, count or title is returned.

**Data / validation:** position belongs to vacancy vertical; current Team Lead and recruiter assignments refer to the correct vertical; queries are schema-validated. Initial filters are search/status/vertical. Additional filters appear only with real scoped option endpoints.
**Events / notifications / statistics:** read-only; no notifications. Candidate funnel/hire counts wait for application data. Show the opening date while Q-86's pause-sensitive «Відкрита N днів» calculation is unresolved.
**Edges:** equal sort values, mixed roles/verticals, deactivated assignees retained as history, nullable Team Lead for recruiter-initiated vacancies, soft-deleted vacancies excluded, status/filter change resets cursor.

### STORY-VAC-04-2: Open a real read-only vacancy card

As a **user allowed to read a vacancy**, I want to open its details from the list or a direct link, so that I can understand the request and its responsible team.

**Acceptance criteria**

- Given a visible list row, When I select/open it, Then the desktop preview and full card identify the same persisted vacancy; mobile opens a usable full card. A close/back action returns to the list context.
- Given a direct vacancy URL, When I reload it, Then the same authorized record opens. A not-found or forbidden object returns an actual HTTP 404 using the existing protected-shell pattern.
- Given stored fields, Then the card shows the vacancy number, title, status, vertical, current Team Lead/recruiters and available vacancy details; fields absent from the stored request are represented honestly.
- Given an opening date, Then it is displayed in Europe/Kyiv; the ambiguous paused-days counter is not inferred from elapsed wall time.
- Given read-only V1, Then unimplemented create/edit/status/assignment/clone/delete/bulk actions and future candidate/bonus sections are absent, with no inert buttons or made-up pipeline data.
- (negative) Given an out-of-scope UUID or a copied link opened by Finance, Then the card/preview request returns 404 and discloses neither its title nor team.

**Data / validation:** detail returns only current-scope fields. Rich text is rendered safely; a future editor does not justify importing its bundle into the initial read screen.
**Events / notifications / statistics:** no read event is invented; real existing vacancy events may be shown only if their authenticated timeline is implemented in this increment. Full timeline interactions are V4.
**Edges:** missing/deleted record, background permission/assignment change, nullable Team Lead, long titles and mobile content, failed detail loading independent of the list.

### STORY-VAC-07-1: Stable human-readable vacancy identities

As a **recruiting participant**, I want a permanent vacancy number, so that a vacancy can be identified consistently in cards, lists, links and search.

**Acceptance criteria**

- Given any seeded or newly persisted vacancy, Then it has one unique company-wide number formatted `V-0001` or the corresponding longer sequence value.
- Given concurrent creation or soft deletion, Then numbers are unique and never reassigned; gaps do not change existing numbers. The internal UUID remains the API identity.
- Given search by number, Then only a vacancy the caller can read is returned.
- (negative) Given a caller without access, Then knowing a valid number does not reveal a vacancy or bypass the UUID-detail scope.

**Data / validation:** database-enforced uniqueness; later writes reuse the same allocation mechanism. Seed re-runs keep existing identities stable.
**Events / notifications / statistics:** number is part of real creation history when creation ships; no standalone read-side event or statistics change.
**Edges:** concurrent allocation, values over 9999, failed transaction leaving a sequence gap, idempotent seed, soft deletion and later restore.

### STORY-ROLE-06-1: Preserve open vacancy work during user/role changes

As an **Admin**, I want open vacancy work protected when a user or a role is removed, so that no active vacancy loses its responsible participant (D24/D43).

**Acceptance criteria**

- Given real open vacancy/assignment rows, When I inspect deactivation or role removal, Then the affected open work is detected rather than returning the Phase-1 no-domain-data result.
- Given affected work has not been reassigned under the relevant policy, When I submit deactivation or remove the responsible role, Then the change cannot complete, the user sees a clear Ukrainian explanation, and existing assignments/history remain intact. The check runs before any Auth-provider ban/session/factor change.
- Given the full reassignment flow in V3, When every affected group has a valid replacement, Then reassignment and the account/role operation meet D24/D43 with audited history.
- (negative) Given a non-Admin, foreign-vertical replacement, or a concurrently changed assignment, Then authorization/version checks prevent an invalid reassignment or partial deactivation.

**Data / validation:** relevant open vacancy responsibilities, active replacement's role/vertical, current versions; do not misclassify closed/deleted vacancies as open work.
**Events / notifications / statistics:** failed operations emit no successful role/account/vacancy state-change events; successful reassignment later records real changes atomically. No new Phase-1 notification behavior is invented.
**Edges:** last Admin/self restrictions remain; role removal affects only the work tied to that role; multiple roles in one vertical; concurrency between reassignment and deactivation.

V1 must preserve this safety property before introducing open work; the complete reassignment UI is delivered with V3. Its absence does not permit successful orphaning.

### STORY-SEED-2: Deterministic vacancy demonstration data

As the **owner reviewing V1**, I want realistic persisted vacancies across the demo users' scopes, so that I can inspect the design and permission differences.

**Acceptance criteria**

- Given the local seed, Then the Gambling/Crypto position catalogs and visible vacancy examples include Vasyl/Taras own vacancies, assigned and unassigned-open recruiter cases, and a recruiter-initiated vacancy without a Team Lead.
- Given repeat seeding without a reset, Then UUIDs/numbers remain stable and no duplicate positions/vacancies/assignments/events appear.
- Given the browser screenshot clock and dataset, Then desktop/mobile and light/dark captures are reproducible and included in the Phase-2 gallery.
- (negative) Given a hosted/nonlocal target, Then the inherited seed guards refuse to write; demo data never weakens application authorization.

**Data / validation:** real local database seed, Ukrainian labels, fixed causal timestamps and role-compatible assignments. No invented applications, counts, bonus schemes or active-work history is inserted merely to fill a future UI block.
**Events / notifications / statistics:** real creation/history seeds if the increment exposes a timeline; no emails/Telegram or placeholder aggregates.
**Edges:** existing demo data preserved; no database reset without owner authorization; numbering stays stable; role-scoped screenshot accounts see only their fixture records.

## V2 — expanded stories

Decisions: D76 (catalog owners), D77 (Team Lead assignment), D78 (probation), D86/D87 (request form, `OPEN`), D89 (no approval; `DRAFT` = author's draft; notifications), D90 (title/description/completeness), D92 (draft: only the author publishes and sees it), D93 (no notification delivery before Phase 5), D94 («Терміновість вакансії» ≠ «Пріоритет тімліда»), D95 (catalog menu item), D96 (rename keeps vacancy titles). UI labels from `docs/ux/glossary.md`; new copy marked _(proposed)_ is added to the glossary by design.

### STORY-VAC-POS-1: Manage the position catalog («Довідник посад»)

As an **Admin or Head Recruiter of a vertical**, I want to create, rename and deactivate positions, so that Team Leads and recruiters pick consistent job titles and routing groups stay stable (D76).

**Acceptance criteria**

- Given an Admin, When I open the catalog, Then I see positions of all verticals and can filter by vertical. Given a Head Recruiter of Гемблінг (only), Then I see and manage only Гемблінг positions; the list is scoped server-side like every other list.
- Given a vertical in scope, When I create a position «Медіабаєр — Facebook», Then it is active at once and selectable in new vacancy forms and Team Lead requests of that vertical.
- Given a name that already exists in the same vertical ignoring case and surrounding spaces (including a deactivated one), When I create or rename to it, Then the save is refused with a field error _(proposed)_ «Посада з такою назвою вже існує в цій вертикалі.»; the same name in another vertical is allowed. For a deactivated duplicate the message points to reactivation.
- Given a position, When I rename it, Then the new name shows in the catalog and in pickers immediately and history keeps old→new. Titles already stored on existing vacancies are not rewritten (D96); e.g. renaming «Медіабаєр — Facebook» to «Медіабаєр Facebook» leaves V-0001 titled «Медіабаєр — Facebook» while its position shows the new name.
- Given an active position used by open vacancies, When I deactivate it (`isActive = false`) after a confirmation that states how many open vacancies use it, Then those vacancies, their applications and routing group keep working and still show the position name; the position disappears from pickers of new vacancies/requests and is rejected by the API for new ones. Reactivation restores it. There is no delete.
- Given a position that becomes inactive while a Team Lead has the request form open, When the Team Lead submits, Then the submit is refused with a message to choose another position _(proposed)_ and the picker refreshes; no vacancy is created.
- (negative) Given a Team Lead, Recruiter, HR, Head HR or Finance, When they call a catalog create/rename/deactivate action, Then it is denied and nothing changes. Given a Head Recruiter of another vertical, Then the position is out of scope (404, no existence disclosure). A Team Lead/Recruiter sees positions only through the read-only picker of their own verticals (active ones); HR/Finance have no picker.
- (negative) Given two users renaming the same position, When the second saves with a stale version, Then it is rejected with a conflict and nothing is partially applied; two concurrent creates of the same name produce one position and one duplicate-name refusal.

**Data / validation:** vertical (required, fixed after creation), name (trimmed, not blank, unique per vertical case-insensitively — DB `(vertical_id, lower(name))`; maximum length fixed in design), `isActive`, version. Unique name applies to inactive rows too.
**Events / notifications / statistics:** audit and entity events `position.created`, `position.renamed` (old→new), `position.deactivated`, `position.reactivated`, each with actor and vertical; failed/denied attempts audited as security events per the existing pattern. No notifications. No statistics change (routing groups are unchanged by rename; a deactivated group simply gets no new vacancies).
**Edges:** deactivated Head Recruiter loses access immediately; a Head Recruiter heads exactly one vertical (D106; the earlier «several verticals» edge is void); soft-deleted/foreign positions are never offered; entry point for both Admin and Head Recruiter is the separate menu item «Довідник посад» outside «Налаштування» (D95; the settings area stays Admin-only).

### STORY-VAC-01-1: Create a vacancy or save a draft (Admin, Head Recruiter, Recruiter)

As a **Recruiter, Head Recruiter or Admin in a vertical**, I want to create a vacancy, or save it as a draft, so that a hiring need is recorded and, if recruiter-initiated, I can propose candidates before a Team Lead is known (VAC-03, D89).

**Acceptance criteria**

- Given a Recruiter of Гемблінг, When I create «Медіабаєр — Facebook» without a Team Lead, headcount 2, on 10.11.2026 10:00 (Kyiv), Then a vacancy with the next `V-NNNN` number is created `OPEN`, `recruiter_initiated = true`, source `APP`, opening date 10.11.2026, probation 90 days, bonus scheme inherited from the vertical default, me auto-assigned as recruiter; it is not eligible for Team Lead submission or routing until a Team Lead is assigned (D77). Only a plain Recruiter creator is auto-assigned: a Head Recruiter or Admin is the ASSIGNER and is not auto-assigned (D102); assigning himself later is D103.
- Given a Head Recruiter of Гемблінг (no Recruiter role needed, D104; he heads only this vertical, D106), When I assign myself as executor on a vacancy of Гемблінг, Then I appear among its recruiters with `assigned_by = me` and a `vacancy.recruiter_assigned` event is written (D103); my rights on the vacancy are not reduced to the Recruiter limits (VAC-08).
- (negative) Given an Admin, When I try to assign myself as executor (UI or API), Then I am not offered in the picker and the API answers 403 (D103); given a Head Recruiter of Крипто only, When I try to assign myself on a Гемблінг vacancy, Then it is refused (out of scope, 404 if I cannot see it); a deactivated user cannot be assigned.
- Given any authorised creator (Admin, Head Recruiter, Recruiter) on the create form, When I set «Терміновість вакансії» to «Термінова», Then it is stored at creation (D100); changing it afterwards needs `vacancy.update` (Head Recruiter/Admin) — a Recruiter is refused (403).
- Given an Admin or Head Recruiter in scope, When I create a vacancy and pick an active Team Lead of the same vertical, Then it is `OPEN` with that Team Lead and `recruiter_initiated = false`; leaving the Team Lead empty gives a recruiter-initiated vacancy.
- Given the create form, When I choose «Зберегти чернетку», Then a `DRAFT` is saved with only vertical and title required (position, dates optional); it has no opening date. Only I (the author) can see, edit, publish, cancel or delete it (D92; handled in STORY-VAC-01-3). When I publish it (`DRAFT` → `OPEN`), Then the opening date is the publish moment, not the save moment. A draft can be cancelled directly (D82) or soft-deleted (§12); the two are different.
- Given a new `OPEN` vacancy, Then it needs: vertical, active position of that vertical, title (prefilled with the position name, editable), headcount ≥ 1 (default 1). Optional: Team Lead, seniority, format, employment type, location, salary range (currency required when min or max is set; min ≤ max), description, requirements, priority (default Звичайна).
- Given probation length, bonus scheme or recruiter reward in the payload from anyone other than the permitted role (probation 30–90 — Admin/Head HR only, D78; bonus controls — Admin only), Then those fields are refused, not silently ignored; defaults apply.
- Given a double click or a retried request, Then exactly one vacancy is created (idempotency key); two concurrent creations get two different, never reused numbers.
- (negative) Given HR, Head HR, Finance, a Recruiter/Head Recruiter outside the vertical, or a Team Lead using the full form (Team Leads use the request, STORY-VAC-03-3), When they try to create, Then it is denied; a position of another vertical, an inactive position, or a Team Lead of another vertical or without the Team Lead role is refused with a field error.
- (negative) Given a recruiter-created vacancy, Then other recruiters of the vertical do not see it as "unassigned open" (the creator is assigned); a `DRAFT` is visible only to its author — not to Head Recruiter and not to Admin (D92); for anyone else it does not exist (404; absent from lists, search by `V-NNNN`, counts and statistics).

**Data / validation:** shared Zod schema for form and API; money as integer minor units + currency; time stored UTC, shown in Europe/Kyiv.
**Events / notifications / statistics:** `vacancy.created` (number, status, source, recruiter-initiated) and `vacancy.recruiter_assigned` for a Recruiter creator only (D102; also written when a Head Recruiter assigns himself, D103); no audit row for a draft, one audit row at publish with author and original creation date (D101); no notification for recruiter-initiated vacancies (D89 notifies on Team Lead requests only). Open-vacancy counters of the vertical change only when the status becomes `OPEN`; a `DRAFT` is counted nowhere except in its author's own «Чернетки» chip.
**Edges:** creation at 23:30 UTC shows next-day Kyiv date (UTC+2 after 25.10.2026); position deactivated during submit → refusal; creator later deactivated keeps history and open-work protection (D24/D43); clone (VAC-05) reuses these rules.

### STORY-VAC-01-3: Handle my own draft vacancy (author only)

As a **Recruiter, Head Recruiter or Admin who saved a draft**, I want to find, finish, publish, cancel or delete my draft, so that half-prepared needs do not clutter anyone else's work (D89, D92).

**Acceptance criteria**

- Given I saved a draft «Медіабаєр — Facebook» on 10.11.2026 (Kyiv), When I open «Вакансії» → chip «Чернетки», Then I see only my own drafts (with the chip count of my drafts) in the verticals where I still hold a vacancy-creating role.
- Given my draft, When I edit it and save again, Then only vertical and title are required; stale version (two tabs of mine) → conflict, nothing partially saved.
- Given my draft is complete (vertical, active position, title, headcount ≥ 1, valid optional fields), When I press «Опублікувати» _(proposed)_ on 11.11.2026 09:15 (Kyiv), Then it becomes `OPEN` with opening date 11.11.2026, counters of the vertical +1, it appears as unassigned `OPEN` to recruiters of the vertical (or only to me if I am a Recruiter and auto-assigned), and `vacancy.status_changed` `DRAFT → OPEN` is written. No approval and no notification (D89, D93).
- Given the position of my draft was deactivated or its Team Lead left the vertical after I saved, When I publish, Then publication is refused with field errors and the draft stays a draft.
- Given a draft, When I press «Скасувати» (`DRAFT → CANCELLED`, D82), Then it is closed with `cancelled_at` and a reason, and it is no longer editable; When I press «Видалити», Then it is soft-deleted (`deleted_at/by/reason`, §12) and not shown in «Скасовані». The two are never mixed.
- (negative) Given another Recruiter, Head Recruiter of the same vertical, Admin, Team Lead, HR, Head HR or Finance, When they request the draft by id, by link, by search «V-NNNN» or via list/filter/count, Then they get 404 / nothing; publish, edit, cancel and delete calls are denied the same way and nothing changes (including a Head Recruiter and an Admin: D92 overrides their scope grants).
- (negative) Given I lost the role or the vertical, or I am deactivated, When I try to open or publish the draft, Then it is denied (404 / sign-in impossible); the draft is retained, invisible to everyone, and returns to me if the role/account is restored (D98).
- (negative) Given an Admin (or Head Recruiter) wants to clean up the draft of a deactivated or departed author, Then no such action exists: no list, metadata view, delete, restore or purge of someone else's draft is offered, the user card shows no drafts, and API calls are denied (404); only the author deletes their own draft (D98). Orphaned drafts are accepted, not tracked as a gap.
- Given I have drafts and am deactivated (Admin deactivates me), Then my drafts do not count as open work (D24/D43) and do not block the deactivation; they are excluded from counters, search and statistics, and reappear in my «Чернетки» chip when I am reactivated.
- Given I publish a draft saved a week ago after losing access to its vertical, or after its position was deactivated, Then publish re-validates every `OPEN` rule and is refused (field errors / 403); the draft stays mine and unchanged (D98).
- (negative) Given I double-click «Опублікувати», or publish from two tabs, Then exactly one `DRAFT → OPEN` transition happens, the second gets a conflict (`vacancy.status_changed` once).

**Data / validation:** same shared Zod schema as STORY-VAC-01-1 with the relaxed save-draft subset; publish runs the full `OPEN` validation; `created_by` is immutable.
**Events / notifications / statistics:** `vacancy.created` (status `DRAFT`) on first save, `vacancy.updated` per save, `vacancy.status_changed` on publish/cancel, `vacancy.deleted` on delete; events of a `DRAFT` are visible only to its author while it is a draft; no notifications; no statistic or counter changes until `OPEN`.
**Edges:** concurrency per above; opening date = publish moment, not save moment; draft cancelled/deleted by the author never reaches Head Recruiter/Admin lists; a draft of a deactivated author stays hidden and returns on reactivation (D98) — excluded from the open-work guard D24/D43, counters, search and statistics; there is no Admin cleanup or delete action anywhere (D98); numbering: the draft consumes its `V-NNNN` at first save, gaps are accepted (D98), so a deleted draft's number is never reused; restoring or purging a draft by anyone other than the author is not offered (D98).

### STORY-VAC-03-3: Team Lead requests a vacancy («Запросити вакансію»)

As a **Team Lead in a vertical**, I want to request a hire in a few fields, so that recruiters start working on it at once (D86, D87, D90).

**Acceptance criteria**

- Given Team Lead Vasyl (Гемблінг), When I open the request form, Then I choose a position from the active positions of my verticals, set headcount (≥ 1), urgency (Звичайна / Термінова) and an optional comment; vertical and Team Lead (me) are not editable.
- Given a valid request for «Медіабаєр — Facebook», headcount 1, «Термінова», comment «Потрібен досвід з Facebook Ads», When I submit, Then an `OPEN` vacancy is created at once: title = «Медіабаєр — Facebook», description = my comment, `team_lead = me`, `recruiter_initiated = false`, source `APP`, probation 90, bonus inherited, other fields (seniority, format, employment type, salary range, requirements) empty and shown as not specified; no `DRAFT` and no approval step exist.
- Given the vacancy, Then I see it in my own list; every recruiter of the vertical sees it as an unassigned open vacancy and can self-assign (D1), or the Head Recruiter/Admin assigns recruiters. The Head Recruiter/Admin complete the missing fields and may change urgency; I cannot change urgency, bonus scheme or probation afterwards (VAC-08).
- Given the request, Then all active Recruiters of the vertical and the Head Recruiter(s) of that vertical are in the addressee list of the creation event; the requester, deactivated users and users of other verticals are not. No notification is delivered in Phase 2 (no notification layer before Phase 5, D93): the vacancy simply shows among the unassigned `OPEN` vacancies of recruiters of the vertical; the Head Recruiter sees it in the vertical's list as usual.
- Given the position I need is not in the catalog, Then I cannot submit a request; the picker explains that Admin or Head Recruiter of the vertical must add the position first _(proposed copy)_. There is no free-text position.
- Given a double click or retry, Then one vacancy is created (idempotency key); two deliberate requests for the same position are two vacancies.
- (negative) Given a Recruiter, Head Recruiter, Admin, HR, Head HR or Finance using the request endpoint as a Team Lead, or a Team Lead without the role in the position's vertical, When they submit, Then it is denied (position of a foreign vertical → 404); a deactivated user cannot sign in at all.
- (negative) Given an inactive position at submit time, Then the request is refused and no vacancy appears.

**Data / validation:** position (required, active, in a vertical where I am Team Lead), headcount (integer ≥ 1; upper limit set in design), urgency (enum, default Звичайна), comment (optional, bounded length, plain text).
**Events / notifications / statistics:** `vacancy.created` (requested by Team Lead, status `OPEN`, with the addressee list: active Recruiters + Head Recruiter(s) of the vertical, excluding the requester); no notification is sent in Phase 2 — delivery is added in Phase 5 from this event (D93); open-vacancy counters of the vertical +1.
**Edges:** Team Lead with several verticals — the position decides the vertical; Team Lead who is also a Recruiter in the vertical (D35) requests as Team Lead; Team Lead deactivated later — the vacancy keeps the «неактивний» marker (D79) and open-work protection (D24/D43); opening date is the Kyiv date of submission; no Team Lead priority is needed to request (D47 applies only to routing later).

### STORY-VAC-08-2: Change vacancy urgency vs Team Lead priority (two separate controls)

As a **Head Recruiter or Admin**, I want to mark a vacancy «Термінова» without touching how candidates are distributed among Team Leads, so that urgency and routing order stay independent (D94, VAC-08, ROUTE-01).

**Acceptance criteria**

- Given vacancy V-0007 requested as «Звичайна» by Team Lead Vasyl, When Head Recruiter of Гемблінг sets «Терміновість вакансії» to «Термінова», Then the flag changes through `vacancy.update`, history records «Звичайна → Термінова» with actor/time, and Vasyl's «Пріоритет тімліда» (П0) and routing order are unchanged.
- Given Admin, When they set «Пріоритет тімліда для цієї вакансії» (`vacancy.priority.override`), Then only the routing order for that vacancy changes (e.g. Taras П1 placed before Vasyl П0 for V-0007), «Терміновість вакансії» is unchanged, and the change is audited.
- (negative) Given Team Lead (author of the request), Recruiter, HR, Head HR or Finance, When they try to change the urgency, Then it is denied and unchanged; Head Recruiter and any non-Admin trying to set «Пріоритет тімліда для цієї вакансії» is denied (aal2 withheld/not granted); an Admin's valid aal2 session is required for the override.
- (negative) Given a Head Recruiter of another vertical, Then the vacancy is out of scope (404); given a `DRAFT` of someone else, Then it does not exist for them (D92).
- Given two users changing urgency at once, Then the second gets a stale-version conflict.

**Data / UX copy:** field labels «Терміновість вакансії» (Звичайна/Термінова) and «Пріоритет тімліда для цієї вакансії»; the bare «Пріоритет» is not used on vacancy screens or filters (filter «Пріоритет» → «Терміновість»).
**Events / notifications / statistics:** `vacancy.updated` (urgency old→new) / `vacancy.priority_overridden` (Admin); no notification in Phase 2; routing consumes only the TL priority (Phase 3).
**Edges:** closed (`FILLED`/`CANCELLED`) vacancies — urgency edit denied by status rules (VAC-08); override on a vacancy without a Team Lead is meaningless and refused (D77).

### STORY-VAC-04-4: Urgent vacancy is highlighted red

As **any user who can see a vacancy**, I want an urgent vacancy to stand out in red, so that I notice what needs attention first (D97).

**Acceptance criteria**

- Given V-0007 with «Терміновість вакансії» = «Термінова», When it appears in the vacancy list (table row on desktop, card on mobile), the preview panel or the vacancy detail header, Then it is highlighted red (soft destructive tokens: `--destructive-subtle` background, `--error-text` text, `--destructive` accent edge/border) and the text «Термінова» is shown next to the title. The current amber «Термінова» badge (`warning` tokens) is replaced.
- Given a «Звичайна» vacancy, Then it has no highlight and no urgency label.
- Given the theme is light or dark, Then the highlight meets WCAG AA contrast (≥ 4.5:1 for text; ratios from `docs/ux/design-system.md` §contrast) and the label text is present; colour is never the only signal (screen readers read «Термінова»; selected-row and hover states remain distinguishable from the urgent highlight).
- Given a board/kanban header or any other future place that shows a vacancy (add-to-vacancy pickers, candidate card vacancy chip), When built, Then the same highlight and label apply (shared component).
- Given Head Recruiter changes urgency «Звичайна» → «Термінова» (STORY-VAC-08-2) and the list is open in another tab, When the data refreshes (background refetch / invalidation), Then the row turns red and back without a reload; a `DRAFT` highlighted only for its author (D92).
- Given an urgent vacancy in a non-closed status — `DRAFT` (visible only to its author, D92), `OPEN` or `ON_HOLD` — Then the red highlight and the text «Термінова» are shown; an urgent `ON_HOLD` vacancy shows the red highlight plus the «Призупинена» status badge.
- Given an urgent vacancy in a closed status — `FILLED` («Заповнена») or `CANCELLED` («Скасована») — e.g. V-0003 «Медіабаєр — Facebook», When it appears in the «Заповнені»/«Скасовані» filters, the list, the preview panel or the detail header, Then it is NOT highlighted red (no destructive background/edge/text colour), but the text «Термінова» stays in the neutral badge style (D99, owner: «Підсвічувати, якщо неактуальна, то логічно що не підсвічувати»); the urgency filter «Терміновість» = «Термінова» still finds it.
- Given an urgent `OPEN` vacancy that becomes `FILLED` (automatic, hires = headcount) or `CANCELLED`, When the status changes, Then the red highlight disappears at once and the neutral «Термінова» stays; Given Head Recruiter/Admin reopens a `FILLED` urgent vacancy (D75), Then the red highlight returns; the stored urgency is never changed by a status change.
- (negative) Given a user without access to the vacancy, Then no urgent indicator, count or red styling leaks (the list scope is unchanged, 404 for foreign vacancies); the urgency filter «Терміновість» does not reveal hidden vacancies.

**Data:** `priority = URGENT` only; no new fields. **Events / statistics:** none; no notification. **Screenshot expectation (SHOT-01..03):** urgent vacancy row/card in list, preview panel and detail header for Admin and Recruiter, light and dark, desktop 1440×900 and mobile 390×844; seed keeps at least one urgent open vacancy for each vertical (e.g. «Медіабаєр — Facebook» for Vasyl «Термінова») next to a «Звичайна» one, **plus one urgent `FILLED` and one urgent `CANCELLED` vacancy** (neutral «Термінова» badge, no red) shown in the same screens and states, so the gallery proves the open-red vs closed-neutral contrast; an urgent `ON_HOLD` vacancy (red + «Призупинена») is also captured.
**Edges:** a long title wraps without hiding the label; an urgent vacancy that is also `ON_HOLD` keeps the highlight and shows the status badge too; filter «Терміновість» = «Термінова» shows every urgent vacancy of the selected statuses — red rows for `DRAFT`/`OPEN`/`ON_HOLD`, neutral-badge rows for `FILLED`/`CANCELLED`; the red/neutral decision is one condition on status in the shared component (D99); "closed" is derived from VAC-02 only (`FILLED`, `CANCELLED`), never from dates.

## V2–V4 — subsequent vacancy stories

| Story           | User outcome and acceptance boundary                                                                                                                                 | Questions / dependencies                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| STORY-VAC-01-1  | Expanded in «V2 — expanded stories» below (create / save draft by Admin, Head Recruiter, Recruiter)                                                                  | D76/D78/D89/D90/D92/D98 confirmed; draft handling in STORY-VAC-01-3                                            |
| STORY-VAC-POS-1 | Expanded below (position catalog)                                                                                                                                    | D76/D95/D96 confirmed                                                                                          |
| STORY-VAC-01-2  | Allowed users edit only their permitted fields; stale writes reject; before/after history is atomic; foreign scope and prohibited field patches denied               | D75/D78 confirmed; operational edit rights never override Admin-only bonus or Admin/Head-HR probation controls |
| STORY-VAC-02-1  | Authorized status actions respect VAC-02; automatic FILLED requires real probation/headcount integration; unauthorized/manual shortcuts denied                       | D75 confirmed; candidate/pipeline integration for auto-fill                                                    |
| STORY-VAC-03-1  | Admin/Head Recruiter assign eligible recruiters; recruiter self-assigns only to an unassigned OPEN vacancy in their vertical; concurrent claims cannot double-assign | D1; V1 database scope and assignment model                                                                     |
| STORY-VAC-03-2  | Recruiter-initiated vacancy is created `OPEN` (D89) with no Team Lead until authorized assignment; no submission/routing before assignment                           | D77/D89 confirmed: Admin/Head Recruiter assigns Team Lead; no submission/routing before assignment             |
| STORY-VAC-03-3  | Expanded in «V2 — expanded stories» below (Team Lead «Запросити вакансію»)                                                                                           | D86/D87/D89/D90/D93 confirmed (notification delivery in Phase 5)                                               |
| STORY-VAC-04-3  | Candidate list/mini-funnel and every related count include only applications the viewer can open; histories show real changes                                        | D19/D52/D53; real candidates/applications, timeline sensitivity rules                                          |
| STORY-VAC-05-1  | Clone creates a separately numbered vacancy without changing the original; optional rejected-good suggestions use real eligible applications                         | Candidate/application data; clone-field/candidate rules reviewed before shipping                               |
| STORY-ARCH-03-1 | Soft-delete never abandons active applications; permitted resolution is required and atomic; unauthorized recruiter deletion is rejected per D13                     | ARCH-03; Q-100; archive/restore user flows remain Phase 5                                                      |
| STORY-UI-09-1   | «Поділитися» copies the actual vacancy link; the recipient's access is checked independently and denied access returns 404                                           | D58; usable vacancy card and accessible copy-failure state                                                     |

Each subsequent write story is expanded into Given/When/Then, field validation, event/notification/statistics effects and edge cases before its implementation; this table is the delivery backlog rather than acceptance of unanswered policy.

## Queued tasks (owner: not started)

### STORY-ROLE-07-1: Role-combination enforcement (queued, not started)

As an **Admin**, I want «Користувачі та ролі» to refuse role sets that break the role rules, so that the data matches D105..D108. **Owner 2026-11-09: do not start; queued only (D109).**

**Acceptance criteria**

- Given an invite, «Змінити ролі» or «Активувати знову» whose role set contains ADMIN or FINANCE together with any other role, or `HEAD_RECRUITER` in more than one vertical, Then the API refuses it (422 `ROLE_COMBINATION_INVALID`, field error on `body.roles`) and nothing is saved; accepting an invite re-checks the same rule.
- Given the RoleMatrix, Then it cannot produce an invalid combination (selecting ADMIN or FINANCE clears and disables the other roles; selecting `HEAD_RECRUITER` in a vertical disables it in the others) and shows a Ukrainian hint.
- Given HR, Head HR, Team Lead or Recruiter in several verticals, or several Head Recruiters in one vertical, Then it stays valid (D108).
- Before the rule ships, existing users are checked and a list of violating users is given to the owner for a decision; no data is changed silently.
- (negative) Given a non-Admin or an Admin at aal1, Then the role screens stay denied exactly as today.

**Data / events:** no schema change except a possible check of existing rows; `user.roles_changed` audit unchanged. **Tests:** void legacy fixtures MFA-07 and `finance.rec@fixture.test` (FIN-09) are replaced by refusal tests.

## Traceability

| PRD / decision                           | Stories          | Test evidence                                                                                            |
| ---------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------- |
| VAC-01/02/04, VIS-01..03, D1/D19/D53/D67 | STORY-VAC-04-1/2 | QA fills actual integration/API/browser cases after implementation                                       |
| VAC-07                                   | STORY-VAC-07-1   | QA fills uniqueness, scope and number-search cases                                                       |
| ROLE-06, D24/D43/D45                     | STORY-ROLE-06-1  | QA fills open-work account/role-denial and later reassignment cases                                      |
| CLAUDE §8, SHOT-01..03                   | STORY-SEED-2     | QA fills idempotence and Phase-2 gallery cases                                                           |
| VAC-01/02, D78/D89                       | STORY-VAC-01-1   | QA fills create/draft/validation/denied-role cases                                                       |
| VAC-02, D82/D89/D92/D98, ARCH-01         | STORY-VAC-01-3   | QA fills author-only draft, publish race, no-Admin-action, deactivated-author and denied-role cases      |
| VAC-08, ROUTE-01, D90/D94                | STORY-VAC-08-2   | QA fills urgency vs TL-priority separation and denied-role cases                                         |
| VAC-04, D97/D99, UI-xx, SHOT-01..03      | STORY-VAC-04-4   | QA fills red highlight by status (open red / closed neutral), label, light/dark contrast and screenshots |
| VAC-03, D1/D86/D87/D89/D90               | STORY-VAC-03-3   | QA fills request, recipients, idempotency and denied-role cases                                          |
| §3 positions, D76                        | STORY-VAC-POS-1  | QA fills scope, uniqueness, deactivation and denied-role cases                                           |
| VAC-01..05, ARCH-03, UI-09               | V2–V4 backlog    | Expanded and linked as each increment starts                                                             |

## Ready for design

- V1 scoped list/search/status/vertical, real read-only preview/detail and numbers, deterministic seed and existing-account open-work safety.
- V2/V3 write-policy design is unblocked by owner decisions D75–D78 and D86–D91; implementation still follows V1 rather than silently expanding the first slice. V2 stories: STORY-VAC-POS-1, STORY-VAC-01-1, STORY-VAC-01-3, STORY-VAC-03-3, STORY-VAC-08-2, STORY-VAC-04-4 (D89..D99 confirmed).
- Match the designer's visual hierarchy with actual configured vertical names, approved statuses/badges, cursor pagination and role-aware fields.

## Blocked by questions

- **V1 days-open counter:** resolved by D85 — exact opening date only.
- **V2 vacancy creation:** not blocked. Q-166..Q-172 are resolved by D86–D99. Drafts: author-only lifecycle, no Admin action, orphaned drafts accepted (D98); no gap to track.
- **Follow-up (not a V2 blocker):** cleanup task for the inert approval setting (`vacancy_approval_enabled`, S-14 toggle, `vacancy.approve`) — D89; owner confirms before anything is removed.
- **HR/Head HR screen (D88/D91):** outside the vacancy slices; built with the polygraph queue (Phase 3). Until then they land on «Вакансії».
- **Later deletion increment:** Q-100 per-application deletion resolution when active applications arrive. Q-26/48/49/50 are resolved by D75–D78 and no longer block writable vacancy design.
- **Future blocks:** Q-98 routing-group visibility (Phase 3), Q-106/107/110/111 reward-change details (Phase 4), Q-152 dashboard KPI definitions. These do not block V1 and are not silently accepted.
