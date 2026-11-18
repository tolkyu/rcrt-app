# Wireframe — Картка вакансії [VAC-01..05, PROB-07, ARCH-03]

> Visual style = `reference/03-vacancies.webp` preview panel, full width. Blocks reuse the panel components (`vacancies-list.md`): team block (TL with role · vertical, not job title, A-15), «Винагорода рекрутеру» card with gift tile (A-32), FunnelMini `bars`, «Деталі вакансії» key/value list, Історія feed in the candidate-card style. Status chip = VAC-02 status; «Термінова» (not «Високий», A-31) and «З бота» are badges. Cards radius 16, shadow sm; tokens per `design-system.md`.

## Desktop 1440 — Head Recruiter

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Вакансії › Медіабаєр — Facebook                                                                  │
│ Медіабаєр — Facebook  [Відкрита ▾] [🔥 Термінова] [З бота]             [Редагувати] [⋯]           │
│ Гемблінг · Тімлід: Василь Петренко (П0) · Middle · Віддалено · Повна зайнятість · Відкрита 12 дн. │
│ Найнято 0 з 2 ▓░  ·  Зарплата 1 500–2 500 $  ·  Випробувальний 90 дн.  ·  Схема: Стандартна 30/70  │
├───────────────────────────────────────────────────────────────┬───────────────────────────────────┤
│ Воронка                                                       │ Рекрутери                          │
│ Новий 3 │ В роботі 5 │ У тімліда 4 │ Співбес. 3 │ Поліграф 2 │  │ (ОК) Оксана Кравець  · 9 канд.     │
│ Офер 1  │ Випробування 1 │ Найнято 0 │ Відмови 6            │ (ДЛ) Дмитро Лисенко  · 5 канд.     │
│ (each segment = button → filters list below)                  │ [+ Призначити рекрутера]           │
├───────────────────────────────────────────────────────────────┤                                   │
│ Кандидати (14)            [Дошка|Список]  [+ Додати кандидата] │ Деталі                            │
│ [Запропонувати з резерву]                                     │ Посада: Медіабаєр — Facebook      │
│ ┌ Список ────────────────────────────────────────────────────┐│ Терміновість і розподіл: див.     │
│ │ Ірина Мельник   [● Новий]           (ОК)  2 год тому       ││   розділ «Терміновість» нижче     │
│ │ Олег Бондар     [● Співбесіда] Очікує перенесення (ОК) 10хв ││ Тімлід: Василь Петренко (П0)      │
│ │ Андрій Шевчук   [● Випробування · 55 дн.] (ДЛ) вчора        ││ Створив: Василь Петренко, 18.10   │
│ │ ↳ Марія Кравчук «Передано від Тараса» [● У тімліда] (ОК)   ││ Джерело: Застосунок / З бота      │
│ └────────────────────────────────────────────────────────────┘│                                   │
├───────────────────────────────────────────────────────────────┴───────────────────────────────────┤
│ [Опис] [Вимоги] [Історія]                                                                          │
│ Історія   Фільтр: [Усі ▾] [Етапи] [Поля] [Коментарі]                                               │
│ 14.11, 15:02  Оксана Кравець   Терміновість змінено: Звичайна → Термінова                         │
│ 13.11, 09:41  Система          Марія Кравчук передана від Тараса Коваля (автоматичний розподіл)   │
│ …                                                                                                  │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- Status chip is a static chip (V3 decision: status actions live in one place — header button + `[⋯]`, see «V3 — призначення і статуси»).
- `[⋯]` menu: Клонувати · Скасувати вакансію… · Відкрити знову (FILLED, HRec) · Видалити (red, separated); «Призупинити» / «Відновити» is a visible header button (V3 §2).
- Routing group panel visible to Admin / HRec / Rec; hidden for TL, HR ⚠ OPEN-V1.
- Days open counter pauses when ON_HOLD? ⚠ OPEN-V2.

## Delete dialog (ARCH-03) — vacancy with active applications

```
┌ Видалити вакансію «Медіабаєр — Facebook»? ─────────────────────────┐
│ Вакансію буде приховано з усіх списків і перенесено в               │
│ Архів → Видалені. Відновити її може адміністратор або керівник      │
│ рекрутингу.                                                         │
│                                                                     │
│ На вакансії є 8 активних кандидатур. Що з ними зробити?             │
│ (•) Перенести в кадровий резерв                                     │
│ ( ) Перенести на іншу вакансію  [Оберіть вакансію ▾]                │
│ ( ) Відмовити                    [Причина ▾] [Коментар……]           │
│                                                                     │
│ Причина видалення *  [………………………………………………]                         │
│                                          [Скасувати] [Видалити]     │
└─────────────────────────────────────────────────────────────────────┘
```

- Per-candidate override (expand «Налаштувати окремо») ⚠ OPEN-V3 (PRD implies one choice for all).

## Role differences

| Role           | Differences                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Admin          | + bonus scheme override, + force actions (override «Пріоритет тімліда для цієї вакансії»: Phase 3, D127)                                                 |
| Head Recruiter | full edit, recruiters assignment, reopen FILLED                                                                                 |
| Recruiter      | edit if assigned ⚠ OPEN-V4; «Взяти в роботу» on unassigned                                                                      |
| Head HR / HR   | read-only header; candidate list only Polygraph+; no routing panel                                                              |
| Team Lead      | own vacancy; sees all its candidates from «У тімліда» ⚠ OPEN-V5 (NEW/IN_WORK hidden?) ; salary visible; no recruiter assignment |
| Finance        | no access (404)                                                                                                                 |

## Mobile 390 — Team Lead

```
┌──────────────────────────────┐
│ ‹ Медіабаєр — Facebook   [⋯] │
│ [Відкрита] [🔥 Термінова]    │
│ Найнято 0 з 2 · 12 дн.       │
│ ┌ Воронка (scroll →) ──────┐ │
│ │ У тімліда 4 │ Співбес. 3 │…│ │
│ └──────────────────────────┘ │
│ Кандидати                    │
│ Ірина Мельник  [У тімліда] › │
│ Олег Бондар  [Співбесіда]  › │
│ [Опис] [Історія]             │
└──────────────────────────────┘
```

## States

- Loading: header block (2 text lines + chips), funnel bar, 5 list rows, right panel 2 blocks.
- No candidates: «На цю вакансію ще немає кандидатів» [+ Додати кандидата] [Запропонувати з резерву].
- FILLED/CANCELLED: banner «Вакансію закрито 20.11.2026 — Заповнена» + [Клонувати]; all edits hidden.
- Deleted (opened from Archive): banner «Вакансію видалено 21.11 · Оксана Кравець · Причина: …» + [Відновити].

## ⚠ OPEN

V1 routing-group panel visibility · V2 days-open with ON_HOLD · V3 per-candidate choice on vacancy delete · V4 recruiter edit rights on vacancy · V5 TL visibility of pre-submission candidates on own vacancy (matrix: "submitted to them").

## Терміновість (VAC-08-2, VAC-04-4)

**Phase 2 scope (owner decision D127):** only **«Терміновість вакансії»** (Звичайна / Термінова) is built; it says how loudly the vacancy is shown (D94) and changes only on `OPEN`/`ON_HOLD`. The Admin override «Пріоритет тімліда для цієї вакансії» (routing order) moves to **Phase 3**: its block, dialog, copy and screenshots are marked below and are not built or captured now. The word «Пріоритет» alone is never used on a vacancy screen. How the red highlight looks in lists is in [`vacancies-list.md`](vacancies-list.md) → «Терміновість (VAC-08-2, VAC-04-4)»; this section covers the card, the preview panel (same `VacancyOverview`), the control, copy and states. Skills applied: `emil-design-eng`, `animate` (gate result in §9). Endpoint and rules: ADR-016.

### 1. Where it lives

