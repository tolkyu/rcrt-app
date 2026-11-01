# Design adoption — mockup elements vs PRD

> Mockups: `docs/ux/reference/0X-*.webp` (see `design-system.md` §0). The owner said «I want this design for everything». **Look** (tokens, layout, components) is adopted fully. **Behaviour or scope** the mockups imply but the PRD does not have is listed here and is built only once approved.
> Mockup codes: F = 00-foundations · C = 01-components · D = 02-dashboard · V = 03-vacancies · CC = 04-candidate-card · K = 05-candidates-kanban · CAL = 06-calendar · S = 07-statistics.
> **Status legend:** ✅ approved 2026-10-31 (owner, via orchestrator) · ⏳ for owner decision (recommendation given).

## 1. Approved 2026-10-31

| # | Element | Mockup | What it implies | Decision |
|---|---|---|---|---|
| A-01 | Brand «Hiring» (logo tile «H» + wordmark) instead of «HRIS» | all | Brand in sidebar, mobile top bar, login, emails/PDF header; `messages/uk.json` `common.appName` → «Hiring» | ✅ approved 2026-10-31 · Phase 1 (T5). Repo/docs name stays HRIS |
| A-02 | «Додати задачу» + task tabs Усі / Сьогодні / Прострочені / Без дати | D | Manual personal tasks (title, optional due date, optional link to candidate/vacancy, visible only to the author); PRD tasks are system-generated (UI-01) | ✅ approved 2026-10-31 · **Phase 5**. Phases 2–4: system tasks only, no tabs, no «Додати задачу». System tasks resolve when the action is done (no checkbox); only manual tasks have a checkbox |
| A-03 | «Приватні нотатки» on the candidate card | CC | New entity: note per candidate × author, **visible only to the author** (not in Історія, not shared, purged with PII) | ✅ approved 2026-10-31 · **Phase 3** |
| A-04 | Candidate photos | CC, K, D, C | New optional CAND field `photo` (image ≤ 2 MB, private bucket, signed URL); initials fallback everywhere | ✅ approved 2026-10-31 · **Phase 2**. Purge removes the photo |
| A-05 | «Поділитися» button | CC | Copies the card URL; recipient without access gets the standard 404 | ✅ approved 2026-10-31 · **Phase 2** |
| A-06 | Dashboard KPI row (Кандидати, Відкриті вакансії, На співбесідах, Прийнято, Середній час найму + deltas) | D | Aggregates scoped to the viewer's visibility (STAT-07). Deltas need the daily pre-aggregated tables | ✅ approved 2026-10-31 · scoped to viewer. **Recommended phase: 4** (aggregates exist then). Phase 2 dashboard ships without the row (absent, not empty). KPI definitions per A-38 |
| A-07 | Statistics funnel «Скринінг → Технічна співбесіда → Фінальна співбесіда → Офер → Найнято» | S | Our pipeline has one TL interview | ✅ approved 2026-10-31 · adapted to **our stages**: Усі кандидати → В роботі → У тімліда → Співбесіда → Поліграф → Офер → Випробування → Найнято · Phase 4 |
| A-08 | «Онлайн» status on candidate | K | Presence data: candidates are not users | ✅ **not adopted** (decided 2026-10-31) |
| A-09 | «Підключити календар» | CAL | Google Calendar OAuth sync (PRD: only a Phase 6 option for Meet creation) | ✅ approved 2026-10-31 as **post-launch**; button hidden in v1 |
| A-10 | Primary `#6366F1` with white text = 4.47:1 (< AA) | F, C | Filled buttons and primary text use `#5558EF` (5.21:1); `#6366F1` stays for accents/icons/focus | ✅ approved 2026-10-31 · `design-system.md` §1.4 |

## 2. For owner decision — ✅ ALL APPROVED 2026-10-31 as recommended (PRD D64)

> Owner addition to A-38: on every candidate/application card show a visible probation marker «Випробувальний · N дн. залишилось» while the candidate is on probation.


