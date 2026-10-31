# Screen inventory

> PRD refs in brackets. Terms per `docs/ux/glossary.md`. Wireframes in `docs/ux/wireframes/`. Flows in `docs/ux/flows.md`.
> **Target look:** owner's designer mockups `docs/ux/reference/0X-*.webp` → tokens in `design-system.md`. Mockup elements beyond the PRD are numbered `A-xx` in `design-adoption.md`; ✅ = approved 2026-10-31, ⏳ = pending owner (build the PRD behaviour until approved). Role/permission rules below are unchanged.

## 0. Global UX rules

| Rule | Detail |
|---|---|
| Action visibility | **Hidden** if the role can never do it on this object (authz). **Disabled + tooltip** if the role could do it but state blocks it (state machine / time rule / missing data). Tooltip copy always says *why* and *when/how it unlocks*. Buttons derive from `server/domain/pipeline` "allowed actions" payload — UI holds no rules [PIPE-01, VIS-01]. |
| Required data at action time | Any transition that needs data opens a dialog (desktop) / bottom sheet (mobile) on click or drop. Card stays in source column until dialog submits [UI-01]. |
| Optimism | Stage moves, comments, accept/decline: optimistic; rollback + toast «Зміну не збережено — повернули як було.» on error; 409 → toast «Етап уже змінився. Оновили картку.» + refetch [UI-07]. |
| Loading | Skeletons mirror final layout; shown only after 150 ms. No spinners on full pages. Buttons show inline spinner after 150 ms, are disabled during submit. |
| Empty | Icon + one-line explanation + primary action (if the role has one). |
| Error | Inline block per section (not whole page) with «Спробувати ще раз». 404 for out-of-scope objects: «Сторінку не знайдено або доступ обмежено.» — identical text for missing and forbidden (no existence leak) [VIS-02]. |
| Keyboard | Ctrl/Cmd K search; `g d/v/c/k/s/a` go-to; `j/k` list nav; `Enter` open; `m` «Перемістити до…» on focused card; `?` shortcuts help. Every DnD has a menu alternative. |
| Mobile (390 px) | Top bar (logo «Hiring», search icon, bell, avatar); bottom nav Головна · Вакансії · Кандидати · Календар · Ще; dialogs become bottom sheets; kanban becomes a stage list with counts; card actions via sticky «Дії з кандидатом» sheet; tap targets ≥ 44 px. TL flows are first-class on mobile [UI-05]. |
| Realtime | Board/card receives change feed → silent refresh; if the open dialog's object changed stage → banner «Картку оновлено іншим користувачем». |
| Read-only vertical | Deactivated vertical: banner «Вертикаль деактивована — лише перегляд»; all mutating actions hidden [ROLE-03]. |

## 1. Navigation per role [UI-04, STAT-08]

| Nav item | Admin | Head Recruiter | Recruiter | Head HR | HR | Team Lead | Finance |
|---|---|---|---|---|---|---|---|
| Головна (Dashboard) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Вакансії | ✓ | ✓ | ✓ | ✓ (read) | ✓ (read) | ✓ (own) | — |
| Кандидати | ✓ | ✓ | ✓ (own) | ✓ (Polygraph+) | ✓ (Polygraph+) | ✓ (submitted to them) | — |
| Календар | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Статистика | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (only item; landing page) |
| Архів | ✓ | ✓ | ✓ ⚠ OPEN-S1 | ✓ ⚠ OPEN-S1 | ✓ ⚠ OPEN-S1 | ✓ ⚠ OPEN-S1 | — |
| Налаштування | ✓ | — | — | — | — | — | — |
| Bell (Сповіщення), Search, Profile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Profile only (no search — nothing searchable) ⚠ OPEN-S2 |

- Mobile bottom nav (5 items, A-46): Головна · Вакансії · Кандидати · Календар · Ще (Статистика, Архів, Налаштування, Профіль). «Ще» shows active when the current section lives in it. Items the role lacks are dropped. Finance: no bottom nav.
- Finance opening any non-statistics route → redirect to `/statistics` (section-level), object URLs → 404.
- Multi-role user (ROLE-02): one merged UI; nav = union; each object's actions = union of the user's roles **in that object's vertical**. Header vertical filter defaults to «Усі мої вертикалі».