`VacancyOverview` (card and preview share it), directly under the header actions and above «Команда», so the control sits next to the badge it changes:

| Section (heading, `text-sm` 600) | Content                                                              | Rendered when                                                                                       |
| -------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Терміновість**                 | row «Терміновість вакансії»: `UrgencyControl` (segmented look) + helper line | `vacancy.canChangeUrgency` (server decision: Head Recruiter of the vertical or Admin, status `OPEN`/`ON_HOLD`) |
| ~~Розподіл кандидатів між тімлідами~~ | **Phase 3 (D127), not built in Phase 2**                         | never in Phase 2                                                                                    |

Everyone else gets **no section and no read-only row**: the header badge «Термінова» is the display (story VAC-08-2: not rendered, not disabled). The section «Умови» keeps no urgency row (one place only).

### 2. Who sees what (control state)

| Role                                   | `DRAFT` (own)                                                   | `OPEN` / `ON_HOLD` | `FILLED` / `CANCELLED`             |
| -------------------------------------- | --------------------------------------------------------------- | ------------------ | ---------------------------------- |
| Admin                                  | no section (change urgency in the draft edit form, D127)        | editable section   | no section; closed note in header  |
| Head Recruiter (own vertical)          | no section (own draft: edit form; foreign draft: 404, D92)      | editable section   | no section; closed note in header  |
| Recruiter, Team Lead, HR, Head HR      | no section                                                      | no section         | no section; closed note in header  |
| Finance / out of scope / foreign draft | 404 (S-18); no hint that the vacancy exists                     | —                  | —                                  |

A closed urgent vacancy shows only the header note (§3) and the neutral badge; no control, 409 `VACANCY_URGENCY_LOCKED` if a stale client sends a change.

### 3. Copy (keys proposed under `vacancies.urgency.*`; engineer adds to `messages/uk.json`)

| Place                                    | Ukrainian                                                                                                                         |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Section heading                          | Терміновість                                                                                                                      |
| Row label / radiogroup `aria-label`      | Терміновість вакансії                                                                                                             |
| Options                                  | Звичайна · Термінова                                                                                                              |
| Helper, editable                         | Термінові вакансії виділяються червоним у списках. Порядок розподілу кандидатів між тімлідами не змінюється.                      |
| Header note under a closed urgent badge (visible text, also on touch) | Вакансію закрито — червоне виділення вимкнено. (same string is the badge `title` in lists)                        |
| Success toast (4 s, id `urgency:{id}`)   | **Терміновість змінено** · V-0007 · Звичайна → Термінова (or «Термінова → Звичайна»)                                              |
| Rollback toast (error, action)           | **Зміну не збережено** · Повернули як було. · action «Повторити» (foundation §4.1)                                               |
| Conflict toast (warning, id `stale:vacancy:{id}`) | **Дані вже змінилися** · Терміновість уже змінено: тепер «Термінова». Якщо потрібно, змініть ще раз. (value = server state)        |
| No connection (error, action)            | **Немає зʼєднання** · Зміни не збережено. Перевірте мережу й спробуйте ще раз. · «Повторити»                                       |
| 403 (role/scope lost)                    | error toast «Недостатньо прав для цієї дії.»; detail refetch, the section disappears                                              |
| 404                                      | card: S-18; preview: selection clears, list refetches, toast «Вакансію не знайдено або доступ обмежено»                           |
| History event `vacancy.urgency_changed` (actor in its own column) | Терміновість змінено: Звичайна → Термінова                                                                                        |

Copy added in the build (keys under `vacancies.urgency.*`):

| Place                                                              | Ukrainian                                                                                                      |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| 409 `VACANCY_URGENCY_LOCKED` (error toast, id `urgency:{id}`)      | **Зміну не збережено** · Вакансію закрито — терміновість не змінюється.                                        |
| 429 (warning toast)                                                | Забагато змін за короткий час. Зачекайте хвилину й повторіть.                                                  |
| Conflict, current value unreadable (warning, id `stale:vacancy:{id}`) | **Дані вже змінилися** · Терміновість уже змінено. Перевірте поточне значення й змініть ще раз, якщо потрібно. |
| Control chunk failed to load (status line in place of the control) | Керування терміновістю не завантажилось. Оновіть сторінку.                                                     |

Why no «змінила/змінив»: the actor's gender is unknown and the actor sits in the column next to the text.

### 4. Wireframes

**Desktop 1440 — Admin, light, urgent `OPEN`** (right-hand card column of the page; same blocks in the 360 preview, stacked)

```
┌ header (full width) ──────────────────────────────────────────────────────────────────────────────┐
│ Вакансії › Медіабаєр — Facebook                                                                  │
│ ┃░░ V-0007 · Гемблінг                                                                        ░░  │  ← tint block (--destructive-subtle) + 3 px red edge
│ ┃░░ Медіабаєр — Facebook  [Відкрита ▾] [🔥 Термінова] [З бота]                               ░░  │
│ ┃░░ Гемблінг · Тімлід: Василь Петренко (П0) · Middle · Віддалено · Відкрита 22.10.2026       ░░  │
│                                                              [Поділитися] [Редагувати] [⋯]        │  ← actions outside the tint
├───────────────────────────────────────────────────────────────┬───────────────────────────────────┤
│ …funnel, candidates…                                          │ Терміновість                       │
│                                                               │ Терміновість вакансії              │
│                                                               │ ┌──────────┬──────────┐            │
│                                                               │ │ Звичайна │▐Термінова▌│  h 40     │
│                                                               │ └──────────┴──────────┘            │
│                                                               │ Термінові вакансії виділяються     │
│                                                               │ червоним у списках. Порядок        │
│                                                               │ розподілу кандидатів між тімлідами │
│                                                               │ не змінюється.                     │
│                                                               │ Рекрутери …  Деталі …              │
└───────────────────────────────────────────────────────────────┴───────────────────────────────────┘
```

**Head Recruiter**: same section and control (Head Recruiter of the vertical and Admin are the only editors).

**Recruiter / TL / HR (card column, mobile 390 for TL)**: no «Терміновість» section; the tinted header with the badge is the whole display.

```
┌──────────────────────────────┐
│ ‹ Медіабаєр — Facebook   [⋯] │
│ ┃░ V-0007 · Гемблінг        ░│  tint block
│ ┃░ (● Відкрита)(🔥 Термінова)░│
│ Найнято 0 з 2 · 22.10.2026   │
│ Воронка … Кандидати …        │
└──────────────────────────────┘
```

**Mobile 390 — Head Recruiter, editable**

```
│ Терміновість                 │
│ Терміновість вакансії        │
│ [ Звичайна | ▐Термінова▌ ]   │  full width, 2 equal segments, h 44, 16 px text
│ Термінові вакансії виділяються│
│ червоним у списках. Порядок  │
│ розподілу кандидатів між     │
│ тімлідами не змінюється.     │
```

**Closed urgent (`FILLED`, any role, desktop or mobile)**

```
│   V-0003 · Гемблінг                      │  header block: NO tint, NO edge
│   Медіабаєр — TikTok  [Заповнена] [🔥 Термінова]   │  neutral badge
│   Вакансію закрито — червоне виділення вимкнено.   │  muted line under the badges (info); no section, no control
```

The `ON_HOLD` header is tinted, shows the amber «Призупинена» chip and the editable section; `DRAFT` (own) is tinted with the dashed «Чернетка» badge and the lock note, and has no section (the draft edit form carries urgency, D127).

### 5. Header highlight (card and preview)

`DetailHeader` gets `tone?: 'urgent'` (derived from `isUrgentHighlighted`, never passed by hand): the block holding eyebrow, title and badges becomes `rounded-lg bg-destructive-subtle p-4` with the 3 px inset `--destructive` edge; eyebrow switches to `--muted-foreground-strong`; title stays `--foreground`; buttons stay outside the tint, so outline buttons keep their normal surface. Tokens and contrast are those of the list file §2–§3 (header block row). The badge is the same `VacancyFlags` component, so list, preview and card cannot drift. `note` (closed hint, private-draft note) renders under the badges in the existing note slot; a closed urgent vacancy uses `Info` instead of `Lock`.

