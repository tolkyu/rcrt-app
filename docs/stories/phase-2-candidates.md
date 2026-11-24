# Phase 2 — Candidates · User stories

> Companion to `docs/stories/phase-2.md` (vacancies). Scope: candidate part of PRD §15 Phase 2 — CRUD, files (CV), dedupe, talent pool, cards, dashboard v1 KPI, search, plus the application link that V4 needs. The shared rules of `phase-2.md` (visibility parity, persistence, writes, UI, no inert controls) apply unchanged. Code state 2026-11-24: permission codes exist in `server/authz/permissions.ts` / `roles.ts`; no `candidate`, `application`, `candidate_file` or `comment` table exists yet.
> Pipeline transitions (§6), routing (§7), comments/@mentions (Q-27), private notes (CAND-07), archives/restore/purge UI (§12) and notifications stay in Phases 3/5. Labels from `docs/ux/glossary.md`; new copy is marked _(proposed)_.

## Delivery order

| Inc | Deliverable                                                                                                                                                                                            | Depends on                                            | Unblocks                       | Questions                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------ | --------------------------------- |
| C1  | Schema (`candidate`, `application` read side, `candidate_file`), deterministic seed, scoped candidate list (table) with search/filters, read-only card (profile, applications, history)                | V1 shell; ADR for photo + candidate `version` columns | all others                     | resolved: D138, D139, D143        |
| C2  | Create / edit profile, exact-match dedupe block, former-employee flag                                                                                                                                  | C1                                                    | C3–C7, C10                     | Q-122, Q-47, Q-51; resolved: D140 |
| C3  | Files: CV versions, attachments, photo — signed URLs after authz                                                                                                                                       | C2                                                    | TL card CV, C6 merge of files  | Q-90, Q-124; resolved: D141       |
| C4  | Applications: «Додати до вакансії» (stage `NEW`), applications on the candidate card, candidate list on the vacancy card with visible-only counts, D53 read access, ROLE-06 open work for applications | C2                                                    | **V4** (all items), C5, C7, C9 | resolved: D142                    |
| C5  | Talent pool («Кадровий резерв»): filter, after-save choice, «Запропонувати з резерву»                                                                                                                  | C4                                                    | ARCH-03 «move to talent pool»  | —                                 |
| C6  | Possible duplicates, merge, 180-day takeover                                                                                                                                                           | C2, C4                                                | —                              | Q-45; resolved: D143              |
| C7  | Soft delete of a candidate; vertical transfer (CAND-06)                                                                                                                                                | C4                                                    | Phase 5 Deleted archive        | Q-52; resolved: D144              |
| C8  | «Поділитися» on the candidate card                                                                                                                                                                     | C1                                                    | STORY-UI-09-1 closure          | —                                 |
| C9  | Dashboard KPI row (counts)                                                                                                                                                                             | C4                                                    | —                              | Q-152; resolved: D145             |
| C10 | Global search Ctrl+K — candidate results                                                                                                                                                               | C1 (C2 for real data)                                 | —                              | resolved: D143                    |

**What V4 needs from this file**

| V4 item (`phase-2.md`)                                       | Needs                                                     | Still blocked by                      |
| ------------------------------------------------------------ | --------------------------------------------------------- | ------------------------------------- |
| STORY-VAC-04-3 visible-only funnel/counts, linked candidates | C1 + C4                                                   | —                                     |
| Full vacancy history with application events                 | C4 (`application.created` events)                         | —                                     |
| STORY-VAC-05-1 clone with rejected-good suggestions          | C4 + rejected applications (Phase 3 reject, or seed only) | Q-127 (D142 covers `NEW` reject only) |
| STORY-ARCH-03-1 delete vacancy with active applications      | C4 + C5 (talent pool target) + reject (Phase 3)           | Q-100 (D142 covers `NEW` reject only) |
| D53 recruiter read access to a vacancy via own application   | C4 (STORY-VIS-03-1)                                       | —                                     |

## Shared candidate rules

- **Scope (authz §2.2/§3):** Admin `G`; Head Recruiter `V`; Recruiter `own` (`sourcer_id`, candidate `owner_id`, or owner of any of its applications); Head HR / HR `V≥P` (only candidates with an application that reached `POLYGRAPH`, also after it ended — D52); Team Lead `sub` (application on a vacancy with `team_lead_id = me` and `max_stage_reached ≥ SUBMITTED_TO_TL`, also after it ended — D52); Finance — nothing (all candidate routes 404). List, card, search, filter options, counts, pickers and links use the same predicate.
- **Errors:** out-of-scope or soft-deleted object → 404 (never 403 on read); readable but action not granted → 403; Admin at aal1 → 401 `MFA_REQUIRED`; stale `expectedVersion` → 409 `STALE_STATE`; no-op → success without version/audit/event.
- **Contacts (D20, D48):** email, phone, Telegram only with `candidate.contacts.read` (Admin, Head Recruiter, Recruiter own, Head HR/HR from Polygraph). Team Lead gets no structured contact field in any DTO, search match or history entry; LinkedIn/portfolio URLs and CV files are shown to him as is.
- **Applications on the card (D52):** Team Lead and HR/Head HR see only "their" applications; all other applications, their events and counts are absent, not greyed.
- **PII:** no names, emails, phones, Telegram, salaries, filenames or URLs in logs, Sentry or analytics; PII columns tagged `pii` for the Phase 5 purge (ERD §3.8, ARCH-04) — photo, CV, attachments, field-change values in `entity_event_pii`; files only through signed URLs minted after a scoped authz check (60 s, `no-store`, never in list/card DTOs — P2-04).
- **Writes:** Zod `.strict()`; one transaction = row + `entity_event` + `audit_log`; no client-set `sourcerId`/`ownerId`/`verticalId` except where a story says so; write limit 30/min per user (existing pattern).
- **Time/money:** UTC stored, Europe/Kyiv shown (`dd.MM.yyyy`, `HH:mm`); expected salary = integer minor units + currency.
- **Notifications:** none delivered in Phase 2 (D93); events carry ids only.
- **Perf (PERF-02/05):** every list = one query with the scope predicate, cursor pagination `(last_activity_at DESC, id DESC)`, no JS post-filter, P95 list < 150 ms and card < 100 ms on the PERF-01 seed (50k candidates); card data loaded in parallel; tables virtualized.

---

## C1 — Schema, seed, list and read-only card

**Roles in C1**

| Role           | List «Кандидати»               | Card | Contacts                    | Applications shown                   |
| -------------- | ------------------------------ | ---- | --------------------------- | ------------------------------------ |
| Admin          | all                            | all  | yes                         | all                                  |
| Head Recruiter | own vertical                   | same | yes                         | all in vertical                      |
| Recruiter      | own                            | own  | yes                         | all applications of an own candidate |
| Head HR / HR   | reached Polygraph, in vertical | same | yes                         | only those that reached Polygraph    |
| Team Lead      | submitted to his vacancies     | same | no (LinkedIn/portfolio yes) | only on his vacancies                |
| Finance        | no menu item; 404              | 404  | —                           | —                                    |

### STORY-CAND-04-1: Find the candidates I may open («Кандидати»)

As a **recruiting participant in my vertical**, I want a searchable candidate list limited to what I may open, so that I find the person I work with.