| # | Element | Mockup | What it implies | Recommendation |
|---|---|---|---|---|
| A-11 | «Рекомендація» pink badge (looks like a status) | C, K | On kanban cards it stands where the source sits → it is the source value «Рекомендація» (referral) | **Adapt** Ph2: render as the source label (neutral, with icon), not as a coloured status badge, so it cannot be mistaken for a stage |
| A-12 | «Оцінки» tab in candidate drawer | K | Scorecards / ratings, not in PRD | **Skip**. TL decision + feedback already live in Історія |
| A-13 | «Відгуків 48» on vacancy rows | F, C | Inbound applicant count from job boards, which we do not have | **Adapt** Ph2: «N кандидатів» (applications the viewer can open, D19) |
| A-14 | Vacancy status column with «Активна», «Термінова», «З бота» as statuses | V | In our model status ∈ {Чернетка, Відкрита, Призупинена, Заповнена, Скасована}; urgency and bot source are flags | **Adapt** Ph2: status column = VAC-02 status only («Відкрита», not «Активна»); «Термінова» and «З бота» as badges after the title. Status filter chips: Усі · Відкриті · Чернетки · Призупинені · Заповнені · Скасовані |
| A-15 | Job titles: TL «Head of Media Buying», top-bar user «Middle Frontend Developer», participant «Tech Lead» | V, CC, D | Users have no job-title field | **Adapt** Ph1: show role · vertical («Тімлід · Гемблінг»). If the owner wants job titles, add an optional user field later |
| A-16 | «Технічна співбесіда», «Фінальна співбесіда», «Технічне завдання», «Дзвінок з клієнтом», task «Перевірити тестове завдання» | CC, CAL, S, C, D | Several interview rounds, test assignments and non-pipeline meetings | **Adapt**: one «Співбесіда з тімлідом»; calendar shows only Скринінг / Співбесіда / Поліграф; no test-assignment entity |
| A-17 | Mobile interview-result sheet: «Пройти далі / Відхилити / Потрібно ще інтерв'ю», no feedback field | CC | Third outcome «another interview» + feedback missing (PRD: Pass/Reject + feedback) | **Adapt** Ph3: «Пройдено / Не пройдено» + required «Відгук» (D-05). Another meeting = TL «Перенести» (RESCH-01) |
| A-18 | Stepper with 8 steps labelled like the chips (Новий … У тімліда … Найнято), date only | CC | HIST-02 lists 7 steps (submit + interview merged) and requires actor per step | **Adopt with adaptation** Ph2–3: 8 steps as in the mockup (superset of HIST-02), each with date **and actor** (second caption line / tooltip). Needs owner OK because the step list differs from HIST-02 |
| A-19 | «Додати в календар» on «Наступна подія» | CC | Calendar integration | **Adapt** Ph3: download an `.ics` file (no OAuth, no sync); real sync stays post-launch (A-09) |
| A-20 | «Зарплатні очікування $2 000 – 2 500» + «Відповідає бюджету» | CC | Salary *range* (CAND-01 has one amount) and an automatic comparison with the vacancy budget | **Adapt**: one amount + currency «2 500 $» (glossary format). **Skip** «Відповідає бюджету» in v1 (new rule + salary-visibility edge cases); revisit after Phase 4 |
| A-21 | Numbered pagination «1 2 3 … 12» + «10 на сторінці» | V, C | Offset paging; our rule is cursor pagination + virtualized long lists | **Adapt**: footer «Показано 1–25 з 240» + ‹ › (cursor) + page size; no page-number jumps. Candidate table: virtualized, no pages |
| A-22 | «3 р. досвіду» on candidate cards | K | Years-of-experience field not in CAND-01 | **Skip** (show current role/company instead) unless the owner wants a new field |
| A-23 | Kanban card without owner avatar, vacancy, probation days; stage chip repeated inside its own column | K, D | UI-02 requires stage/probation status, owner avatar, last activity | **Adapt** Ph2: card = avatar, name, current role, vacancy · TL, source, stage detail (time / «Очікує перенесення» / ProbationProgress compact), owner avatar, last activity; no duplicate stage chip |
| A-24 | Calendar colours: Скринінг green, Співбесіда blue, Поліграф purple | CAL | Differs from stage colours (Поліграф = amber elsewhere) | **Adapt** Ph3: events use their stage colour (`design-system.md` §1.5) |
| A-25 | Manual creation shortcuts: mobile calendar FAB «+», «+ Додати кандидата» at the bottom of every kanban column | CAL, D, K | Creating events or candidates directly in a stage bypasses the state machine | **Adapt**: no FAB (events are created by pipeline actions); «+ Додати кандидата» only in the «Новий» column and only for roles allowed to create |
| A-26 | Event «Нотатки» in calendar details | CAL | Free event notes (not in PRD) | **Adapt** Ph3: show existing data: recruiter summary for TL (D-02) / screening notes; no new notes field |
| A-27 | Candidates kanban wrapped in 2 rows × 4 columns | K | Unusual for DnD and keyboard order | **Adapt** Ph3: one horizontal row with scroll, collapsible columns (44 px), same column styling |
| A-28 | Dashboard kanban with 5 columns (Нові, У роботі, Співбесіда, Офер, Найнято) | D | PRD: board by pipeline stage, role-scoped | **Adapt** Ph2: role-based columns per `screens.md` S-03; «Найнято» column only on /candidates |
| A-29 | Dashboard vacancy toggle «Картки / Список» | D | UI-01 says cards grid / kanban by status | **Adapt**: «Картки / Канбан» (list lives on /vacancies) |
| A-30 | Vacancy preview tabs «Огляд / Кандидати / Статистика» | V | VAC-04 requires the vacancy timeline; per-vacancy statistics not in PRD | **Adapt** Ph2: «Огляд / Кандидати / Історія» |
| A-31 | Vacancy priority «Високий», chip «Пріоритет» | V, D | PRD priority is Звичайна / Термінова | **Adapt**: «Термінова» badge; Normal shows nothing |
| A-32 | Recruiter reward block: «Виплачується після виходу кандидата» + «Редагувати» | V | Wrong rule text; edit limits | **Adapt** Ph2: caption from the scheme («30 % на старті ВТ, 70 % після ВТ» / «100 % після ВТ»); «Змінити винагороду» Admin only, once per 2 months (BONUS-16); block hidden for TL/HR |
| A-33 | Search placeholder «Пошук кандидатів, вакансій, нотаток / навичок…» | D, K, CAL | Search over notes/skills (UI-03 = candidates + vacancies) | **Adapt**: «Пошук кандидатів і вакансій…» |
| A-34 | Theme toggle in top bar | C | PRD has theme in Профіль | **Adopt** Ph1: shortcut to the same setting |
| A-35 | Row menu «Редагувати / Дублювати / Архівувати / Видалити» | C | No «archive» action in our model (archive = result of reject/close/delete) | **Adapt**: «Редагувати / Клонувати / Видалити»; no «Архівувати» |
| A-36 | Candidate status «Активний» in header | CC | Person-level status not defined | **Adapt** Ph2: «Активний» = has ≥ 1 active application, else «Резерв» |
| A-37 | Email/phone visible in header and drawer for everyone | CC, K | D20/D48: TL sees no structured contacts; HR from Polygraph | **Adapt**: contacts row role-gated (TL sees LinkedIn only) |
| A-38 | KPI «Найнято» / «Прийнято» | D, S | STAT-01 has *hires = probation started* and *probation passed*; chip «Найнято» = passed | **Owner decision**: recommend KPI «Вийшли на роботу» (probation started) and keep «Найнято» only for passed probation; «Середній час найму» = time-to-fill (STAT-03); «Конверсія» = Найнято ÷ усі кандидати періоду |
| A-39 | Statistics «Експорт» + «CSV» + «XLSX» (three buttons) | S | Duplicate controls | **Adapt**: one «Експорт ▾» (CSV / XLSX) |
| A-40 | Sources «Work.ua», «Сайт компанії» | K | Not in the default source list | **Adopt** as extra source values if the owner agrees (PRD list is open-ended) |
| A-41 | Verticals «Gambling», «Crypto», «Media Buying», «E-commerce», «Engineering» | V, D, C | Mockup data only | **Adapt**: configured vertical names (Гемблінг, Крипто) |
| A-42 | Calendar week Пн–Пт only | CAL | Weekend events hidden | **Adopt** + «Показати вихідні» toggle (auto-on if a weekend event exists) |
| A-43 | History event «Оцінка тімліда · Позитивна» | CC | TL rating does not exist; TL accepts/declines | **Adapt**: «Тімлід прийняв кандидата» + comment (D-03) |
| A-44 | «Приєднатися» (join Meet), «Організатор» participant badge | CC, CAL | Meet link button; scheduler label | **Adopt** Ph3 |
| A-45 | Mobile sticky «Дії з кандидатом ▴» → action sheet | CC | Fits TL mobile flows | **Adopt** Ph2–3 (lists only allowed actions) |
| A-46 | Mobile bottom nav: 4 items in some frames, 5 in others | C, D, K, CAL, S | Inconsistent | **Adopt** 5 items: Головна · Вакансії · Кандидати · Календар · Ще |
| A-47 | Bonus badge «12 500 $ · Виплачено бонусів» (aggregate) | C, S | Our BonusBadge is per tranche | **Adapt**: `summary` variant for Statistics; per-tranche badge on cards |
| A-48 | Statistics Огляд widgets «Топ рекрутерів», «Бонуси та виплати», «Динаміка найму», «Середній час найму» | S | Fit STAT-01..06 | **Adopt** Ph4, role-scoped (hidden where the role has no access, e.g. bonuses for TL/HR) |