### 6. The urgency control (interaction)

| Topic            | Spec                                                                                                                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pattern          | `SegmentedControl` + `FormField layout="group"` (same as the create form): radio group, arrows move and select, Tab enters on the checked option. No «Зберегти» button; one value, instantly reversible                       |
| Apply            | `onValueChange` → `PUT /vacancies/{id}/urgency` `{ priority, expectedVersion }` (ADR-016), **optimistic**: the badge, the tint (card + the cached list row + preview) flip in the same frame, < 100 ms. Press feedback = existing `scale .97`, 120 ms |
| While in flight  | group gets `aria-busy="true"` and ignores further input (one request per change; a typical round trip is shorter than a second click). No spinner, no dimming; the thumb already shows the target value                    |
| Success          | version updated from the response; success toast §3; history gets the event                                                                                                                                                |
| Failure          | the control and the highlight roll back (instant), error toast with «Повторити» (re-sends the same change); focus stays on the radio group                                                                                  |
| Conflict 409     | no overwrite, no retry; refetch (detail, list rows); the control shows the server value; warning toast §3 names the current value                                                                                          |
| Same value       | clicking the already selected option sends nothing                                                                                                                                                                         |
| Status flips to closed while the user is on the card | refetch removes the section (closed note appears in the header); focus (if it was in the group) moves to the heading of the next section «Команда» (`tabIndex=-1`; the urgency section leaves with its own heading), not to `<body>` |
| Draft           | no control here: an own `DRAFT` changes urgency only in the draft edit form (`/edit`, `PATCH`); the route answers 409 `VACANCY_URGENCY_LOCKED` (D127)                                                                      |

### 7. History (vacancy Історія, filter «Поля»)

| Event                              | Text (actor and time in their columns)                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `vacancy.urgency_changed {from,to}` | Терміновість змінено: Звичайна → Термінова                                                              |
| `vacancy.priority_overridden` (Phase 3, D127) | not shown in Phase 2                                                                          |

A status change never writes an urgency event. `vacancy.updated` is not written for urgency (field names only, SEC-CORE-07; ADR-016).

### 8. Override «Пріоритет тімліда для цієї вакансії» (Admin only) — PHASE 3 (D127), NOT BUILT, NOT CAPTURED IN PHASE 2

> Reference design kept for the Phase 3 routing slice. Meaning fixed by D127: a number 0–99 replaces the Team Lead priority, ties → oldest vacancy (D5), empty = none; `OPEN`/`ON_HOLD` with a Team Lead only; Admin with aal2. The ↑/↓ order dialog below must be re-checked against this number model when Phase 3 starts. Phase 2 has no section, no dialog, no copy keys and no screenshots for it.

Entry: «Змінити порядок» (outline, h 44) in the second section. It is hidden, not disabled, for roles without the permission. Disabled with a visible reason (`DisabledReason`) for Admin when:

| Condition                                  | Reason shown                                                      |
| ------------------------------------------ | ----------------------------------------------------------------- |
| Vacancy has no Team Lead (D77)             | Спершу призначте тімліда вакансії.                                |
| Only one Team Lead in the distribution group | У групі розподілу один тімлід — порядок змінювати нема чого.   |
| Vacancy closed                             | Вакансію закрито — порядок не змінюється.                         |

Admin at `aal1` (2FA not confirmed): the section shows the order read-only and an `Alert` info line «Підтвердьте вхід кодом 2FA, щоб змінити порядок.» with the link «Підтвердити» → `/mfa/verify?next=…` (same pattern as the position catalog). An `MFA_REQUIRED` 401 in the dialog: inline `Alert` with the same line, values kept.

Dialog (desktop `Dialog`, 480 wide; below 768 px bottom sheet; focus first on the reorder list; Esc and «Скасувати» leave without saving and without a second confirm, because nothing is persisted until «Зберегти порядок»):

```
┌ Пріоритет тімліда для цієї вакансії ──────────────────────────────┐
│ V-0007 · Медіабаєр — Facebook                                      │
│ Змінює лише порядок, у якому кандидати пропонуються тімлідам       │
│ цієї вакансії. Терміновість вакансії та пріоритети вертикалі       │
│ не змінюються.                                                     │
│ ┌ Порядок розподілу ────────────────────────────────────────────┐ │
│ │ 1  (ТК) Тарас Коваль      П1* змінено для вакансії   [↑] [↓]  │ │
│ │ 2  (ВП) Василь Петренко   П0                         [↑] [↓]  │ │
│ └───────────────────────────────────────────────────────────────┘ │
│ Причина зміни *                                          0/500    │
│ [                                                             ]   │
│ Запишемо її в історію вакансії.                                    │
│ [Скинути до налаштувань]            [Скасувати] [Зберегти порядок] │
└────────────────────────────────────────────────────────────────────┘
```

- Reordering = ↑ / ↓ buttons (44 px on touch, `aria-label` «Підняти: Тарас Коваль» / «Опустити: Тарас Коваль»), no drag: this is also the keyboard path. First row's ↑ and last row's ↓ are `aria-disabled` and keep focus. After a move focus stays on the same item's button; a polite live region says «Тарас Коваль: позиція 1 з 2». **No row-swap animation** (keyboard-driven, repeated; instant).
- `П1*` = existing `PriorityBadge kind=tl` with asterisk for «змінено для вакансії»; the vertical's base value stays visible so the override is never mistaken for the vertical setting.
- «Скинути до налаштувань» appears only when an override exists; it is a text button, needs the same reason, and writes the reset event.
- «Зберегти порядок» disabled until the order changed and the reason has a visible character; the unmet condition is visible text under the button («Змініть порядок і вкажіть причину»), not only a tooltip.
- Result: dialog closes, success toast **Порядок тімлідів змінено** · V-0007 · Тарас Коваль → Василь Петренко; section value updates; focus returns to «Змінити порядок».
- Errors inline in the dialog, values and reason kept: 409 «Порядок вже змінили. Ми оновили список — перевірте й збережіть ще раз.» · 403 «Недостатньо прав для цієї дії.» · network «Немає зʼєднання. Зміни не збережено.» Urgency is never touched by this dialog.

### 9. Motion (gate result)

| Moment                                           | Decision                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Tint, edge, badge appear/vanish (own change, other tab, status flip) | **None.** Data being read, state changes tens of times a day, on the do-not-animate list (`design-system.md` §8.3). Instant is the feedback |
| Segment press                                    | existing `scale .97`, `duration-press` 120 ms, `ease-out`; off under reduced motion               |
| Override dialog (Phase 3)                        | existing `motion-modal` 200/150 ms (desktop), `motion-sheet-up` with `ease-drawer` (mobile); reduced motion = opacity only |
| ↑ / ↓ reorder                                    | none (keyboard-initiated)                                                                         |
| Toasts                                           | existing Sonner behaviour                                                                         |

No new tokens, keyframes or libraries.

### 10. States

| State                | Spec                                                                                                                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading (card, preview) | For roles that can edit (the skeleton picks the variant from the session role) the section is part of the skeleton: heading bar, a 44 px control box, two helper lines reserved, so the block does not change height after load (±2 px, E2E geometry assertion). Other roles: no section skeleton. Header block skeleton has no tint |
| Error (detail query) | Existing `SectionError`; the section never renders from partial data                                                                                                                                              |
| Mutation pending     | §6                                                                                                                                                                                                                |
| Mutation failed      | §6, rollback + toast                                                                                                                                                                                              |
| Conflict             | §6 toast (override dialog: Phase 3, §8)                                                                                                                                                                          |
| Permission change mid-session | Section re-renders from the fresh `canChangeUrgency`; a control the user just lost disappears; focus rule as in §6 |
| Offline              | Click is rolled back after the failed request, toast «Немає зʼєднання» with «Повторити»; no queued writes                                                                                                         |