**Acceptance criteria**

- Given the seed, When `recruiter1.gambling@demo` opens «Кандидати», Then the first screen already holds data (RSC prefetch) and lists only candidates he sourced or owns, ordered by last activity; `recruiter2.gambling@demo`'s candidates are absent.
- Given `vasyl.tl@demo`, Then only candidates with an application on Vasyl's vacancies at `SUBMITTED_TO_TL` or later (including ended ones) are listed; Андрій Мельник at `IN_WORK` on Vasyl's vacancy is absent.
- Given `hr@demo` (both verticals, D46), Then only candidates with an application that reached `POLYGRAPH` in Гемблінг or Крипто are listed.
- Given a row, Then it shows: photo or initials, ПІБ, current role · company, active applications (stage chip + vacancy number/title, only applications the viewer may open), «Відповідальний», «Джерело», tags, last activity (Kyiv date), badge «Резерв» when the candidate has no active application (only for full-scope viewers, see Data), probation marker «Випробувальний · N дн. залишилось» while on probation (D64).
- Given search text of ≥ 3 characters (phone ≥ 5 digits; D143), When I search, Then name — and contact fields only for roles holding `candidate.contacts.read` — are matched; a Team Lead typing a phone number gets no match by phone.
- Given filters «Етап», «Вакансія», «Вертикаль», «Відповідальний», «Джерело», «Теги», «Лише резерв», When combined, Then the result is the intersection with my scope; filter options list only values from my scope; URL, reload and Back keep them; any filter change resets the cursor.
- Given more than one page, Then cursor paging has no duplicates or gaps on equal `last_activity_at`; a tampered cursor reveals nothing outside scope.
- Given no data → empty state; filtered empty → «Нічого не знайдено за фільтрами» + «Скинути фільтри»; request error → retry, shell usable.
- (negative) Given Finance, When he calls the list, filter-options or search endpoint, Then 404 and no menu item. Given a Recruiter, Then no other recruiter's candidate, count or tag value is returned. Given Head Recruiter Крипто, Then no Гемблінг candidate is returned, also with `?verticalId=<Гемблінг>` (empty list, not an error).

**Data / validation:** query schema-validated; tags and source from closed/known lists; soft-deleted and merged-away candidates excluded. «Резерв» = candidate has no active application at all (glossary); for viewers with partial application scope (TL, HR) the badge is not shown, because it would disclose other applications' state.
**Events / notifications / statistics:** read-only; none.
**Perf:** one query: scope predicate (IDX-14/15/N31 + application EXISTS via IDX-05/06/07/08) + LATERAL for visible active applications; trigram GIN IDX-16 for search; virtualized table; mobile = card list.
**Copy:** `candidates.list.title` «Кандидати», `candidates.list.searchPlaceholder` «Пошук за ПІБ, email, телефоном…» _(proposed; TL variant «Пошук за ПІБ…»)_, `candidates.list.badge.pool` «Резерв», `candidates.list.empty.recruiter` «Ще немає кандидатів», `common.filters.empty` «Нічого не знайдено за фільтрами», `common.filters.reset` «Скинути фільтри».
**Edges:** candidate with applications in two vacancies of different TLs (Vasyl sees one chip, Taras the other); deactivated owner shown with «неактивний» (D142); purged stub not listed (Phase 5); Kyiv date boundary on last activity (23:30 UTC 19.11 → 20.11.2026).

### STORY-CAND-04-2: Open a read-only candidate card

As a **user allowed to read a candidate**, I want the card with profile, applications and history, so that I understand who the person is and where they are.

**Acceptance criteria**