### 1.1 App shell (all mockups; wireframe `wireframes/app-shell.md`)

| Zone | Content |
|---|---|
| Sidebar (240 / rail 72) | Logo tile «H» + «Hiring» (A-01) · Головна · Вакансії · Кандидати · Календар · Статистика · Архів · spacer · **Налаштування pinned bottom** (Admin). Active item = indigo-soft bg + primary text/icon. Unbuilt sections hidden (D28) |
| Top bar (64) | ☰ sidebar toggle · vertical selector «Усі мої вертикалі ▾» (hidden with one vertical) · search «Пошук кандидатів і вакансій… Ctrl + K» · bell with unread dot · theme toggle (A-34) · avatar + name + **role · vertical** (A-15) ▾ |
| Page header | Title (`display-xl`) + one-line subtitle (muted) left; primary action (and ⋯) right |
| Finance | Sidebar: Статистика only; top bar: theme toggle + avatar only (no vertical selector, search, bell — D41) |
| Mobile | Top bar 56: logo + page title below; search icon, bell, avatar; bottom nav (§1) |

## 2. Screen list

| ID | Screen | Route | Roles | Phase |
|---|---|---|---|---|
| S-01 | Вхід | `/login` | public | 1 |
| S-02 | Прийняти запрошення | `/invite/[token]` | public | 1 |
| S-03 | Головна (Dashboard) | `/` | all except Finance | 2 |
| S-04 | Вакансії — список | `/vacancies` | Admin, HRec, Rec, HHR, HR, TL | 2 |
| S-05 | Вакансія — створення/редагування | `/vacancies/new`, `/vacancies/[id]/edit` | Admin, HRec, Rec, TL | 2 |
| S-06 | Картка вакансії | `/vacancies/[id]` | as S-04 | 2 |
| S-07 | Кандидати — канбан / таблиця | `/candidates?view=board\|table` | Admin, HRec, Rec, HHR, HR, TL | 2 |
| S-08 | Кандидат — створення/редагування | `/candidates/new` | Admin, HRec, Rec | 2 |
| S-09 | Картка кандидата | `/candidates/[id]` (`?app=` selects application) | as S-07 | 2–3 |
| S-10 | Календар | `/calendar` | all except Finance | 3 |
| S-11 | Статистика | `/statistics/[tab]` | all | 4 |
| S-12 | Бонуси (tab of Статистика) | `/statistics/bonuses`, `/statistics/payouts` | Admin, HRec, Rec, Finance | 4 |
| S-13 | Архів | `/archive/{rejected,deleted,closed}` | see S-13 | 5 |
| S-14 | Налаштування | `/settings/*` | Admin | 1–4 |
| S-15 | Сповіщення | `/notifications` + bell popover | all except Finance ⚠ OPEN-S2 | 5 |
| S-16 | Профіль | `/profile` | all | 1, 5 |
| S-17 | Глобальний пошук | Ctrl K overlay | all except Finance | 2 |
| S-18 | 404 / немає доступу | — | all | 1 |
| D-xx | Key dialogs | see §4 | — | 2–5 |

## 3. Screen specs

### S-01 Вхід / S-02 Запрошення [ROLE-05, SEC]
- **Data:** email field, «Надіслати посилання для входу», «Увійти через Google». Invite: name, role@vertical list (read), accept → login.
- **States:** link sent («Перевірте пошту — посилання дійсне 15 хв» ⚠ OPEN-S3 magic-link TTL not in PRD); invite expired («Запрошення прострочене (72 год). Попросіть адміністратора надіслати нове.»); deactivated user («Обліковий запис деактивовано»); Admin without 2FA → TOTP setup step (mandatory).