## 3. Mockup copy vs glossary

| Mockup | Glossary (wins) | Why |
|---|---|---|
| «Відхилити» as interview result | «Не пройдено» | «Відхилити» = TL decline at У тімліда only (D-03); interview result is Пройдено / Не пройдено |
| «Пройти далі» | «Пройдено» | Same |
| «Відхилити» as general reject | «Відмовити» | Terminal REJECTED is «Відмова» |
| «Перевести на етап ▾» | «Перемістити до… ▾» | Established action verb (MoveToMenu, key `m`) |
| «Активна» (vacancy) | «Відкрита» | VAC-02 status; matches «Відкрита N дн.» |
| «Нові», «У роботі» (column titles) | «Новий», «В роботі» | Chip labels are column titles |
| «Інтерв'ю», «технічне інтерв'ю» | «Співбесіда» | One term; plus ASCII `'` → `ʼ` |
| «Технічна співбесіда» | «Співбесіда з тімлідом» | One interview (A-16) |
| «Скринінг» (calendar) | «Скринінг» (short) / «Скринінг-дзвінок» (full) | Short form added to glossary |
| «Дублювати» | «Клонувати» | VAC-05 |
| «Архівувати» | — (no such action) | A-35 |
| «Пріоритет: Високий» | «Термінова» | A-31 |
| «Оцінка тімліда» | «Рішення тімліда» | A-43 |
| «Фідбек» | «Відгук» | Glossary |
| «Усі позиції» | «Усі посади» | «Посада» is the catalog term |
| «Remote», «Відділено» | «Віддалено» | English word / typo |
| «$ 2 000 – 2 500», «$2 000» | «2 000 $» | uk-UA money format, one amount |
| «15 лист, 2023» | «15 лист. 2026» / «15.11.2026» | Date formats §10 |
| «Відгуків» (applicants) | «кандидатів» | A-13 |
| «Нотатки» (event) | «Підсумок для тімліда» | A-26 |
| «Пошук … нотаток» | «Пошук кандидатів і вакансій…» | A-33 |