### 11. Accessibility and worst cases

- Label «Терміновість вакансії» on the radiogroup; helper linked with `aria-describedby`; touch targets ≥ 44 px (segments); Tab order: header actions → urgency group (one stop) → team section.
- «Термінова» is text everywhere; the flame is `aria-hidden`. The tint is never the only signal (list file §4).
- Ukrainian length: «Звичайна»/«Термінова» fit two equal segments from 320 px; helper wraps to 4 lines at 320.
- Worst cases to assert in E2E: 200-char title in the tinted header (clamped to 3 lines, edge intact); 320 px and 200 % zoom (segments stay 2 columns, helper wraps); change made in two tabs at once (second gets the conflict toast); long reason with line breaks (counter by server rule).

### 12. Screenshots (D125 lean matrix; `screenshots/phase-2/NN-<role>-vacancy-urgency-<state>-<viewport>-<theme>.png`)

| #  | Role                  | State                                                                                                         | Viewport | Theme |
| -- | --------------------- | ------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| C1 | Admin                 | Card, urgent `OPEN`: tinted header, editable urgency (Термінова)                                              | 1440     | light |
| C2 | Admin                 | Same screen (one dark capture)                                                                                | 1440     | dark  |
| C3 | Head Recruiter        | Card, urgent `FILLED`: neutral header, closed note, no section                                                | 1440     | light |
| C4 | Head Recruiter        | Card, editable urgency, Звичайна → Термінова mid-state (header already tinted)                                 | 390      | light |
| C5 | Team Lead             | Card, urgent `OPEN`, no section (TL flow on phone)                                                            | 390      | light |

Phase 3 (D127): override dialog (light, dark, bottom sheet), aal2 alert, role views of the override section.

Not PNGs (E2E assertions): toast wording (success, rollback, conflict, offline, 403), history event text, closed/draft/role helper copy, skeleton geometry, role × status matrix of §2 (control present/absent), focus after status flip, two-tab conflict, 200-char title, 320 px / 200 % zoom, axe on C1–C10. Role variants not captured because the UI barely differs: Head HR / HR (same as C3 minus override block), Head Recruiter on desktop (same as C1 minus the button).

### 13. Hand-off to the engineer

- New/changed: `VacancyFlags` (outline danger badge, closed neutral with `title`), `urgentEdge` + row tint/hover classes shared by table row, mobile card and header (`tone="urgent"` on `DetailHeader`), `UrgencyControl` section (only when `canChangeUrgency`), `--destructive-subtle-hover` token, filter «Терміновість». Server remains the authority for every state in §2.
- Update the dev-ui badges gallery (`badges.closedUrgent`) so the closed variant is the same neutral component.

### 14. Open UX questions (also in the hand-off message)

1. **Phase 3 (D127):** reason for the override. The story says «audited» but not that a reason is typed; this spec requires one (1–500). Decide with the Phase 3 routing story.
2. **Phase 3 (D127):** inactive Team Lead in the group. The dialog shows «неактивний» and keeps the row; recommendation: it can be moved, routing skips inactive Team Leads anyway (Phase 3). Confirm with the architect.

---

## V3 — призначення і статуси (VAC-03-1, VAC-03-2, VAC-02-1, UI-09-1; D130)

Skills applied: `emil-design-eng`, `animate` (dialogs; gate in §8), `mobile-native` (sheets, 16 px inputs, `dvh`, safe area). Behaviour, not endpoints: ADR-017 owns those. Keys proposed under `vacancies.team.*`, `vacancies.status.*`; the engineer adds them to `messages/uk.json`. Same card and preview (`VacancyOverview`) carry every block; the preview has the same sections stacked, its status actions sit in its `[⋯]`.

### 1. Names (consistency with the glossary)

| Action                                    | Label                          | Why this word                                                                                              |
| ----------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Manager adds recruiters                   | **Призначити рекрутера**       | Glossary «Призначити …» = manager gives                                                                    |
| Recruiter claims a free vacancy           | **Взяти вакансію** (in rows: «Взяти») | Not «Взяти в роботу»: that is the candidate stage action (D-01). Different object, different words |
| Manager removes a recruiter               | **Прибрати**                   | Not «Видалити» (that means archive/soft delete in the glossary)                                             |
| Team Lead added once                      | **Призначити тімліда**         |                                                                                                            |
| `OPEN → ON_HOLD`                          | **Призупинити**                |                                                                                                            |
| `ON_HOLD → OPEN`                          | **Відновити**                  | ⚠ glossary also uses «Відновити» for restore from Archive; context differs (active card vs archive). Fallback if the owner dislikes: «Поновити» (question 1) |
| `OPEN`/`ON_HOLD → CANCELLED`              | **Скасувати вакансію…** (menu), **Скасувати вакансію** (dialog) | Same naming rule as the draft (`vacancy-form.md`): never a bare «Скасувати»                                |
| `FILLED → OPEN`                           | **Відкрити знову**             | Distinct from «Відновити» (pause)                                                                          |

Status chip stays display-only. «Відкрити» (story wording for resume) is not used: it collides with «Відкрити картку».

### 2. Placement

**Header actions** (right side, desktop 1440), by status; a button appears only when the viewer's role may do it (hidden, not disabled — see §4 for the disabled-with-reason cases):

```
OPEN        [Поділитися] [Редагувати] [Призупинити] [⋯]      ⋯ = Клонувати · Скасувати вакансію… · Видалити
ON_HOLD     [Поділитися] [Редагувати] [Відновити]   [⋯]      ⋯ = Клонувати · Скасувати вакансію… · Видалити
FILLED      [Поділитися] [Відкрити знову]           [⋯]      ⋯ = Клонувати · Видалити           (Відкрити знову: Admin, Head Recruiter)
CANCELLED   [Поділитися] [Клонувати]                [⋯]      ⋯ = Видалити
```

- «Призупинити»/«Відновити» = outline button with `pause` / `play` icon (`aria-hidden`), h 40. «Відкрити знову» = primary button (`rotate-ccw`). «Скасувати вакансію…» sits in `[⋯]`, red, separated, above «Видалити»; it is never a one-click button next to a harmless one.
- Team Lead (own vacancy): `[Поділитися] [Призупинити/Відновити] [⋯: Скасувати вакансію…]` — no «Редагувати» change here, no «Відкрити знову».
- Mobile 390: header shows title, badges, then a full-width row: **«Призупинити»/«Відновити»** (outline, h 44) for roles that may; «Поділитися» stays an icon button next to `[⋯]` in the top bar (`aria-label` «Поділитися»). `[⋯]` opens a bottom action sheet (items h 48, destructive item separated, 8 px gap above the safe area). On `FILLED` the full-width row is «Відкрити знову» (primary, h 48).
- Preview panel (360): status actions only in the panel `[⋯]` (same items); «Призупинити»/«Відновити» are items, not buttons.

**Section «Команда»** (right column; same order in preview and mobile stack). Two sub-blocks: «Тімлід» then «Рекрутери».

```
Команда
Тімлід
 (ВП) Василь Петренко                     ← assigned: avatar, name, caption «Тімлід · Гемблінг · П0»
 — or, none (recruiter-initiated):
 Тімлід не призначений     [Призначити тімліда]   ← button: Admin / Head Recruiter, OPEN/ON_HOLD only
Рекрутери
 (ОК) Оксана Кравець   Рекрутер                       [Прибрати]   ← manager only; icon button `x`, 44 px target
 (ДЛ) Дмитро Лисенко   Рекрутер · неактивний          [Прибрати]
 [+ Призначити рекрутера]                              ← manager only, OPEN/ON_HOLD
 — or, none:
 Рекрутера ще не призначено
 Вільну вакансію може взяти будь-який рекрутер вертикалі.  [Взяти вакансію]   ← Recruiter only
```