### S-03 Головна [UI-01, UI-02, PROB-07]
- **Purpose:** what needs me now + the state of my vacancies/candidates.
- **Layout (`02-dashboard.webp`):** header «Головна» + subtitle, saved-filter chips + «Зберегти» top-right → filter bar of labelled selects → **KPI row** (5 cards, ✅ A-06, Phase 4) → two cards side by side: **Мої задачі** (left, ~5/12) and **Вакансії** (right, ~7/12, 2×2 VacancyCards, toggle «Картки / Канбан» A-29, «Створити вакансію») → full-width **Кандидати** kanban card («Переглянути всіх» → /candidates). See `wireframes/dashboard.md`.
- **Mobile:** title, KPI tiles in a horizontal scroll row (4 visible), Мої задачі with «+» (Phase 5) and tabs, then Вакансії and Кандидати sections stacked.
- **KPI row (scoped to viewer):** Кандидати · Відкриті вакансії · На співбесідах · Вийшли на роботу / Найнято (⏳ A-38) · Середній час найму; each with delta + footnote; click → filtered list (not Finance).
- **Мої задачі:** system tasks (stage icon, title, candidate · vacancy · vertical, due time, avatar), resolving when the action is done. Phase 5 adds manual tasks with checkbox, «Додати задачу» and tabs Усі / Сьогодні / Прострочені / Без дати (✅ A-02).
- **Filters (shared bar):** вертикаль, рекрутер, тімлід, посада, етап, пріоритет (Звичайна/Термінова), період; «Зберегти фільтр»; saved filters as chips. URL-synced.
- **My tasks per role:**

| Role | Task types (title copy) |
|---|---|
| Team Lead | «Розгляньте кандидата» (accept/decline) · «Внесіть результат співбесіди» · «Відповідь на перенесення» (recruiter counter-proposal) · «Завершіть випробувальний термін» (≤14 дн. / overdue) |
| Recruiter | «Запит на перенесення співбесіди» · «Додайте посилання Meet» · «Тімлід прийняв — призначте співбесіду» · «Оберіть наступного тімліда» (ROUTE-08/09) · «Позначте явку» (interview time passed, no result ⚠ OPEN-S4) · probation endings |
| HR | «Призначте поліграф» · «Завантажте висновок поліграфа» · «Підтвердіть перший робочий день» · «Внесіть відповідь на офер» |
| Head HR | «Призначте HR-менеджера на поліграф» · «Створіть офер» · «Надішліть офер» (HR draft ready) · «Внесіть відповідь на офер» · probation endings |
| Head Recruiter | «Затвердіть бонуси» · «Перепризначте кандидатури» (deactivated recruiter, ROLE-06) · «Повторне перенесення від тімліда» (RESCH-03) · probation endings |
| Admin | «Позначте бонуси виплаченими» · «Запропоновано видалення даних» (retention, ARCH-04) · vacancy approvals if enabled ⚠ OPEN-S5 |

- **Kanban by role:** Admin/HRec — all 7 active columns; Recruiter — all columns, own applications, DnD allowed only up to Polygraph; TL — own vacancies, columns «У тімліда → Випробування», no DnD between columns except result drops ⚠ OPEN-S6, primary actions as card buttons; HHR/HR — Поліграф, Офер, Випробування only.
- **States:** empty tasks «Усе зроблено. Нових задач немає.»; empty board per role (Rec: «Додайте першого кандидата» + button; TL: «Поки що немає кандидатів на ваші вакансії»); skeleton = 3 task rows + 6 vacancy cards + 7 columns×3 cards; section-level errors.

### S-04 Вакансії — список [VAC-01..04, D1]
- **Layout (`03-vacancies.webp`, wireframe `wireframes/vacancies-list.md`):** header + «Створити вакансію» → filter bar (Вертикаль, Статус, Тімлід, Рекрутер, Період, Пріоритет) → status chips with counts (Усі · Відкриті · Чернетки · Призупинені · Заповнені · Скасовані, A-14) → **table (8/12) + right preview panel (360)** for the selected row (Огляд / Кандидати / Історія, A-30). Footer: «Показано 1–25 з N» + ‹ › cursor + page size (A-21). Row click selects the row and fills the panel; Enter / double-click / title link opens S-06. Mobile: card list + sticky «Створити вакансію»; no panel.
- **Data (table):** checkbox (bulk, Admin/HRec), назва + рівень, вертикаль chip, тімлід (avatar + PriorityBadge tooltip), рекрутери (avatars +N), статус (VAC-02 only) + «Термінова» / «З бота» badges after the title, FunnelMini bar, найнято N з M, відкрита N дн., остання активність, ⋯.
- **Actions:** «Нова вакансія» (Admin/HRec/Rec/TL); row menu: Відкрити, Клонувати (Admin/HRec), Призупинити/Відновити (⚠ OPEN-S7 who changes status), Видалити (Admin/HRec; Rec — not in matrix for vacancies ⚠ OPEN-S8).
- **Filters:** статус (default Відкрита + Призупинена), вертикаль, тімлід, посада, рекрутер, «Без рекрутера», пріоритет, джерело.
- **Role diff:** Rec sees assigned + unassigned open in vertical, unassigned rows show «Взяти в роботу» ⚠ OPEN-S9 (self-assign not explicit); TL sees own only, column «Тімлід» hidden; HHR/HR read-only, no create.
- **States:** empty «Відкритих вакансій немає» (+ «Створити вакансію» if allowed; TL: «Запросити вакансію»).