## Statistics with tabs — owner's designer mockups (2026-11-01)

- Files: `docs/ux/reference/statistics/01…07-statistics-tab.webp` (originals in the git-ignored `UI FROM DESIGNER/`).
- Target look for **Phase 4** «Статистика»: tabs Огляд · Воронка · Час · Джерела · Тімліди · Рекрутери · Команди · Бонуси · Виплати; filter row (period, вертикаль, посада, рекрутер, тімлід); KPI row; funnel on our stages; light/dark; mobile.
- Not adopted yet: the Phase 4 design step (ux-ui-designer + business-analyst) maps each tab to PRD STAT-*/BONUS-*, role visibility (Finance D12) and flags items without a PRD source (e.g. «Джерела», «Команди», CSV/XLSX export, «Ключові інсайти», «Порівняння сегментів») as owner questions.

## «Запросити користувача» — owner's designer mockup (2026-11-01)

- File: `docs/ux/reference/settings/01-invite-user-dialog.webp` (original in the git-ignored `UI FROM DESIGNER/`).
- Adopted (T6 invite slice): wide dialog with header icon + subtitle; two columns — form + roles × verticals matrix on the left, «Підсумок доступу» card on the right (initials, name, email, «Очікує запрошення», roles grouped by vertical, 2FA note); matrix cells as check toggles with column headers per vertical; footer «Скасувати» / «Надіслати запрошення» with icons; single column + bottom sheet on mobile.
- Not adopted — PRD conflict, owner question **Q-155**: «Посада», «Базова роль», roles «Наймаючий менеджер» / «Перегляд», Admin/Finance per vertical (D40: global only), «Додаткові налаштування» (bonus view, export — permissions come from roles, ROLE-04; copy to recruiter; temporary password — no passwords, invite-only magic link / Google).