Variants of the empty recruiter block:

| Viewer                                           | Content                                                                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Admin / Head Recruiter, `OPEN`                   | «Рекрутера ще не призначено» · helper «Вільну вакансію може взяти будь-який рекрутер вертикалі.» · primary **«Призначити рекрутера»** |
| Admin / Head Recruiter, `ON_HOLD`                | «Рекрутера ще не призначено» · helper «Вакансія призупинена: рекрутери без призначення її не бачать.» · primary «Призначити рекрутера» |
| Recruiter (not assigned), `OPEN`                 | same text as the `OPEN` manager row · primary **«Взяти вакансію»**                                                                    |
| Team Lead, HR, Head HR                           | «Рекрутера ще не призначено» only (no helper, no button)                                                                              |
| Any, `FILLED` / `CANCELLED`                      | recruiters list read-only; empty → «Рекрутера не було призначено»; no buttons                                                          |

- List cap: 5 rows, then «Ще 15» (Collapsible, `aria-expanded`). Names truncate with `title`; role caption never truncates. Deactivated assignee: neutral chip «неактивний» (D79), still removable.
- `[Прибрати]` `aria-label` = «Прибрати рекрутера Оксана Кравець».
- Recruiter who is assigned sees the list read-only (no remove, no assign).
- Team Lead block never shows «Призначити тімліда» once a Team Lead is set (once only, D130-3); no «змінити» anywhere (Phase 3).

### 3. Dialogs (desktop `Dialog` 480 wide `motion-modal`; below 768 px bottom sheet `motion-sheet-up`, handle, footer sticky above the safe area, body scrolls, buttons stacked full width h 48, primary last-in-reading-order = bottom)

Header line of every dialog (muted): `V-0010 · Медіабаєр — Facebook · Гемблінг` (title clamped to 2 lines).

#### 3.1 Призначити рекрутера (manager)

```
┌ Призначити рекрутера ─────────────────────────────────────────┐
│ V-0010 · Медіабаєр — Facebook · Гемблінг                      │
│ Рекрутери вертикалі «Гемблінг»              [🔍 Пошук]        │  search only when > 8 rows
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ ☐ (ДЛ) Дмитро Лисенко                                     │ │  rows h 48, whole row toggles
│ │ ☑ (ОК) Оксана Кравець          Уже призначено             │ │  checked + disabled
│ │ ☐ (ІП) Ірина Поліщук                                      │ │
│ └───────────────────────────────────────────────────────────┘ │
│ Призначені рекрутери отримають доступ до вакансії.            │
│ Оберіть хоча б одного рекрутера                               │  condition text, hidden once met
│                                       [Скасувати] [Призначити] │
└───────────────────────────────────────────────────────────────┘
```

| Item                | Spec                                                                                                                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| List                | Only eligible users (active, accepted invite, RECRUITER in this vertical, D130-1). Several can be ticked (max 20; the 21st row is `aria-disabled` with «Не більше 20 за раз»). Already-assigned ones are checked + disabled with «Уже призначено» |
| Primary button      | «Призначити»; with a selection «Призначити (2)» (live count, no motion). Disabled until ≥ 1 new tick; the reason is the visible line under the list, not only a tooltip                                                    |
| Focus on open       | First enabled checkbox (search field if shown)                                                                                                                                                                        |
| Pending             | Button pressed state at once; spinner after 150 ms; dialog waits for the server (no optimistic close: the version and eligibility are decided under lock)                                                              |
| Success             | Dialog closes; list in «Команда» shows the new avatars (no animation); success toast; focus → the «Рекрутери» subheading (`tabIndex=-1`) so the reading position stays in the section                                     |
| Empty (no eligible) | EmptyState inside the dialog: «У цій вертикалі немає рекрутерів, яких можна призначити» · «Рекрутер має бути активним, прийняти запрошення й мати роль «Рекрутер» у вертикалі.» · Admin also gets a link «Користувачі» (opens settings); button hidden, only «Закрити» |
| Loading             | 4 skeleton rows h 48 (same boxes), buttons present, primary disabled                                                                                                                                                  |
| Load error          | `SectionError` inside the dialog body: «Не вдалося завантажити рекрутерів» · «Спробувати ще раз»                                                                                                                      |

Errors (inline `Alert` at the top of the dialog body, `role="alert"`, values kept):

| Case                                      | Copy                                                                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Stale version (409)                       | «Склад команди вже змінили. Ми оновили список — перевірте вибір і підтвердьте ще раз.» (auto refetch, ticks kept where still valid) |
| Ineligible at commit (422)                | «Когось із вибраних не можна призначити: він неактивний або втратив роль у вертикалі. Список оновлено.»                    |
| Vacancy closed meanwhile (409)            | «Вакансію вже закрито — рекрутерів не призначають.» Dialog offers only «Закрити»; card refetches                            |
| Out of scope / gone (404)                 | Dialog closes; toast «Вакансію не знайдено або доступ обмежено»; list refetch                                              |
| 403                                       | Dialog closes; error toast «Недостатньо прав для цієї дії.»                                                                |
| Offline / 5xx                             | Alert «Немає зʼєднання. Зміни не збережено.» + button «Повторити» (same payload)                                           |

Toasts (4 s, id `team:{id}`): one → **Рекрутера призначено** · V-0010 · Оксана Кравець; many → **Призначено рекрутерів: 2** · V-0010 · Оксана Кравець, Дмитро Лисенко (the «label: N» form avoids Ukrainian plural forms).

#### 3.2 Прибрати рекрутера (manager) — AlertDialog

| Item    | Spec                                                                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title   | «Прибрати рекрутера з вакансії?»                                                                                                                                                |
| Body    | «Оксана Кравець втратить доступ до вакансії «Медіабаєр — Facebook» (V-0010).» + one extra line by case:                                                                         |
|         | last recruiter, `OPEN`: «Вакансія стане вільною — її зможе взяти будь-який рекрутер вертикалі «Гемблінг».»                                                                       |
|         | last recruiter, `ON_HOLD`: «Вакансія призупинена: рекрутери без призначення її не бачать, доки вакансію не відновлять.»                                                          |
|         | other recruiters remain: «Інші рекрутери вакансії залишаються.»                                                                                                                 |
| Buttons | «Залишити» (default focus) · «Прибрати» (destructive filled)                                                                                                                     |
| Success | Row leaves the list without animation; toast **Рекрутера прибрано** · V-0010 · Оксана Кравець; focus → «Рекрутери» subheading (the trigger row is gone)                          |
| Errors  | 409 stale «Склад команди вже змінили. Ми оновили картку.» (dialog closes, refetch); 404 on the removed recruiter's own stale tab is a plain 404 page (S-18)                       |

#### 3.3 Взяти вакансію (recruiter) — small confirm

The claim cannot be undone by the recruiter (D130-2), so one short confirm stays. It opens from the card button, the preview button and the list-row «Взяти».

| Item    | Spec                                                                                                                                                  |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title   | «Взяти вакансію?»                                                                                                                                     |
| Body    | «Ви станете відповідальним рекрутером вакансії «Медіабаєр — Facebook» (V-0010). Відмовитися самостійно не вийде — це зможе зробити керівник рекрутингу.» |
| Buttons | «Не зараз» · **«Взяти вакансію»** (primary, default focus: Enter confirms in one keystroke)                                                            |
| Pending | Button disabled + spinner after 150 ms; dialog waits (the first commit wins)                                                                          |
| Success | Dialog closes; toast **Вакансію взято** · V-0010 · Ви — рекрутер вакансії; button disappears; the user appears in «Рекрутери»; focus → «Рекрутери» subheading (card) / avatar cell (list) |
| Double press / retry by the winner | Same success, no second toast                                                                                                |