### S-05 Вакансія — форма [VAC-01, VAC-03]
- **Fields:** all VAC-01 fields grouped: Основне (назва, посада, вертикаль, тімлід, кількість місць, рівень, формат, тип зайнятості) · Умови (зарплатна вилка + валюта, випробувальний термін ≤ 90 дн.) · Опис (rich text, lazy) · Вимоги · Пріоритет · Рекрутери · Схема бонусів (Admin only; others see inherited read-only) · Пріоритет тімліда для цієї вакансії (Admin only).
- **Role diff:** TL — vertical/TL prefilled & locked, title «Запит на вакансію», submit «Надіслати запит» (status OPEN or DRAFT when approval on); Rec/HRec — TL optional → «Вакансія від рекрутера».
- **Validation:** probation 1–90; salary min ≤ max; inline errors in Ukrainian.

### S-06 Картка вакансії [VAC-04, VAC-05, PROB-07, ARCH-03]
- See `wireframes/vacancy-card.md`. Same building blocks as the S-04 preview panel, full width: header, team (TL + recruiters), «Винагорода рекрутеру» (A-32), FunnelMini bars, candidates (mini-board/list), details, Історія.
- **Actions:** Редагувати, Призупинити/Відкрити, Скасувати вакансію, Відкрити знову (HRec, FILLED), Клонувати, Видалити (dialog ARCH-03), «Додати кандидата», «Запропонувати з резерву».
- **Role diff:** HHR/HR read-only, candidate list filtered to Polygraph+; TL — no edit of recruiters/bonus; salary per matrix.

### S-07 Кандидати — канбан / таблиця [CAND-01, CAND-03, UI-01]
- **Layout (`05-candidates-kanban.webp`, wireframe `wireframes/candidates-kanban.md`):** header + «Додати кандидата» + ⋯ → view toggle **Канбан | Таблиця** (remembered) → filter bar (Етап, Вакансія, Посада, Вертикаль, Відповідальний, Джерело, Теги, switch «Резерв») → board: 8 columns Новий…Найнято in one scrollable row (A-27), role-scoped like S-03; card click opens the **side drawer** (400, CandidateDrawer); «Перейти до профілю» opens S-09. Mobile: stage list with counts → tap = cards of that stage.
- **Table data (virtualized):** ПІБ, поточна посада/компанія, активні кандидатури (StageChip + vacancy), відповідальний, джерело, теги, остання активність, «Резерв» badge if no active application.
- **Filters:** етап, вакансія, посада, вертикаль, відповідальний, джерело, теги, «Лише резерв», період.
- **Actions:** «Новий кандидат» (Admin/HRec/Rec), bulk (HRec): Перепризначити.
- **Role diff:** HHR/HR list limited to Polygraph+; TL — submitted to them; contact fields (phone/email) visibility ⚠ OPEN-S10.
- **States:** empty Rec «Ще немає кандидатів» + CTA; filter-empty «Нічого не знайдено за фільтрами» + «Скинути фільтри».

### S-08 Кандидат — форма [CAND-01, CAND-02, CAND-05]
- Fields per CAND-01; CV dropzone (PDF/DOC/DOCX ≤ 10 MB); consent checkbox (date auto); «Колишній працівник».
- **Dedupe:** debounced check on email/phone/Telegram/LinkedIn blur → inline panel «Можливий дублікат: [card]» (visible) or neutral notice «Цей кандидат уже є в системі. Зверніться до керівника рекрутингу.» (hidden). Save stays enabled for visible match? ⚠ OPEN-S11.
- **After save:** «Додати до вакансії / Подати на посаду / Залишити в резерві».