- Given a visible row or a direct `/candidates/{id}` URL, When I open it, Then the card shows header (photo/initials, ПІБ, current role · company, status «Активний»/«Резерв» per edge rule of CAND-04-1, contacts row per role), info strip (vacancy of the selected application, «Джерело», «Відповідальний», «Зарплатні очікування» — visible to every card reader incl. TL and HR (D139), tags), application switcher if > 1 visible application, read-only stepper (HIST-02) of the selected application, tabs «Історія», «Профіль», «Резюме», «Файли» (files tabs appear with C3).
- Given `?app=<id>` of an application the viewer may not open, Then the card opens on the first visible application; the hidden id is not acknowledged.
- Given `vasyl.tl@demo` opening Ігор Бондаренко (probation day 35 on Vasyl's vacancy), Then he sees that application, the stepper up to «Випробування» with «День 35 з 90», LinkedIn link, no email/phone/Telegram in markup or JSON, and no other application of Ігор.
- Given «Історія», Then events of the candidate and of visible applications only, newest first, cursor «Показати ще», filters «Усі / Етапи / Поля / Файли»; profile-field changes show field names only («Змінено: Телефон»), values only in Admin «Журнал дій» (D139).
- Given the card is read-only in C1, Then no edit, move, comment, notes, bonus, delete or transfer controls are rendered (no inert buttons); «Коментарі», «Бонус» and «Приватні нотатки» blocks are absent until their phases.
- Given mobile 390 px (TL first-class), Then header with LinkedIn icon button, tabs «Інфо · Історія · Резюме», compact stepper; no «Дії з кандидатом» sheet while no action exists.
- Given loading → skeleton of header, strip, stepper, 6 feed rows (no layout shift); card error independent of list; history error retry inside the tab.
- (negative) Given an out-of-scope id (recruiter2 → recruiter1's candidate; HR → candidate at `IN_WORK`; Taras → candidate only on Vasyl's vacancy; Finance; soft-deleted), Then HTTP 404 page identical to an unknown id; no name in title, metadata or error body.

**Data:** single DTO built per role: contact fields omitted (not nulled-with-key) for TL; application list pre-filtered by scope.
**Events / statistics:** reading writes nothing (CV downloads are audited in C3).
**Perf:** card < 100 ms: candidate row, visible applications, first history page via `Promise.all`; history IDX-31 cursor.
**Copy:** `candidates.card.status.active` «Активний», `candidates.card.status.pool` «Резерв», `candidates.card.tabs.history|profile|cv|files` «Історія», «Профіль», «Резюме», «Файли», `candidates.card.pool.empty` «Кандидат у кадровому резерві», `candidates.history.empty` «Подій такого типу немає».
**Edges:** routed chain Vasyl → Taras: Vasyl sees only his ended application (D52), Taras only his; candidate transferred to Крипто (seed): old-vertical roles see only the closed applications in their vacancy lists, the card → 404 (D144); deactivated sourcer/owner marker (D142); long names wrap on 320 px.

### STORY-SEED-3: Deterministic candidate demonstration data

As the **owner reviewing candidates**, I want realistic Ukrainian candidates across the demo users' scopes, so that I can see every role difference.

**Acceptance criteria**

- Given `pnpm db:seed`, Then ~30 candidates exist per CLAUDE.md §8 / ERD §9.1: Гемблінг and Крипто; owners `recruiter1`, `recruiter2`, `recruiter.crypto`, one sourced by `head.recruiter.gambling`; 2+ talent-pool candidates; applications on Vasyl's and Taras's «Медіабаєр — Facebook» vacancies at later stages as stage + history events only, no Phase 3 sub-records (D138), including one at probation day 35 (fixed clock), one rejected, one routed Vasyl → Taras, one at Polygraph (visible to HR), one deleted candidate.
- Given re-seeding, Then UUIDs, `public_no` and events are stable; no duplicates; dedupe keys unique company-wide.
- Given a nonlocal target, Then the seed refuses to write (inherited guard).
- (negative) Seed data never bypasses CHECKs/triggers (vertical consistency, ROUTE-06 index, application closed CHECK).

**Data:** realistic Ukrainian names, `+380` phones, `@demo`-free candidate emails on reserved domains (e.g. `example.com`); CV files are small generated PDFs, no real personal data. **Perf seed** (`db:seed:perf`, PERF-01) adds 50k candidates — delivered with C1 so list budgets are verified.

---

## C2 — Create and edit

**Roles in C2**

| Role                     | Create                       | Edit profile | Set former-employee flag | Clear flag              |
| ------------------------ | ---------------------------- | ------------ | ------------------------ | ----------------------- |
| Admin                    | any vertical                 | any          | yes                      | yes, aal2, reason (D66) |
| Head Recruiter           | own vertical                 | in vertical  | yes                      | no                      |
| Recruiter                | own verticals                | own          | own                      | no                      |
| Head HR / HR / Team Lead | no (403 on route, no button) | no (403)     | no                       | no                      |
| Finance                  | 404                          | 404          | 404                      | 404                     |

Profile-edit holders follow the Q-122 default (Admin, Head Recruiter in vertical, Recruiter own); confirm with the owner.

### STORY-CAND-01-1: Create a candidate («Новий кандидат»)

As a **Recruiter, Head Recruiter or Admin**, I want to add a candidate with their profile, so that the person exists once in the company and I am credited as sourcer (CAND-01, D51, D84).

**Acceptance criteria**

- Given `recruiter1.gambling` on 20.11.2026 10:00 Kyiv, When he saves «Олена Шевчук», email `Olena.Shevchuk@Example.com `, phone `067 123 45 67`, source «LinkedIn», Then a candidate in Гемблінг is created with `sourcer_id = recruiter1`, `sourcer_since` = creation time, `owner_id = recruiter1`, `last_activity_at` = creation time, `email_normalized = olena.shevchuk@example.com`, `phone_e164 = +380671234567` (default region Ukraine, D140), status «Резерв»; the after-save step offers «Додати до вакансії» (C4) / «Залишити в резерві» (C5); «Подати на посаду» is absent until routing (Phase 3).
- Given a user with candidate-create in one vertical, Then the vertical is preset and fixed; with several, he chooses one of his verticals (header switcher sets the initial value, D83 pattern); after creation it changes only by transfer (C7).
- Given a Head Recruiter creator, Then he is sourcer (D35). Given an Admin creator, Then he must pick an active Recruiter/Head Recruiter of the vertical as sourcer (D140); without it → 400 field error; the Admin is never sourcer (D51).
- Given required/optional fields: ПІБ required (trimmed, 2–200 chars, no line breaks); at least one contact or LinkedIn is not required by the PRD (leave optional); email RFC-valid; phone parsed to E.164 or field error; Telegram `@handle` or `t.me/handle` → `handle` (5–32 chars, `[a-z0-9_]`); LinkedIn `https://` only, normalized `linkedin.com/in/<slug>`; portfolio URLs `https://` only, ≤ 5; location, current company, current title ≤ 200; expected salary amount > 0 with currency (Q-51 list) or both empty; summary rich text (shared editor, validated JSON); source from the fixed list «LinkedIn, Djinni, Telegram, Рекомендація, Інше», tags free text ≤ 20 × ≤ 30 chars (D140); consent optional, date = Kyiv date when ticked, may be earlier, never future (D140).
- Given a double click or retry, Then one candidate (idempotency key).
- Given an exact duplicate, Then STORY-CAND-02-1 applies and nothing is created.
- (negative) Given Head HR, HR, Team Lead, When they call create, Then 403; Finance 404; Recruiter of Крипто creating in Гемблінг → 404 on the vertical; client-sent `sourcerId`, `ownerId`, `formerEmployee` by a Recruiter for another user's benefit → 400 (unknown/forbidden key).

**Events:** `candidate.created` (vertical, source channel; no PII in payload); audit row with after-values in the PII-separated store. **Statistics:** «candidates added (sourced)» STAT-01 counts from Phase 4 aggregates — event is their input.
**Copy:** `candidates.create.title` «Новий кандидат», `candidates.form.fullName` «ПІБ», `candidates.form.email` «Email», `candidates.form.phone` «Телефон», `candidates.form.telegram` «Telegram», `candidates.form.linkedin` «LinkedIn», `candidates.form.portfolio` «Портфоліо», `candidates.form.location` «Локація», `candidates.form.currentCompany` «Поточна компанія», `candidates.form.currentTitle` «Поточна посада», `candidates.form.expectedSalary` «Зарплатні очікування», `candidates.form.summary` «Опис», `candidates.form.tags` «Теги», `candidates.form.source` «Джерело», `candidates.form.consent` «Згода на обробку персональних даних», `candidates.form.formerEmployee` «Колишній працівник», `candidates.afterSave.addToVacancy` «Додати до вакансії», `candidates.afterSave.keepInPool` «Залишити в резерві», form exit «Вийти без збереження» (D124).
**Edges:** creation at 23:30 UTC → Kyiv next day; creator deactivated later → candidate stays, «неактивний» marker (D142); mobile form usable but not a TL flow.

### STORY-CAND-01-2: Edit a candidate profile

As an **editor of a candidate**, I want to correct profile data, so that the card stays accurate.

**Acceptance criteria**

- Given `recruiter1` on his candidate with current `expectedVersion`, When he changes phone and tags, Then version +1, `candidate.updated` with changed field codes only, one audit row (before/after in the PII store), dedupe re-run on changed keys (STORY-CAND-02-1).
- Given a value equal to the stored one, Then no-op (no version, event, audit).
- Given two editors from the same version, Then one wins, the other gets 409 `STALE_STATE` and «Оновити».
- Given `vertical`, `sourcer`, `created_by`, `public_no` in the body, Then 400 (immutable here; vertical only via transfer).
- Edit does not change `last_activity_at` (pipeline actions only, DG-19; D8 window).
- (negative) Team Lead, HR, Head HR reading the card → no «Редагувати»; API 403. Recruiter2 on recruiter1's candidate → 404. Head Recruiter Крипто on Гемблінг → 404.

**Events / PII:** history shows changed field names only; values only in Admin «Журнал дій» (D139). **Copy:** `candidates.actions.edit` «Редагувати», `common.conflict.refresh` «Оновити».
**Edges:** candidate table has no `version` column in the ERD — added by migration (see conflicts); edit while the candidate is being merged/transferred → 409.

### STORY-CAND-02-1: Exact duplicate blocks creation (company-wide)

As a **creator**, I want an exact duplicate refused without revealing other people's data, so that each person exists once and sourcing credit stays with the first recruiter (CAND-02, D49, BONUS-05).

**Acceptance criteria**

- Given Олена Шевчук exists (owner `recruiter1`), When `recruiter2` saves a new candidate with phone `+38 (067) 123-45-67`, Then creation is refused with the neutral message «Цей кандидат уже є в системі. Зверніться до керівника рекрутингу.»; no id, name, field name, vertical or owner is returned (`match: HIDDEN`).
- Given `head.recruiter.gambling` (can read Олена) enters the same email, Then creation is refused with «Можливий дублікат» _(label per glossary; text proposed: «Такий кандидат уже існує»)_ and a link to Олена's card (`match: VISIBLE`).
- Given the match is in another vertical (Крипто candidate, Гемблінг creator), Then the same HIDDEN/VISIBLE rule applies — dedupe is company-wide (D32).
- Given the check runs on submit (and on blur only if security accepts it — see conflict with S-08), Then all four keys (email, E.164 phone, Telegram, LinkedIn) are compared after normalization; soft-deleted and purged candidates do not match (unique partial indexes IDX-18..21).
- Given two recruiters save the same new email at the same moment, Then the unique index lets exactly one commit; the other gets the duplicate response, no partial row.
- Given an edit that sets a key already used by another live candidate, Then the edit is refused the same way.
- Given more than 20 hidden matches per user per day (Kyiv day; D140), Then further checks are refused 429 and a security event is audited.
- (negative) No response time/body difference reveals which field matched; the 409/422 body never contains another candidate's data.

**Events:** no candidate event; `audit_log` security event `candidate.duplicate_blocked` (actor, match kind, no key values). **Copy:** `candidates.dedupe.hidden` «Цей кандидат уже є в системі. Зверніться до керівника рекрутингу.», `candidates.dedupe.visible` _(proposed)_ «Такий кандидат уже є: », `candidates.dedupe.open` «Відкрити картку».
**Edges:** same person with two different phones → not exact (C6 partial match); Telegram `@User` vs `user` → match; LinkedIn with/without `www`, trailing slash, query → match.

### STORY-CAND-05-1: Former-employee flag (CAND-05, D66)

As a **Recruiter (own) or Head Recruiter**, I want to mark a candidate as a former employee, so that BONUS-11 can apply later; only an Admin may clear it.

**Acceptance criteria**

- Given `recruiter1` on his candidate, When he sets «Колишній працівник» with the leave date (if Q-47 = mandatory), Then the flag is stored, `candidate.flag_set {flag: FORMER_EMPLOYEE}`, audit row.
- Given Admin at aal2, When he clears it with a mandatory multi-line reason (D113), Then cleared, `candidate.flag_cleared`, reason in the PII store, audit.
- (negative) Given Head Recruiter or Recruiter, When they try to clear, Then 403 and nothing changes (D66); Admin at aal1 → 401 `MFA_REQUIRED`; Head HR → 403 (D66 grants no Head HR right; see conflict with ERD/threat model).
- Referrer / self-referral flag (BONUS-05, D38): not in the Phase 2 form; ships with Phase 4 bonuses (D140).

**Copy:** `candidates.flags.formerEmployee` «Колишній працівник», `candidates.flags.leftOn` «Дата звільнення», `candidates.flags.clear` «Зняти позначку» _(proposed)_, `candidates.flags.clearReason` «Причина».

---

## C3 — Files via signed URLs

**Roles in C3**

| Role           | Upload CV/attachment | Read/download CV, attachments    | Photo set/replace | Photo view       |
| -------------- | -------------------- | -------------------------------- | ----------------- | ---------------- |
| Admin          | yes                  | yes                              | yes               | yes              |
| Head Recruiter | in vertical          | in vertical                      | in vertical       | in vertical      |
| Recruiter      | own                  | own                              | own               | own              |
| Head HR / HR   | no                   | from Polygraph                   | no                | from Polygraph   |
| Team Lead      | no                   | submitted to him (D48: CV as is) | no                | submitted to him |
| Finance        | 404                  | 404                              | 404               | 404              |

### STORY-CAND-01-3: Upload and open CV versions and attachments

As a **Recruiter**, I want to upload CVs and other files to the candidate, so that colleagues allowed to see the candidate can read them (CAND-01, D29, SEC files).

**Acceptance criteria**

- Given `recruiter1` on Олена's card, When he drops `Shevchuk_CV.pdf` (2.4 MB), Then: upload intent authorised → signed upload URL (random key `{bucket}/{vertical}/{file_id}`, `upsert:false`) → browser uploads directly → `complete` (only by the same user, `PENDING` only) verifies real size, MIME by magic bytes and extension → `READY`; CV «Версія 1» appears in «Резюме».
- Given a second CV, Then «Версія 2» becomes current; version 1 stays listed and downloadable.
- Given PDF, Then inline preview (Q-90 viewer choice; scripting off); DOC/DOCX download-only with «Файл не перевірено антивірусом» _(proposed)_; `.docm`, macro DOCX (`vbaProject.bin`), > 10 MB, other types → refused with a field error, object removed.
- Given attachments, Then types/limits per Q-124 (default PDF, DOC/DOCX, PNG, JPG ≤ 10 MB).
- Given «Завантажити» / preview, Then the server re-checks `candidate.file.read` and etag, mints a 60 s URL with `Content-Disposition` sanitized filename, writes an audit row (CV download, AUD), returns `no-store`; the URL is never in list or card DTOs, logs or Sentry.
- Given `vasyl.tl@demo` on Ігор's card, Then he previews/downloads the CV as is (D48), no contact fields elsewhere.
- Given an upload abandoned, Then `PENDING` rows/objects are cleaned by `files-cleanup`; per-user upload-intent limit (DG-09) → 429.
- (negative) Given Head HR/HR/TL, When they request an upload intent, Then 403. Given recruiter2 asking a URL for recruiter1's candidate file id, Then 404. Given a user JWT calling Storage directly, Then denied (no `storage.objects` policies). Given `complete` by another user, Then 404.

**Events:** `candidate.file_uploaded {kind, version}` (filename in PII store); audit on every download URL. **Copy:** `candidates.cv.upload` «Завантажити резюме», `candidates.cv.version` «Версія {n}», `candidates.cv.download` «Завантажити», `candidates.cv.previewError` «Не вдалося відкрити файл», `candidates.files.tooLarge` _(proposed)_ «Файл більший за 10 МБ», `candidates.files.typeNotAllowed` _(proposed)_ «Цей тип файлу не підтримується».
**Perf:** viewer lazy-loaded (PERF-04); URL minted on click only. **Edges:** CV versions are never removed (only purge); attachments are soft-removed by the uploader, Head Recruiter or Admin with `candidate.file_removed` event + audit; others → 403 (D141); transferred candidate keeps the original storage key (ERD); purge removes objects (Phase 5).

### STORY-CAND-01-4: Candidate photo (D57)

As an **editor of a candidate**, I want to add an optional photo, so that colleagues recognise the person.

**Acceptance criteria**

- Given JPEG/PNG/WebP ≤ 2 MB, When uploaded through the same signed-upload flow, Then it becomes the current photo; replacing keeps no visible history of old photos (old object scheduled for removal); any profile editor may replace or remove it (D141).
- Given no photo or a load failure, Then initials avatar.
- Given the card header, Then the photo is shown through a signed URL after `candidate.read`; lists and drawers show initials only, no per-row signed URL (D141).
- Given GIF, SVG, HEIC, > 2 MB, or a PNG with a JPEG extension mismatch, Then refused.
- (negative) TL/HR can view (if they read the card) but not upload (403); Finance 404; a photo URL reused after 60 s → expired.

**Events:** `candidate.photo_set` / `candidate.photo_removed` (no filename). **Schema:** needs `candidate.photo_file_id` and a `photo` bucket rule (JPEG/PNG/WebP, 2 MiB) — not in the ERD (see conflicts). Purge removes the photo (ARCH-04).
**Copy:** `candidates.photo.add` «Додати фото» _(proposed)_, `candidates.photo.replace` «Замінити фото» _(proposed)_, `candidates.photo.remove` «Видалити фото» _(proposed)_, `candidates.photo.rules` «JPEG, PNG або WebP, до 2 МБ» _(proposed)_.

---

## C4 — Applications (candidate × vacancy)

**Roles in C4**

| Role                     | «Додати до вакансії»                                                         | Sees the application                      |
| ------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------- |
| Admin                    | any candidate → any `OPEN` vacancy (D142) of the same vertical               | all                                       |
| Head Recruiter           | in vertical                                                                  | in vertical                               |
| Recruiter                | own candidate → vacancy he can read (assigned or unassigned `OPEN`, authz ⁴) | own (owner or sourcer)                    |
| Head HR / HR / Team Lead | no                                                                           | per scope (`V≥P` / `sub`) — none at `NEW` |
| Finance                  | 404                                                                          | —                                         |

### STORY-CAND-03-1: Add a candidate to a specific vacancy («Додати до вакансії»)

As a **Recruiter**, I want to link my candidate to a vacancy, so that work on the hire starts (CAND-03, ROUTE-08 direct add, §6.1 `NEW`).

**Acceptance criteria**

- Given Олена (Гемблінг, owner `recruiter1`) and V-0007 `OPEN` assigned to `recruiter1`, When he picks V-0007 in «Додати до вакансії» on 20.11.2026, Then an application is created: stage `NEW`, `source_type = DIRECT`, `vertical`/`position`/`team_lead` copied from the vacancy, `sourcer_id` = candidate sourcer, `owner_id` = the candidate's sourcer if active, otherwise the recruiter the actor picks (active REC/HREC of the vertical, accepted invite) (D142), `max_stage_reached = 1`, `stage_entered_at` = now; candidate status becomes «Активний»; candidate `last_activity_at` updated (new application = activity, D8).
- Given a recruiter-initiated vacancy without a Team Lead, Then adding is allowed (D77 only blocks submission/routing).
- Given the candidate already has an active application in the same routing group (position + vertical), Then 409 `ACTIVE_APPLICATION_IN_GROUP` (ROUTE-06); if that vacancy is not visible to the actor, the message does not name it.
- Given a vacancy of another vertical, Then 409 `CANDIDATE_VERTICAL_MISMATCH` (CAND-06); the picker never offers it.
- Given vacancy status other than `OPEN` (`DRAFT`, `ON_HOLD`, `FILLED`, `CANCELLED`; D142), Then 409 `VACANCY_NOT_OPEN` _(proposed code)_; not offered in the picker.
- Given two users add the same candidate to two vacancies of the same group at once, Then the partial unique index lets one commit; the other gets `ACTIVE_APPLICATION_IN_GROUP`.
- Given a double click, Then one application (idempotency key).
- Given the vacancy picker, Then it lists only `OPEN` vacancies of the candidate's vertical the actor can read, searchable by number/title (D81), urgent ones highlighted (D97/D99 shared component).
- (negative) Recruiter on a vacancy assigned only to another recruiter → 404 on the vacancy; on another recruiter's candidate → 404; Team Lead/HR/Head HR → 403; Finance 404; client-set `ownerId`/`stage` → 400.

**Events:** `application.created` (candidate, vacancy, source type) on candidate and vacancy timelines; audit. **Statistics:** vacancy stage counter `NEW` +1 in the same transaction (`vacancy_stage_count`); STAT inputs for Phase 4. **Notifications:** none (D93).
**Copy:** `applications.add.title` «Додати до вакансії», `applications.add.search` «Пошук вакансії за номером або назвою», `applications.errors.activeInGroup` _(proposed)_ «Кандидат уже має активну кандидатуру на цю посаду», `applications.errors.verticalMismatch` _(proposed)_ «Вакансія з іншої вертикалі», `applications.errors.vacancyNotOpen` _(proposed)_ «Вакансія не відкрита».
**Edges:** vacancy cancelled while dialog open → 409; candidate deleted/transferred concurrently → 404/409 (vertical trigger `FOR SHARE` serialises); deactivated sourcer → the actor picks the owner, «неактивний» marker on candidate screens (D142); a mistaken application is closed by STORY-CAND-03-4 (D142).

### STORY-CAND-03-4: Close a mistaken application at `NEW` (D142)

As a **Recruiter (application owner), Head Recruiter of the vertical or Admin**, I want to close an application created by mistake before the pipeline exists, so that it does not block ROUTE-06 or vacancy deletion.

**Acceptance criteria**

- Given Олена's application on V-0007 at `NEW` (owner `recruiter1`), When `recruiter1` chooses «Відмова» with a reason, Then the state machine (`server/domain/pipeline/`) moves `NEW → REJECTED`; `closed_at`, reason stored; vacancy counter `NEW` −1 in the same transaction; `application.stage_changed {from: NEW, to: REJECTED}` on candidate and vacancy timelines; audit; Олена returns to «Резерв» if no other active application.
- Given «Самовідвід», Then `NEW → WITHDRAWN` the same way.
- Given the application is at any stage other than `NEW` (seed, D138), Then no control; API 409 (Phase 3 transitions).
- Given two users close the same application at once, Then one succeeds, the other gets 409 `STALE_STATE`.
- (negative) Recruiter not owner → 404/403 per scope; Team Lead, HR, Head HR → 403; Finance → 404.

**Open detail (Phase 3 questions, defaults applied, not new policy):** reason list and comment rule follow the Q-69 / Q-118 recommendations; who records «Самовідвід» follows the Q-56 recommendation. Confirm when Phase 3 answers arrive.

### STORY-VAC-04-3: Candidates and counts on the vacancy card (visible only)

As a **user who can open a vacancy**, I want its candidates and stage counts, so that I see progress without seeing what I may not open (VAC-04, VIS-02, D19).

**Acceptance criteria**

- Given V-0007 with 6 applications (2 `NEW` by recruiter1, 1 `NEW` by recruiter2, Ігор at `PROBATION`, Марія at `POLYGRAPH`, 1 rejected), When Admin/Head Recruiter opens it, Then mini-funnel shows all active stages from the stage counters and the list shows all 6 (filter «Активні / Завершені»).
- Given `recruiter1` (assigned) opens V-0007, Then counts and rows include only applications he owns or sourced (scoped live counts, ADR-008) — recruiter2's `NEW` is not counted.
- Given `vasyl.tl@demo`, Then only applications ≥ `SUBMITTED_TO_TL` are counted/listed; given `hr@demo`, only ≥ `POLYGRAPH`.
- Given a row, Then ПІБ, stage chip, owner, last activity, probation marker; contact fields never; click opens the candidate card on that application.
- (negative) No total, tooltip, CSV or API field reveals the unscoped count to Recruiter/TL/HR.

**Events:** none (read). **Perf:** counters for `G`/`V`, one scoped count query otherwise (IDX-04); list one query, cursor.

### STORY-VIS-03-1: Recruiter reads a vacancy holding his application (D53)

As a **Recruiter**, I want read-only access to any vacancy where I own an application, so that I can follow my candidate after routing or reassignment.

**Acceptance criteria**

- Given `recruiter1` owns an application on V-0009 (Taras, assigned to recruiter2), Then V-0009 appears in his «Вакансії» list and card read-only: no edit, status, assignment or content controls; candidate list scoped to his own applications.
- Given the application is later closed, Then read access stays while he is its owner or sourcer (authz application `own` has no stage filter).
- (negative) Write calls on V-0009 by recruiter1 → 403; a vacancy without his application → 404 as before.

### STORY-ROLE-06-2: Applications are open work on deactivation / role removal

As an **Admin**, I want a user's owned active applications listed and reassigned before deactivation, so that no candidate loses their recruiter (ROLE-06, D24/D43).

**Acceptance criteria**

- Given `recruiter2` owns 3 active applications, When Admin opens deactivation, Then group «Кандидатури» lists them with a replacement picker (active REC/HREC of the vertical, accepted invite); completion is blocked until all are reassigned.
- Given reassignment, Then `owner_id` changes, `sourcer_id` never (BONUS-05), event `application.owner_reassigned {from,to}` with mandatory reason, audit; self-reassignment by the actor to himself is refused (§9.3 SoD).
- Given Head Recruiter of the vertical, Then he may reassign in advance (D24).
- (negative) Recruiter/TL/HR cannot reassign (403); a replacement from another vertical → 400.

**Edges:** closed applications are not open work; talent-pool candidates of a deactivated recruiter remain visible to Head Recruiter/Admin only.

---

## C5 — Talent pool («Кадровий резерв»)

### STORY-CAND-03-2: Keep and find candidates in the talent pool

As a **Recruiter or Head Recruiter**, I want candidates without an active application kept and findable, so that I can propose them later (CAND-03).

**Acceptance criteria**

- Given a new candidate saved with «Залишити в резерві», Then status «Резерв», no application.
- Given filter «Лише резерв», Then only candidates with no active application in my scope (Recruiter own, Head Recruiter vertical, Admin all); HR/TL do not get this filter.
- Given a candidate whose last application ended (rejected/withdrawn), Then he is in the pool too (glossary definition; ARCH-01 rejected archive remains the Phase 5 view).
- (negative) A Recruiter never sees another recruiter's pool candidates; Finance 404.

**Copy:** `candidates.filters.poolOnly` «Лише резерв».

### STORY-CAND-03-3: Propose from the pool on the vacancy card («Запропонувати з резерву»)

As a **Recruiter assigned to a vacancy**, I want to pick pool candidates from the vacancy card, so that I fill it faster.

**Acceptance criteria**

- Given V-0007, When `recruiter1` opens «Запропонувати з резерву», Then a searchable picker lists pool candidates of the vacancy vertical within his scope, excluding those blocked by ROUTE-06; choosing one runs STORY-CAND-03-1.
- Given Head Recruiter, Then all pool candidates of the vertical.
- (negative) TL/HR/Head HR do not get the action; Recruiter on a vacancy he only reads via D53 does not get it (read-only).

**Copy:** `vacancies.actions.proposeFromPool` «Запропонувати з резерву». **Perf:** picker = one scoped query, server search, 20 per page.

---

## C6 — Possible duplicates and merge

### STORY-CAND-02-2: Possible duplicate warning

As a **creator**, I want to see possible (partial) duplicates, so that I avoid creating the same person twice. Partial match = name trigram similarity ≥ 0.6 plus any partial key: phone digit suffix, email local part, similar LinkedIn slug (D143).

**Acceptance criteria**

- Given a partial match visible to me, Then panel «Можливий дублікат» with card link; save stays allowed (only exact blocks — D49).
- Given a partial match I cannot see, Then nothing is shown (a hidden partial match would leak existence).
- (negative) No partial-match endpoint returns data outside `candidate.read`.

### STORY-CAND-02-3: Merge duplicates (Admin, Head Recruiter)

As a **Head Recruiter or Admin**, I want to merge two records of the same person, so that history is in one place and the first sourcer keeps credit (CAND-02).

**Acceptance criteria**

- Given candidates A (created 01.10.2026, sourcer recruiter1) and B (created 15.11.2026, sourcer recruiter2) in Гемблінг, When Head Recruiter merges B into A, Then A keeps sourcer recruiter1; B gets `merged_into_id = A` + soft delete (keys freed); A's timeline shows B's events (redaction kept); B's files and applications appear on A; `candidate.merged` event on both; audit.
- Given both have active applications in the same routing group, Then merge is refused 409 `MERGE_ACTIVE_SAME_GROUP` _(proposed code)_.
- Given the actor cannot read both, Then 404 (P2-08). Given different verticals, Then refused (transfer first — D143).
- (negative) Recruiter/HR/TL → 403; Finance 404.

### STORY-BONUS-05-1: 180-day takeover — blocked by Q-45

Takeover of a candidate inactive 180+ days (D8) needs the Q-45 mechanism; not built until answered.

---

## C7 — Delete and transfer

### STORY-CAND-DEL-1: Soft-delete a candidate (D65)

As a **Head Recruiter or Admin**, I want to delete a wrong or unwanted candidate record, so that it disappears from work; recruiters reject instead.

**Acceptance criteria**

- Given Head Recruiter Гемблінг and a candidate without active applications, When he deletes with a mandatory reason, Then `deleted_at/by/reason` set, 404 for everyone outside the Deleted archive (Phase 5), dedupe keys freed, `candidate.deleted` event, audit.
- Given active applications, Then behaviour per Q-52 (default: close them first → 409).
- (negative) Recruiter → no action, API 403 (D65; wireframe «Видалити» for Recruiter is void); Head HR/HR/TL 403; other-vertical Head Recruiter 404.

**Copy:** `candidates.actions.delete` «Видалити», `candidates.delete.reason` «Причина видалення».

### STORY-CAND-06-1: Transfer a candidate to another vertical (CAND-06, D50)

As an **Admin, Head Recruiter or Head HR**, I want to move a candidate to another vertical, so that they can be hired there.

**Acceptance criteria**

- Given Head Recruiter Гемблінг, candidate without active applications, When he picks Крипто, a new owner (active REC/HREC of Крипто) and a reason, Then vertical changes, sourcer unchanged, `candidate_vertical_transfer` row + `candidate.vertical_transferred {from,to}` (reason in PII store) + audit, one transaction.
- Given an active application, Then 409 `CANDIDATE_HAS_ACTIVE_APPLICATIONS`.
- (negative) Recruiter/HR/TL → 403; Head Recruiter of the target vertical only → 404; Head HR may transfer only a candidate who reached Polygraph in his vertical — a talent-pool candidate that never reached Polygraph → 404 (D144, authz `V≥P`).
- Given the transfer is done, Then old-vertical roles see the candidate's closed applications only in their vacancy lists; the candidate card → 404 for them (D144).

---

## C8 — Share

### STORY-UI-09-2: «Поділитися» on the candidate card

Same pattern as STORY-UI-09-1 (built for vacancies).

- Given any viewer of the card, When «Поділитися», Then clipboard = `<origin>/candidates/<id>` (no `?app`, filters, tokens or PII); toast «Посилання скопійовано. Доступ перевіряється для кожного окремо.»; clipboard failure → selectable field + «Закрити».
- Given a recipient without scope (other recruiter, TL of another vacancy, HR before Polygraph, Finance), Then 404 identical to unknown id; signed-out → sign-in then card or 404.
- No server write, audit or event. Mobile: in the header actions.

---

## C9 — Dashboard KPI row

### STORY-UI-01-1: KPI counts scoped to the viewer (D59)

As a **recruiting participant**, I want key counts on «Головна», so that I see my workload at a glance.

**Acceptance criteria**

- Given Q-152 definitions (default: «Кандидати» = visible active applications, «Відкриті вакансії» = visible `OPEN`, «На співбесідах» = visible `TL_INTERVIEW`, «Вийшли на роботу» = visible applications that entered `PROBATION` in the period), Then 4 tiles show counts within the viewer's scope; «Середній час найму» absent until Phase 4 (no placeholder).
- Given `recruiter1`, Then counts cover only his applications; given Vasyl, only his vacancies; given HR, only from Polygraph.
- Given a tile click, Then the matching filtered list opens.
- (negative) Finance has no «Головна»; no tile reveals unscoped totals.

- Given Phase 2, Then the host is a new «Головна» page with the KPI row only; role landing pages stay as D84; no deltas («+12 за тиждень») (D145).

**Perf:** one round-trip, counters/aggregates, < 150 ms.

---

## C10 — Global search

### STORY-UI-03-1: Ctrl+K finds candidates I may open

- Given Ctrl+K with ≥ 3 characters (phone ≥ 5 digits; D143), Then up to 10 candidates and 10 vacancies from my scope, no total; contact-field matching only with `candidate.contacts.read`.
- (negative) Finance has no search (D41); TL searching a candidate's phone gets nothing; deleted/merged candidates never appear.

---

## Traceability

| PRD / decision                                | Stories                                                | Test evidence        |
| --------------------------------------------- | ------------------------------------------------------ | -------------------- |
| CAND-04, VIS-01/02, D20, D48, D52, PERF-02/05 | STORY-CAND-04-1, STORY-CAND-04-2                       | QA fills after build |
| CLAUDE §8, PERF-01, SHOT-01..03               | STORY-SEED-3                                           | QA fills             |
| CAND-01, D51, D35, D84                        | STORY-CAND-01-1, STORY-CAND-01-2                       | QA fills             |
| CAND-02, D49, D32                             | STORY-CAND-02-1, -02-2, -02-3                          | QA fills             |
| CAND-05, D66                                  | STORY-CAND-05-1                                        | QA fills             |
| CAND-01, D29, D57, SEC files, AUD             | STORY-CAND-01-3, STORY-CAND-01-4                       | QA fills             |
| CAND-03, ROUTE-06/08, CAND-06, D142           | STORY-CAND-03-1                                        | QA fills             |
| CAND-03, §6 state machine, D142               | STORY-CAND-03-4                                        | QA fills             |
| D138                                          | STORY-SEED-3, STORY-CAND-04-1                          | QA fills             |
| D139                                          | STORY-CAND-04-2, STORY-CAND-01-2                       | QA fills             |
| D140                                          | STORY-CAND-01-1, STORY-CAND-02-1, STORY-CAND-05-1      | QA fills             |
| D141                                          | STORY-CAND-01-3, STORY-CAND-01-4                       | QA fills             |
| D143                                          | STORY-CAND-02-2, -02-3, STORY-CAND-04-1, STORY-UI-03-1 | QA fills             |
| D144                                          | STORY-CAND-DEL-1, STORY-CAND-06-1, STORY-CAND-04-2     | QA fills             |
| D145                                          | STORY-UI-01-1                                          | QA fills             |
| VAC-04, VIS-02, D19                           | STORY-VAC-04-3                                         | QA fills             |
| D53                                           | STORY-VIS-03-1                                         | QA fills             |
| ROLE-06, D24/D43, BONUS-05                    | STORY-ROLE-06-2                                        | QA fills             |
| CAND-03, glossary «Кадровий резерв»           | STORY-CAND-03-2, -03-3                                 | QA fills             |
| BONUS-05, D8, Q-45                            | STORY-BONUS-05-1 (blocked)                             | —                    |
| §2.3 delete, D65, Q-52                        | STORY-CAND-DEL-1                                       | QA fills             |
| CAND-06, D50                                  | STORY-CAND-06-1                                        | QA fills             |
| UI-09, D58                                    | STORY-UI-09-2                                          | QA fills             |
| UI-01, D59, Q-152                             | STORY-UI-01-1                                          | QA fills             |
| UI-03, D41                                    | STORY-UI-03-1                                          | QA fills             |

## Conflicts found (for the architect / owner)

1. **ERD vs D57:** no `candidate.photo_file_id`; `file_object_bucket_chk` has no photo bucket; `attachment` allows PNG/JPEG but not WebP; 2 MB photo limit absent. **Resolved: ADR-021** (`photo_file_id`, bucket `photo`).
2. **ERD:** `candidate` has no `version` column → optimistic lock for edit/merge/transfer impossible. **Resolved: ADR-021** (`candidate.version`).
3. **ERD §10:** `application` "arrives with the pipeline" (Phase 3), but V4 and C4 need it in Phase 2. **Resolved: ADR-021** (full table in C1; Phase 2 machine = T01 + `NEW → REJECTED/WITHDRAWN`).
4. **ERD + threat model P2-11 vs D66:** former-employee/referrer editable "only by HREC/HHR/Admin"; D66 = Recruiter (own) + Head Recruiter set, Admin-only clear, Head HR none. `permissions.ts` follows D66. **Resolved: ADR-021** (D66 applied to ERD, authz, threat model; referrer column in Phase 4).
5. **authz §2.2 footnote 8 vs D48:** says LinkedIn/portfolio hidden from TL by default; D48 says visible. Footnote 9 still "⚠ OWNER pending" though D50 confirmed. **Resolved: ADR-021** (footnotes rewritten).
6. **authz `candidate.transfer_vertical` HHR = `V≥P`** vs §2.3 "Head HR — from their vertical": Head HR cannot transfer a talent-pool candidate that never reached Polygraph. **Settled by D144:** keep `V≥P`; PRD CAND-06 updated; authz footnote 9 aligned (ADR-021).
7. **Wireframe candidate-card:** Recruiter «Видалити» at `NEW` and tooltip «Рекрутер може видалити кандидата лише до співбесіди…» contradict D65. Header badge «З бота» on a candidate has no PRD basis (source badge is vacancy-only, VAC-01).
8. **screens.md S-08:** dedupe "debounced check on blur" vs authz §4 / threat P2-02 "on submit only"; OPEN-S11 is already settled by D49 (exact match blocks).
9. **Dashboard wireframe / screens.md:** KPI row "Phase 4"; D59 says counts ship in Phase 2.
10. **ERD `search_text`** includes email/phone/Telegram for all roles → a TL could confirm a phone by search despite D20; search must use contact terms only with `candidate.contacts.read`. **Resolved: ADR-021** (`search_name` + `search_contacts`, contact arm under the contacts scope).
11. **STORY-SEED-2 rule** "no invented applications merely to fill a future UI block" vs CLAUDE.md §8 "~30 candidates across all stages incl. probation day 35". **Settled by D138:** stage + events only, no sub-records; STORY-SEED-2 note updated.

## Questions for the owner

**All resolved 2026-11-24 — owner accepted every recommendation («згоден зі всім»): QC-1, QC-2 → D138; QC-3, QC-4 → D139; QC-5..QC-8 → D140; QC-9, QC-10 → D141; QC-11, QC-12 → D142; QC-13, QC-14 → D143; QC-15 → D144; QC-16 → D145.** Table kept for traceability.

| ID    | Question                                                                                                                                                                                                                    | Options                                                                                                                                                                                                                          | Recommendation                                                    |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| QC-1  | Seed: Phase 3 builds interviews/polygraph/offer/probation. May the Phase 2 seed hold applications at later stages (stage + history events only, no sub-records), as CLAUDE.md §8 asks?                                      | a) yes, stage + events only; b) only `NEW` + talent pool now, later stages in Phase 3; c) full sub-records now                                                                                                                   | a) — needed to show and test HR/TL visibility now                 |
| QC-2  | «Кандидати» view in Phase 2: table only, or also a read-only kanban (drag & drop comes with the pipeline)?                                                                                                                  | a) table only, kanban in Phase 3; b) read-only kanban now                                                                                                                                                                        | a) — no rework, no inert board                                    |
| QC-3  | History of profile edits: show old → new values of personal fields (phone, email, Telegram, salary, name) on the card, or only «Змінено: Телефон» like D72?                                                                 | a) field names only, values in «Журнал дій» (Admin); b) values to readers with contact access, hidden from TL                                                                                                                    | a) — fewer PII copies, consistent with D72                        |
| QC-4  | Who sees «Зарплатні очікування» on the card? §2.3 does not say.                                                                                                                                                             | a) everyone who opens the card; b) like contacts (not TL)                                                                                                                                                                        | a) — TL needs it to decide; not a contact                         |
| QC-5  | Admin creates a candidate: who is sourcer? Admin gets no bonuses (D51).                                                                                                                                                     | a) Admin must pick a Recruiter/Head Recruiter of the vertical as sourcer; b) Admin is sourcer, tranche 1 never accrues                                                                                                           | a) — keeps bonus attribution correct                              |
| QC-6  | (a) Source channel list: fixed «LinkedIn, Djinni, Telegram, Рекомендація, Інше» or Admin-managed? Tags: free text? (b) Referrer / self-referral flag: Phase 2 form or Phase 4 bonuses?                                      | (a) fixed 5 + free tags (≤ 20 tags, ≤ 30 chars) / Admin list; (b) Phase 2 / Phase 4                                                                                                                                              | (a) fixed 5 + free tags; (b) Phase 4                              |
| QC-7  | Consent to data processing: required to save? Date source?                                                                                                                                                                  | a) optional; date = Kyiv date when ticked, may be set earlier, not future; b) required                                                                                                                                           | a) — PIPE-05 already sends emails only with consent               |
| QC-8  | Phone without country code: default country? Daily limit of "hidden duplicate" answers per user (security default 20)?                                                                                                      | a) Ukraine (+380), 20/day; b) number must start with +, 20/day                                                                                                                                                                   | a)                                                                |
| QC-9  | Removing files: CV versions, attachments, photo — who may remove, or never?                                                                                                                                                 | a) CV versions never (only purge); attachments soft-removed by uploader/Head Recruiter/Admin; photo replace/remove by editors; b) nothing removable                                                                              | a)                                                                |
| QC-10 | Candidate photo in lists and drawers: each needs its own signed URL.                                                                                                                                                        | a) photo only on the card, initials in lists; b) one batch of short-lived URLs per list page                                                                                                                                     | a) — simpler, no extra calls, safer                               |
| QC-11 | Phase 2 has no pipeline. How is a mistaken application closed before Phase 3?                                                                                                                                               | a) not possible until Phase 3 (state machine); b) build only `NEW → REJECTED` / `WITHDRAWN` via the state machine now                                                                                                            | b) — otherwise mistakes block ROUTE-06 and vacancy delete         |
| QC-12 | «Додати до вакансії»: (1) when Head Recruiter/Admin adds, who is the application owner? (2) allowed vacancy statuses? (3) show «неактивний» next to a deactivated sourcer/owner on candidate screens (D79 is vacancy-only)? | (1) a) actor (Admin: picks a recruiter) / b) candidate owner/sourcer; (2) a) `OPEN` only / b) `OPEN` + `ON_HOLD`; (3) a) yes / b) no                                                                                             | (1) b) candidate's sourcer if active, else picker; (2) a); (3) a) |
| QC-13 | Partial duplicate: what counts (same name + one of: phone digits suffix, email local part, similar LinkedIn slug)? Merge across verticals allowed?                                                                          | a) name similarity ≥ 0.6 trigram + any partial key; transfer before merge; b) only same full name                                                                                                                                | a)                                                                |
| QC-14 | Candidate text search minimum (vacancies use 3, D81); phone search by digits?                                                                                                                                               | a) 3 characters; phone ≥ 5 digits; b) 2 characters                                                                                                                                                                               | a)                                                                |
| QC-15 | Delete and transfer in Phase 2? Head HR transfer scope (only candidates that reached Polygraph per authz)? After transfer, who in the old vertical sees the closed applications (ERD §8 #1)?                                | (1) a) both in Phase 2 / b) Phase 5 with archive; (2) a) keep `V≥P` / b) all candidates of his vertical; (3) a) old-vertical roles see only those closed applications in vacancy lists, not the card / b) see the card read-only | (1) a); (2) a); (3) a)                                            |
| QC-16 | KPI row host and form in Phase 2: «Головна» is not built (D84 landings). Deltas («+12 за тиждень») are in the mockup, not in the PRD.                                                                                       | a) new «Головна» with KPI row only, landing unchanged, no deltas; b) wait for full dashboard v1; c) KPI on «Вакансії» page                                                                                                       | a)                                                                |

## Ready for design

- C1 (after ADR adds photo/version columns and confirms Phase 2 `application`; seed per D138), C2 (with Q-122 default; D140), C3 (D141), C4 incl. STORY-CAND-03-4 (D142), C5, C7 (D144), C8, C9 (D145; Q-152 tile definitions use the stated default), C10 (D143).
- C6 possible duplicates and merge (STORY-CAND-02-2, -02-3; D143).

## Blocked by questions

- STORY-BONUS-05-1 180-day takeover — Q-45.
- STORY-CAND-DEL-1 with active applications — Q-52 (default: close first → 409).
- C9 exact tile definitions — Q-152 (default stated; not silently accepted).
- Architect/database/UX conflicts in «Conflicts found» items 1–5, 7–10 (not owner questions).