**Conflict — someone else was first (409):** dialog closes at once, warning toast (id `claim:{id}`, 6 s):

> **Вакансію вже взяв інший рекрутер** · V-0010 · Її більше немає у вашому списку.

Then the client refetches: the loser's card becomes out-of-scope, so the route goes to `/vacancies` (list heading focused, `router.replace`, no 404 flash); in the preview the selection clears; in a list row the row disappears (list file V3). The winner's name is not shown to the loser (scope: he may no longer read the vacancy). Offline/5xx: dialog stays, `Alert` «Немає зʼєднання. Зміни не збережено.» + «Повторити». 404 (vertical lost): toast «Вакансію не знайдено або доступ обмежено».

#### 3.4 Призначити тімліда (Admin, Head Recruiter; once)

```
┌ Призначити тімліда ───────────────────────────────────────────┐
│ V-0012 · Медіабаєр — Facebook · Гемблінг                      │
│ Вакансія зʼявиться у списку тімліда. Тімліда можна призначити │
│ лише один раз: змінити чи прибрати його пізніше в цій версії  │
│ не вийде.                                                     │
│ ( ) (ВП) Василь Петренко      П0                              │  RadioGroup, rows h 48
│ ( ) (ТК) Тарас Коваль         П1                              │
│ Оберіть тімліда                                               │  condition text until chosen
│                               [Скасувати] [Призначити тімліда]│
└───────────────────────────────────────────────────────────────┘
```

- List = Team Leads of the vertical who are active, accepted the invite (D122). `PriorityBadge kind=tl` shown only if a priority is set; a missing priority is never flagged (story).
- No preselection, even for one candidate (one-time action must be a deliberate choice). Focus on open: first radio.
- Empty: «У цій вертикалі немає тімлідів, яких можна призначити» · «Тімлід має бути активним, прийняти запрошення й мати роль «Тімлід» у вертикалі.»; only «Закрити».
- Success: toast **Тімліда призначено** · V-0012 · Василь Петренко; the block shows him; the button disappears; the badge «Ініційовано рекрутером» stays; focus → «Тімлід» subheading (`tabIndex=-1`).
- Errors (inline `Alert`): 409 already set «Тімліда вже призначено. Ми оновили картку.» (dialog closes); 409 stale «Дані вже змінилися. Ми оновили картку — перевірте й повторіть.»; 422 «Цього тімліда не можна призначити: він неактивний або не має ролі у вертикалі. Оберіть іншого.» (list refetched, choice cleared); 409 closed «Вакансію вже закрито — тімліда не призначають.»

#### 3.5 Скасувати вакансію (Admin, Head Recruiter, own Team Lead) — AlertDialog with reason

Mirrors the draft cancel dialog (`vacancy-form.md`); the difference is who reads the reason.

```
┌ Скасувати вакансію? ──────────────────────────────────────────┐
│ V-0007 · Медіабаєр — Facebook · Гемблінг                      │
│ Вакансія отримає статус «Скасована» і зникне зі списків       │
│ відкритих. Відкрити її знову не можна — за потреби створіть   │
│ копію через «Клонувати».                                      │
│ Причина скасування *                                  0/500   │
│ [                                                         ]   │
│ Причину бачитимуть усі, хто має доступ до вакансії. Можна     │
│ писати в кілька рядків.                                       │
│ Вкажіть причину                                               │  reserved line, visible text
│                       [Залишити вакансію] [Скасувати вакансію]│
└───────────────────────────────────────────────────────────────┘
```

| Item      | Spec                                                                                                                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focus     | «Залишити вакансію» (safe default), like the draft dialog; Tab → reason → destructive                                                                                                               |
| Reason    | 1–500 after trim, counter warns from 450, «ліміт досягнуто» at 500 (same component as draft); textarea 16 px on mobile                                                                              |
| Destructive button | Filled `--destructive`, disabled until a visible character exists; `aria-describedby` → «Вкажіть причину»                                                                                   |
| Pending   | Waits for the server (not optimistic: terminal, destructive); spinner after 150 ms; reason kept on error                                                                                            |
| Success   | Dialog closes; card/preview refetch: chip «Скасована», banner §5, actions replaced per §2; toast **Вакансію скасовано** · V-0007 · Причину збережено в історії · action **«Клонувати»**; focus → card `h1` (`tabIndex=-1`) because the `[⋯]` item is gone |
| Errors    | 409 stale «Дані вже змінилися. Ми оновили картку — перевірте статус і повторіть.» (dialog closes); `VACANCY_STATUS_INVALID` «Цю дію вже не можна виконати: вакансія «Заповнена».» (status from the server); 403 / 404 / offline as §3.1 |
| Active candidates | Phase 2 has none; when candidates exist the resolution step of ARCH-03 is added to this dialog (story re-open). No placeholder text now |

#### 3.6 Відкрити знову (Admin, Head Recruiter) — dialog with optional headcount

```
┌ Відкрити вакансію знову? ─────────────────────────────────────┐
│ V-0003 · Медіабаєр — TikTok · Гемблінг                        │
│ Вакансія повернеться зі статусу «Заповнена» у «Відкрита» і    │
│ знову зʼявиться у списках відкритих. Дата відкриття не        │
│ зміниться.                                                    │
│ Кількість місць                                               │
│ [ − ]  [  2  ]  [ + ]                                         │  numeric 1–100, prefilled with the current value
│ Зараз у вакансії 2 місця. Змініть, якщо потрібні ще люди.     │
│                          [Не відкривати] [Відкрити знову]     │
└───────────────────────────────────────────────────────────────┘
```

- Field = the same `Кількість місць` input as the form (1–100; error «Вкажіть кількість місць від 1 до 100.»); unchanged value sends no headcount change. No required data, so the primary is enabled at once; focus on the field (number selected) — Enter confirms.
- Success: toast **Вакансію відкрито знову** · V-0003 · Відкрита; with a changed number add «Місць: 2 → 3». Header actions switch to the `OPEN` set; an urgent vacancy turns red again (no animation); focus → card `h1`.
- Errors: 409 stale as 3.5; `VACANCY_STATUS_INVALID` «Вакансію вже відкрито або скасовано. Ми оновили картку.»; the field error stays inline.
- Phase 2 shows no hired counter (no hires data). The line «Найнято N з M» in the header appears only with real data; the helper above does not mention hires.

#### 3.7 Призупинити / Відновити — no dialog

One click, instant, reversible. Optimistic: chip, header button label and the cached list row flip in the same frame (< 100 ms, `scale .97` press). `aria-busy` on the button while the request runs (single in-flight). Success toast (3 s, id `status:{id}`): **Вакансію призупинено** · V-0007 (when no recruiter is assigned add the line «Вільні вакансії на паузі не бачать рекрутери.») / **Вакансію відновлено** · V-0007 · Відкрита. Failure: rollback + **Зміну не збережено** · Повернули як було. · «Повторити» (urgency pattern). Focus stays on the button (its label changes; the toast announces politely, no extra live region). Same status already set (second tab): success silently, nothing changes.

### 4. Who sees what

`✓` = control rendered; `—` = not rendered (hidden); `R` = read-only data only. Server (`can`) is the authority; the client uses the flags it returns. Status columns = current status of the vacancy.