### S-09 Картка кандидата [CAND-04, HIST-01..03, PIPE, BONUS-14]
- **Layout (`04-candidate-card.webp`, wireframe `wireframes/candidate-card.md`):** breadcrumb → header (photo/initials ✅ A-04, name, current role, person status A-36, contacts row role-gated A-37; actions ⋯ · «Поділитися» ✅ A-05 · «Перемістити до… ▾» primary) → **info strip** (Вакансія · Джерело · Відповідальний · Зарплатні очікування · Теги) → application switcher (if > 1) → **stepper** (8 steps ⏳ A-18) → stage action panel → tabs Історія · Профіль · Резюме · Файли · Коментарі · Бонус (8/12) + **right column** (4/12): «Наступна подія» card, «Приватні нотатки» (author-only, ✅ A-03, Phase 3). Mobile: header with contact icon buttons, tabs Інфо · Історія · Резюме · Коментарі, compact stepper, sticky «Дії з кандидатом» (A-45).
- **Role diff:** Bonus tab — Admin, HRec (vertical), Rec (own) only; polygraph PDF — Admin/HHR/HR only (others see outcome) [POLY-04]; salary per matrix; TL sees only application(s) on their vacancies ⚠ OPEN-S12 (other applications / routing history visibility).
- **States:** skeleton = header + stepper + 6 feed rows; purged candidate «Кандидат #1234 (видалено)» read-only stub.

### S-10 Календар [PIPE-05, POLY-02, RESCH]
- **Layout (`06-calendar.webp`, wireframe `wireframes/calendar.md`):** header → toolbar «Сьогодні» ‹ › «3 – 9 листопада 2026» + segmented Тиждень | День | Список → filters (Тип події, Вертикаль, Учасник) → week grid Пн–Пт 08–20 with now-line («Показати вихідні», A-42) + **right details panel** (360) for the selected event. No «Підключити календар» in v1 (✅ A-09). Mobile: week strip + day list; no FAB (A-25).
- Week (default) / day / list (mobile default). Event types: Скринінг, Співбесіда, Поліграф (stage colours, A-24); badge «Очікує перенесення».
- **Details panel:** status chip, type icon + title, time, date, Meet link + copy («Приєднатися»), Кандидат («Відкрити →»), Вакансія, Учасники («Організатор»), «Підсумок для тімліда» (A-26), footer actions by role (TL: «Перенести», «Внести результат»).
- **Role diff:** Rec — own screenings/interviews; TL — own interviews (actions: «Перенести», «Внести результат»); HR/HHR — polygraphs in vertical; HRec/Admin — all in scope.
- **Filters:** тип, вертикаль, учасник. **Empty:** «На цей тиждень подій немає».

### S-11 Статистика [STAT-01..08]
- **Layout (`07-statistics.webp`, wireframe `wireframes/statistics.md`):** header + «Оновлено о 06:00» + «Експорт ▾» (A-39) → underline tabs → filter row (період, вертикаль, посада, рекрутер, тімлід, «Скинути фільтри») → KPI row (5) → Огляд grid: «Воронка конверсії» (our stages, ✅ A-07) | «Динаміка найму»; «Середній час найму» | «Топ рекрутерів» | «Бонуси та виплати» (A-48, role-scoped). Mobile: tabs scroll, KPI 2×2, widgets stacked.
- Tabs: Огляд · Воронка · Час · Джерела · Тімліди · Рекрутери · Бонуси · Виплати. Charts lazy-loaded; numbers rendered first (table), charts after.
- **Filters:** період (presets: цей місяць, минулий, квартал, рік, власний), вертикаль, посада, рекрутер, тімлід. Export CSV/XLSX per tab.
- **Role diff (scope of data):** Admin all; HRec vertical; Rec own (tabs Огляд, Воронка, Час, Джерела, Бонуси=Мої бонуси); HHR — HR stages in vertical (Огляд, Воронка from Polygraph, Час); HR own; TL own vacancies (Огляд, Воронка, Час, Тімліди=self); Finance all, read-only, every tab. Hidden tabs, not disabled.
- **States:** no data for period «За обраний період даних немає»; data freshness note «Оновлено о 06:00» (pre-aggregated) ⚠ OPEN-S13 (acceptable freshness).
- Drill-down from a number → filtered Кандидати list (not for Finance — numbers not clickable).
- Finance: `wireframes/finance-statistics.md`.

### S-12 Бонуси / Виплати [BONUS-01..15, STAT-06]
- **Бонуси tab:** table per tranche: рекрутер, кандидат (link), вакансія, транш, сума (BonusBadge), статус, очікувана дата, підстава. Sub-filter chips by status. Upcoming payouts calendar (month strip).
- **Actions:** HRec — Затвердити (bulk), Призупинити, Розподіл бонусу (manual split, reason); Admin — + Позначити виплаченим (period), Коригування (+/−, reason), Повернення (clawback record); Rec — read-only «Мої бонуси» with «Чому» links; Finance — read-only.
- **Виплати tab:** period selector, group by рекрутер/вертикаль, totals incl. clawbacks as negative lines, export; Admin bulk «Позначити виплаченими».
- **Empty:** Rec «Бонусів поки немає. Вони зʼявляться після прийняття оферу вашим кандидатом.»

### S-13 Архів [ARCH-01..05]
- Wireframe: `wireframes/archive.md` (tabs, dialogs Повернути в роботу / Відновити / Видалити назавжди / Клонувати, purged stub, mobile, states; ⚠ OPEN A1–A7).
- Tabs: **Відмови** · **Видалені** (one list + type switch Усі/Кандидати/Вакансії) · **Закриті вакансії**.
- Відмови: кандидат, вакансія, етап відмови, причина, хто, коли; action «Повернути в роботу» (opens target vacancy/position picker). Who may reactivate ⚠ OPEN-S14.
- Видалені: тип (кандидат/вакансія), назва, причина видалення, хто, коли; «Відновити» (Admin, HRec in vertical), «Видалити назавжди» (Admin). Tab visibility: Admin, HRec; others ⚠ OPEN-S1.
- Закриті вакансії: назва, статус (Заповнена/Скасована), найнято, дата закриття; «Клонувати», open card read-only.
- Retention proposals (Admin): banner «N кандидатів пропонується видалити назавжди (24 міс. без оновлення згоди)» → review list.

### S-14 Налаштування (Admin) [ROLE-01..06, ROUTE-01, ROUTE-09, BONUS, §6.4]
| Sub-page | Content | Wireframe |
|---|---|---|
| Вертикалі | list, create/rename/deactivate; per-vertical toggles: «Погодження вакансій» (D2), «Автоматичний розподіл» (ROUTE-09), «Перевірка поліграфа керівником HR» (POLY-05); default bonus scheme | inline |
| Користувачі та ролі | table users (status, roles@verticals, last login); invite; edit roles; deactivate (blocked with reassignment for recruiters, ROLE-06) | inline |
| Пріоритети тімлідів | per vertical, reorder, per-vacancy override | `wireframes/settings-tl-priorities.md` |
| Схеми бонусів | presets, editor, defaults | `wireframes/settings-bonus-schemes.md` |
| Посади | position catalog per vertical ⚠ OPEN-S15 (owner of catalog) | inline |
| Причини відмов | configurable list (§6.4), OTHER locked | inline |
| Місця для поліграфа | rooms/addresses (POLY-02) | inline |
| Шаблони оферів | merge-field template editor + preview (OFFER-02) | inline |
| Загальні | offer validity (D11), retention policy (ARCH-04), probation default | inline |
| Журнал дій | audit viewer + login history (AUD) | inline |

### S-15 Сповіщення / S-16 Профіль [NOTIF]
- Bell popover: last 20, unread dot, «Позначити всі прочитаними»; full page with filters by type. Profile: name, avatar, тема (Світла/Темна/Системна), канали per event type (in-app / email matrix), 2FA, активні сесії.

### S-17 Глобальний пошук [UI-03, VIS-02]
- Groups: Кандидати, Вакансії; shows StageChip/status; only visible objects. Empty: «Нічого не знайдено». Recent items when query empty.

## 4. Key dialogs (all: dialog on desktop, bottom sheet on mobile)