| Control                              | Admin | Head Recruiter (own vertical) | Recruiter assigned | Recruiter, not assigned | Team Lead (own) | HR / Head HR | Finance |
| ------------------------------------ | ----- | ----------------------------- | ------------------ | ----------------------- | --------------- | ------------ | ------- |
| Призначити рекрутера (`OPEN`/`ON_HOLD`) | ✓   | ✓                             | —                  | —                       | —               | —            | 404     |
| Прибрати рекрутера (`OPEN`/`ON_HOLD`)   | ✓   | ✓                             | —                  | —                       | —               | —            | 404     |
| Взяти вакансію (unassigned `OPEN` only) | —   | —                             | —                  | ✓                       | —               | —            | 404     |
| Призначити тімліда (none set, `OPEN`/`ON_HOLD`) | ✓ | ✓                      | —                  | —                       | —               | —            | 404     |
| Призупинити / Відновити              | ✓     | ✓                             | —                  | —                       | ✓               | —            | 404     |
| Скасувати вакансію… (`OPEN`/`ON_HOLD`)  | ✓   | ✓                             | —                  | —                       | ✓               | —            | 404     |
| Відкрити знову (`FILLED`)            | ✓     | ✓                             | —                  | —                       | — (403)         | —            | 404     |
| Команда, причина скасування          | R     | R                             | R                  | R (unassigned `OPEN` only, D130-5) | R | R          | 404     |

- Admin has no «Взяти вакансію»: they use «Призначити рекрутера» (picking themselves is allowed only if they hold RECRUITER in the vertical, D35 — they appear in the list like any other).
- Closed (`FILLED`/`CANCELLED`): no assign/remove/take/TL control renders for anyone.
- `DRAFT`: none of these controls (author-only draft flows).
- **Disabled with a reason (the only cases):** Admin without aal2 (D63): every write button above is `aria-disabled` with `DisabledReason` «Підтвердьте вхід кодом 2FA, щоб змінювати вакансію.» + link «Підтвердити» (`/mfa/verify?next=…`, same pattern as the position catalog). Everything else the viewer cannot do is hidden, because the state machine (not the viewer's choice) removes it; a closed vacancy explains itself through the banner (§5).
- A role/scope lost mid-session: the control disappears on the next refetch; an open dialog closes with the 403/404 toast (§3.1); focus → card `h1`.

### 5. Banners and header notes (status line under the badges, `Alert` below the header for closed states)

| Status / viewer                 | Text and actions                                                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ON_HOLD`, all roles            | Note (info, header slot): «Вакансію призупинено. Відновіть її, щоб працювати далі.» for roles that can resume; others: «Вакансію призупинено.»; unassigned adds: «Вільні вакансії на паузі не бачать рекрутери.» |
| `FILLED`                        | Banner: «Вакансію закрито 20.11.2026 — Заповнена» · actions «Відкрити знову» (Admin, Head Recruiter), «Клонувати»                                                                              |
| `CANCELLED`                     | Banner: «Вакансію скасовано 20.11.2026. Скасовану вакансію не можна відкрити знову — створіть копію.» · action **«Клонувати»** (the clone hint). Below it a muted box «Причина скасування» (`whitespace-pre-line`, ≤ 500 chars, absent after a purge) |
| No Team Lead, `OPEN`/`ON_HOLD`  | Team block text «Тімлід не призначений»; for Head Recruiter/Admin plus the button; no header banner                                                                                          |

Banners are static text (`role` none; read in order). The closed urgent note of the urgency section stays under the badges and is not repeated in the banner.

### 6. History (vacancy Історія; actor and time in their columns; filter «Поля» / «Етапи»)

| Event                                         | Text                                                                       |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| `vacancy.recruiter_assigned` (manager)        | Рекрутера призначено: Оксана Кравець                                       |
| `vacancy.recruiter_assigned` (self)           | Вакансію взято в роботу: Дмитро Лисенко                                    |
| `vacancy.recruiter_assigned` (creator)        | Рекрутера призначено при створенні: Дмитро Лисенко                          |
| `vacancy.recruiter_unassigned`                | Рекрутера прибрано: Оксана Кравець                                         |
| `vacancy.team_lead_assigned`                  | Тімліда призначено: Василь Петренко                                        |
| `vacancy.status_changed` OPEN→ON_HOLD         | Вакансію призупинено                                                       |
| `vacancy.status_changed` ON_HOLD→OPEN         | Вакансію відновлено                                                        |
| `vacancy.status_changed` →CANCELLED           | Вакансію скасовано. Причина: «…» (reason clamped 3 lines, «Показати повністю»; hidden after purge) |
| `vacancy.status_changed` FILLED→OPEN          | Вакансію відкрито знову (+ «Кількість місць: 2 → 3» when changed)          |

### 7. Motion (gate result; no new tokens, keyframes or libraries)

| Moment                                                         | Decision                                                                                                                                      |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Assign / remove / claim / TL / cancel / reopen dialogs          | Occasional, user-initiated: existing `motion-modal` 200/150 ms desktop, `motion-sheet-up` + `ease-drawer` below 768 px (240/180 ms); overlay fades with it; reduced motion = opacity only |
| Dialog opened from the keyboard (Enter on a menu item, `⋯`)     | `data-instant`, no animation                                                                                                                  |
| Mobile action sheet from `[⋯]`                                  | Same sheet token; opening from a tap only                                                                                                      |
| Chip, header button swap, banner, «Команда» rows added/removed, row disappearing from the list after a claim | **None** (do-not-animate §8.3: status chip change, list refresh); instant is the feedback                                    |
| Buttons                                                         | Existing press `scale .97`, 120 ms; spinner appears after 150 ms, no fade                                                                       |
| Checkbox / radio rows in pickers, count in «Призначити (2)»     | None (keyboard-repeated)                                                                                                                      |
| Toasts                                                          | Existing Sonner                                                                                                                               |

### 8. Accessibility

- Focus: opening → first interactive control named per dialog; closing → the trigger when it still exists, otherwise the nearest stable heading (`tabIndex=-1`): «Рекрутери» / «Тімлід» subheading after team changes, card `h1` after cancel/reopen/permission loss, list heading after losing a claim. Never `<body>`.
- Dialogs: focus trap, `Esc` closes without writing (pickers: nothing is saved until confirm; typed reason is lost with a plain close — acceptable, one short field), `aria-labelledby` title, `aria-describedby` body. Destructive confirms open on the safe button.
- Announcements: toasts (polite, Sonner `role="status"`); errors inside dialogs `role="alert"` (once, no duplicate toast); the condition lines under disabled primaries are linked via `aria-describedby` and are visible text.
- Checkbox / radio rows: row = label (whole row clickable, ≥ 44 px, 48 in sheets); «Уже призначено» is part of the label (`aria-describedby`), the row `aria-disabled`.
- `[Прибрати]` icon buttons carry the full name per recruiter (§2); `Прибрати` never relies on colour.
- Contrast: all chips/alerts reuse §1.3 tokens of `design-system.md` (warning text `--warning-text`, destructive filled `--destructive` on `--destructive-foreground`).
- Touch targets ≥ 44; textarea and inputs 16 px on mobile (no iOS zoom), sheets use `dvh` and `env(safe-area-inset-bottom)`; hover styles only in `(hover: hover)`.
- Keyboard path for everything: menu → item → dialog → Enter. No drag.

### 9. States (card and preview)

| State                                  | Spec                                                                                                                                                                                                             |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading                                | Skeleton matches final: «Команда» = «Тімлід» row (avatar + 2 lines) + «Рекрутери» 2 rows; for roles that can assign/claim/pause the skeleton reserves one h 40 button box in «Команда» and one in the header (variant picked from the session role, like urgency) so nothing shifts (±2 px E2E) |
| Error (detail)                         | Existing `SectionError`; no action renders from partial data                                                                                                                                                     |
| Stale tab                              | Background refetch repaints chip/team/actions silently; an open dialog whose precondition vanished shows its inline error (§3)                                                                                    |
| Action in flight                       | One request per control, `aria-busy`; other write buttons in the same section stay enabled (server version decides, conflict toast if two collide)                                                               |
| Rate limit (429)                       | Warning toast «Забагато змін за короткий час. Зачекайте хвилину й повторіть.» (existing string)                                                                                                                  |
| Conflict (STALE_STATE)                 | Dialogs: inline `Alert` + refetch. Pause/resume: warning toast id `stale:vacancy:{id}` **Дані вже змінилися** · Статус вакансії вже інший: тепер «Скасована». Перевірте й повторіть, якщо потрібно. (value from server; unreadable → «Перевірте поточний статус…») |
| Offline                                | Optimistic pause/resume rolls back with «Немає зʼєднання» + «Повторити»; dialogs keep input and show the inline alert                                                                                              |
| Mid-session close (another user cancels while a dialog is open) | Submit returns `VACANCY_STATUS_INVALID`; inline text per dialog; card refetches                                                                                                                       |

### 10. Worst cases (break-ui; E2E assertions)

- 20 assigned recruiters: 5 shown + «Ще 15»; assign dialog with 60 eligible: search + `max-h 320` scroll, selection count stays correct across filtering; 21st tick refused with the visible line.
- 200-char title and an 80-char unbreakable name in dialogs: wrap with `overflow-wrap:anywhere`, title clamp 2 lines, footer buttons always reachable (only the body scrolls) at 320 px and 200 % zoom.
- Longest labels: «Призначити тімліда» (button 320 px: full width, 16 px), «Залишити вакансію» / «Скасувати вакансію» stacked in the sheet; «Не більше 20 за раз» wraps.
- Cancel reason of 500 chars with line breaks: dialog body scrolls, counter exact; history shows clamp + «Показати повністю».
- Two recruiters claim in the same second (loser sees §3.3, no duplicate row); Head assigns while Recruiter claims; pause vs cancel from two tabs; TL cancels then Head «Відкрити знову» refused (CANCELLED has no control, stale tab gets `VACANCY_STATUS_INVALID`).
- Recruiter deactivated while in the picker (422 path); Team Lead without a priority; recruiter with two verticals sees both pools.
- Dark theme, forced colours (text + borders carry meaning), reduced motion (opacity-only dialogs).

### 11. Share («Поділитися», STORY-UI-09-1) — only the missing state

Button and success toast are built and unchanged («Посилання скопійовано. Доступ перевіряється для кожного окремо.»). Missing spec: **clipboard blocked.** An `Alert` (`role="alert"`, warning) appears directly under the header action row (mobile: under the badges), full width, with the text «Не вдалося скопіювати посилання. Скопіюйте його вручну:» and a read-only `Input` (16 px, full link, `aria-label` «Посилання на вакансію») that is selected on render (`select()`); a ghost «Закрити» button dismisses it. Focus stays on «Поділитися» (the alert is announced by `role="alert"`; the field is reachable by Tab, never auto-focused so the announcement is not cut). No success toast. Double press: one alert. Hidden for a private `DRAFT`. The same pattern is reused on the candidate card later. No other share state is missing.

### 12. Screenshots (D125 lean matrix; `screenshots/phase-2/NN-<role>-vacancy-<topic>-<state>-<viewport>-<theme>.png`; topics `team`, `status`)

| #  | Role                  | State                                                                                                                    | Viewport | Theme |
| -- | --------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------- | ----- |
| T1 | Head Recruiter        | Card `OPEN` unassigned, recruiter-initiated, no Team Lead: «Призначити рекрутера», «Призначити тімліда», header actions     | 1440     | light |
| T2 | Head Recruiter        | Same screen (one dark capture)                                                                                           | 1440     | dark  |
| T3 | Head Recruiter        | «Призначити рекрутера» dialog: 3 rows, one already assigned, one ticked, counter in the button                           | 1440     | light |
| T4 | Head Recruiter        | Same dialog (one dark capture)                                                                                           | 1440     | dark  |
| T5 | Head Recruiter        | «Призначити тімліда» dialog with the one-time helper, one radio chosen                                                    | 1440     | light |
| T6 | Head Recruiter        | «Прибрати рекрутера?» confirm (last recruiter, `OPEN`: returns to the pool)                                               | 1440     | light |
| T7 | Recruiter             | Card `OPEN` unassigned: «Взяти вакансію» in «Команда» + confirm dialog open                                               | 1440     | light |
| T8 | Recruiter             | List cards: unassigned `OPEN` card with full-width «Взяти вакансію», plus the sheet confirm                               | 390      | light |
| S1 | Head Recruiter        | Card `ON_HOLD` unassigned: chip, note, «Відновити», recruiters block                                                      | 1440     | light |
| S2 | Team Lead             | Own `OPEN` vacancy: «Призупинити» row + `[⋯]` action sheet open with «Скасувати вакансію…»                                | 390      | light |
| S3 | Team Lead             | «Скасувати вакансію?» sheet with a typed reason and counter                                                               | 390      | light |
| S4 | Head Recruiter        | Cancel dialog (desktop) with reason, destructive enabled                                                                  | 1440     | light |
| S5 | Head Recruiter        | Same dialog (one dark capture)                                                                                            | 1440     | dark  |
| S6 | Head Recruiter        | Card `CANCELLED`: banner with clone hint, reason box, neutral chip, no actions but «Клонувати»                            | 1440     | light |
| S7 | Head Recruiter        | Card `FILLED`: banner, «Відкрити знову» + reopen sheet with headcount stepper (2 → 3)                                     | 390      | light |
| S8 | Head Recruiter        | Reopen dialog (desktop)                                                                                                   | 1440     | light |
| U1 | Admin                 | Clipboard-blocked share alert under the header (card)                                                                     | 1440     | light |

Not PNGs (E2E): all toast wording (success, conflict «Вакансію вже взяв інший рекрутер», rollback, offline, 403/404/429), inline dialog errors, role × status matrix of §4 (present/absent), focus targets of §8, aria names, skeleton geometry (±2 px), list-row «Взяти» (checked with T8's card and an E2E on the 1440 row), 20-recruiter and 60-picker cases, 320 px / 200 % zoom, reduced motion, axe on T1–U1. Role variants not captured because the UI barely differs: Admin (as Head Recruiter), HR / Head HR (read-only, as C3-like), Recruiter assigned (read-only list).

### 13. Hand-off to the engineer

- New/changed: `TeamSection` (Тімлід + Рекрутери with the variants of §2, shared by card and preview), `AssignRecruitersDialog`, `RemoveRecruiterDialog`, `ClaimVacancyDialog`, `AssignTeamLeadDialog`, `CancelVacancyDialog` (reuse the draft cancel body + reason field), `ReopenVacancyDialog`, `VacancyStatusActions` (header button + `[⋯]` items; the row menu and preview menu use the same item builder), `ClaimButton` (list row + card footer), `ClipboardFallbackAlert`. Status chip loses its dropdown. All dialogs use the shared `RequiredDataDialog` shell (dialog desktop, sheet mobile).
- Server flags drive every control (`canAssignRecruiters`, `canClaim`, `canAssignTeamLead`, `canHold`, `canResume`, `canCancel`, `canReopen`); the client never derives permissions from the role alone.
- Glossary additions: «Взяти вакансію», «Прибрати (рекрутера)», «Призупинити», «Відновити (призупинену)», «Відкрити знову», «Скасована», «Тімлід не призначений».

### 14. Open UX questions (also in the hand-off message)

1. **Word for resume.** «Відновити» (task wording) vs the glossary's «Відновити» = restore from Archive. Recommendation: keep «Відновити» (contexts never meet on one screen) or switch to «Поновити» if the owner wants zero overlap.
2. **Confirm on self-claim.** Spec has a short confirm because the recruiter cannot release the vacancy (D130-2). Recommendation: keep; if the owner wants one click, drop the dialog and rely on the toast.
3. **Unassigned marker for managers.** List shows «Не призначено» in the recruiter cell (warning tone). A «Не призначено» option in the «Рекрутер» filter would be a natural complement but needs a story; not designed here.
4. **Resume vs story wording.** Story text says «Відкрити» for `ON_HOLD → OPEN`; this spec uses «Відновити» to avoid clashing with «Відкрити картку» and «Відкрити знову». Update the story copy when the owner agrees.