| ID | Dialog | Trigger | Required fields | Who |
|---|---|---|---|---|
| D-01 | Взяти в роботу (скринінг) | NEW → IN_WORK | Meet link, дата/час | Rec, HRec, Admin |
| D-02 | Передати тімліду | IN_WORK → SUBMITTED | короткий підсумок для тімліда; screening notes | Rec+ |
| D-03 | Рішення тімліда | SUBMITTED | Прийняти / Відхилити (причина + коментар) | TL |
| D-04 | Призначити співбесіду | → TL_INTERVIEW | Meet link, дата/час, тімлід (prefilled) | Rec+ |
| D-05 | Результат співбесіди | TL_INTERVIEW exit | Пройдено/Не пройдено + відгук | TL (⚠ OPEN-S6) |
| D-06 | Запит на перенесення | interview | 1–3 варіанти часу + коментар | TL |
| D-07 | Відповідь на перенесення | reschedule pending | обрати варіант (+ новий Meet link) або запропонувати інший | Rec |
| D-08 | Неявка | interview | хто не зʼявився | Rec |
| D-09 | Призначити поліграф | POLYGRAPH | HR (HHR assigns), місце, дата/час | HHR/HR |
| D-10 | Результат поліграфа | POLYGRAPH | PDF + Пройдено/Не пройдено + коментар | HR/HHR |
| D-11 | Офер (створення/редагування) | OFFER | сума, валюта, брутто/нетто, період, дата виходу, ВТ, умови → PDF preview | HHR (HR draft) |
| D-12 | Надіслати офер | OFFER | preview + email recipient confirm | HHR |
| D-13 | Відповідь на офер | OFFER | Прийнято (дата виходу) / Відхилено (причина) / Термін минув | HHR/HR |
| D-14 | Перший робочий день | OFFER→PROBATION | дата | HR/HHR |
| D-15 | Завершити випробувальний | PROBATION | early (≥30) / override comment | TL, HHR, Admin |
| D-16 | ВТ не пройдено | PROBATION | причина | TL, HHR |
| D-17 | Відмовити | any allowed stage | причина + коментар; routing preview | per stage |
| D-18 | Видалити | candidate/vacancy | причина; ARCH-03 options for vacancy | Admin, HRec, Rec (own, < Interview) |
| D-19 | Видалити назавжди | Archive | type «ВИДАЛИТИ» | Admin |
| D-20 | Перемістити до… | keyboard/menu | lists only allowed targets; opens D-xx | per role |
| D-21 | Примусово перемістити | Admin | target + коментар | Admin |
| D-22 | Повернути на попередній етап | HRec/HHR | коментар | HRec, HHR |
| D-23 | Перепризначити | HRec | новий відповідальний + причина | HRec |

## ⚠ OPEN (screens)
- **S1** Archive tab visibility for Recruiter / HR / Head HR / TL is not in §2.3. Proposal: Відмови & Закриті follow candidate/vacancy visibility; Видалені only Admin + HRec.
- **S2** Finance: notifications and global search — none needed? Proposal: no bell, no search.
- **S3** Magic-link TTL not specified.
- **S4** Should the system prompt recruiter to record no-show/result when interview time passed with no result?
- **S5** Who approves TL vacancy requests when «Погодження вакансій» is on (Admin? Head Recruiter?).
- **S6** Who records TL interview result: TL only, or also Recruiter/HRec on TL's behalf? Matrix gives Recruiter "up to Polygraph".
- **S7** Who can change vacancy status (Призупинити / Скасувати): TL owner, HRec, Admin, assigned recruiter?
- **S8** Recruiter deleting a vacancy (matrix says "own" for vacancy/candidate) — recruiter-initiated only?
- **S9** Recruiter self-assign to an unassigned vacancy — allowed?
- **S10** Do TL / HR see candidate contacts (phone, email, Telegram)?
- **S11** Visible duplicate: block create, or allow «Все одно створити» (then merge later)?
- **S12** TL on a routed candidate: sees previous TL's decline reason / feedback or only own application?
- **S13** Acceptable statistics freshness (incremental vs nightly) to show in UI.
- **S14** Who may «Повернути в роботу» from Відмови.
- **S15** Who manages the positions catalog (Admin only or HRec too).
