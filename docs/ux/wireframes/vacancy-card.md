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

- Status chip is a dropdown only for roles allowed to change status; otherwise static chip.
- `[⋯]` menu: Клонувати · Призупинити / Відкрити · Скасувати вакансію · Відкрити знову (FILLED, HRec) · Видалити (red, separated).
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
| Admin          | + bonus scheme override, + «Пріоритет тімліда для цієї вакансії», force actions                                                 |
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

Two different things, two different controls, never one widget (D94): **«Терміновість вакансії»** (Звичайна / Термінова) says how loudly the vacancy is shown; **«Пріоритет тімліда для цієї вакансії»** (Admin override) says in which order Team Leads get candidates. The word «Пріоритет» alone is never used on a vacancy screen. How the red highlight looks in lists is in [`vacancies-list.md`](vacancies-list.md) → «Терміновість (VAC-08-2, VAC-04-4)» (tokens, contrast, screenshots L1–L5); this section covers the card, the preview panel (same `VacancyOverview`), the control, copy and states. Skills applied: `emil-design-eng`, `animate` (gate result in §9).

### 1. Where it lives

`VacancyOverview` (card and preview share it), directly under the header actions and above «Команда», so the control is visible without scrolling and sits next to the badge it changes:

| Section (heading, `text-sm` 600)       | Content                                                                                   | Shown to                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Терміновість**                       | row «Терміновість вакансії»: `SegmentedControl` (editable) or value text (read-only) + helper line | everyone who can open the vacancy                                           |
| **Розподіл кандидатів між тімлідами**  | row «Пріоритет тімліда для цієї вакансії»: current order + «Змінити порядок» (Admin)      | Admin, Head Recruiter, Recruiter (OPEN-V1 recommendation); **hidden for Team Lead, HR, Head HR** |

The section «Умови» keeps no urgency row (one place only). The header badge «Термінова» is the display; the section is the control. Sections are separated by the same `mb-5` as the rest, so the two controls are visibly two blocks with their own heading and helper.

### 2. Who sees what (control state)

| Role                                | `DRAFT` (own)                                   | `OPEN` / `ON_HOLD`  | `FILLED` / `CANCELLED`      | Override block                                    |
| ----------------------------------- | ----------------------------------------------- | ------------------- | --------------------------- | ------------------------------------------------- |
| Admin                               | editable                                        | editable            | read-only, closed helper    | editable (needs 2FA, see §6)                      |
| Head Recruiter (own vertical)       | editable                                        | editable            | read-only, closed helper    | read-only                                         |
| Recruiter (assigned or not)         | read-only, draft helper                         | read-only, role helper | read-only, closed helper | read-only                                         |
| Team Lead (author or not)           | n/a (no drafts)                                 | read-only, role helper | read-only, closed helper | hidden                                            |
| HR / Head HR                        | n/a                                             | read-only, role helper | read-only, closed helper | hidden                                            |
| Finance / out of scope / foreign draft | 404 (S-18); no hint that the vacancy exists  | —                   | —                           | —                                                 |

Read-only is a **value row** (`dt` «Терміновість вакансії», `dd` «Термінова» / «Звичайна») plus a **visible helper line**, not a disabled segmented control: the reason is on screen on touch and for screen readers (`DisabledReason` rule: visible text on touch; here we use the text on desktop too because a whole control is absent, not a single disabled button).

### 3. Copy (keys proposed under `vacancies.urgency.*`; engineer adds to `messages/uk.json`)

| Place                                    | Ukrainian                                                                                                                         |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Section heading                          | Терміновість                                                                                                                      |
| Row label / radiogroup `aria-label`      | Терміновість вакансії                                                                                                             |
| Options                                  | Звичайна · Термінова                                                                                                              |
| Helper, editable                         | Термінові вакансії виділяються червоним у списках. Порядок розподілу кандидатів між тімлідами не змінюється.                      |
| Helper, read-only (role)                 | Змінити терміновість може керівник рекрутингу або адміністратор.                                                                  |
| Helper, read-only (draft of a Recruiter) | Терміновість чернетки змінюється в режимі редагування.                                                                            |
| Helper, closed (`FILLED`/`CANCELLED`)    | Вакансію закрито — терміновість не змінюється, червоного виділення немає.                                                         |
| Header note under a closed urgent badge (visible text, also on touch) | Вакансію закрито — червоне виділення вимкнено. (same string is the badge `title` in lists)                        |
| Success toast (4 s, id `urgency:{id}`)   | **Терміновість змінено** · V-0007 · Звичайна → Термінова (or «Термінова → Звичайна»)                                              |
| Rollback toast (error, action)           | **Зміну не збережено** · Повернули як було. · action «Повторити» (foundation §4.1)                                               |
| Conflict toast (warning, id `stale:vacancy:{id}`) | **Дані вже змінилися** · Терміновість уже змінено: тепер «Термінова». Якщо потрібно, змініть ще раз. (value = server state)        |
| No connection (error, action)            | **Немає зʼєднання** · Зміни не збережено. Перевірте мережу й спробуйте ще раз. · «Повторити»                                       |
| 403 (role/scope lost)                    | error toast «Недостатньо прав для цієї дії.»; permissions refetch, the section turns read-only                                    |
| 404                                      | card: S-18; preview: selection clears, list refetches, toast «Вакансію не знайдено або доступ обмежено»                           |
| History event (actor in its own column)  | Терміновість змінено: Звичайна → Термінова                                                                                        |

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
│                                                               │ ────────────────────────────────   │
│                                                               │ Розподіл кандидатів між тімлідами  │
│                                                               │ Пріоритет тімліда для цієї         │
│                                                               │ вакансії                           │
│                                                               │ 1. Василь Петренко  П0             │
│                                                               │ 2. Тарас Коваль     П1             │
│                                                               │ За налаштуваннями вертикалі.       │
│                                                               │ [⇅ Змінити порядок]                │
│                                                               │ Рекрутери …  Деталі …              │
└───────────────────────────────────────────────────────────────┴───────────────────────────────────┘
```

**Head Recruiter**: same, but the override block shows the order without the button and the helper «Змінити порядок може адміністратор.»

**Recruiter / TL / HR, read-only** (card column, mobile 390 for TL)

```
┌──────────────────────────────┐
│ ‹ Медіабаєр — Facebook   [⋯] │
│ ┃░ V-0007 · Гемблінг        ░│  tint block
│ ┃░ (● Відкрита)(🔥 Термінова)░│
│ Найнято 0 з 2 · 22.10.2026   │
│ Терміновість                 │
│ Терміновість вакансії        │
│ Термінова                    │  dd, value text (not a control)
│ Змінити терміновість може    │
│ керівник рекрутингу або      │
│ адміністратор.               │
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
│   Вакансію закрито — червоне виділення вимкнено.   │  muted line under the badges (info)
│   Терміновість  Терміновість вакансії: Термінова   │
│   Вакансію закрито — терміновість не змінюється,   │
│   червоного виділення немає.                       │
```

The `ON_HOLD` header is tinted and shows the amber «Призупинена» chip; `DRAFT` (own) is tinted with the dashed «Чернетка» badge and the lock note.

### 5. Header highlight (card and preview)

`DetailHeader` gets `tone?: 'urgent'` (derived from `isUrgentHighlighted`, never passed by hand): the block holding eyebrow, title and badges becomes `rounded-lg bg-destructive-subtle p-4` with the 3 px inset `--destructive` edge; eyebrow switches to `--muted-foreground-strong`; title stays `--foreground`; buttons stay outside the tint, so outline buttons keep their normal surface. Tokens and contrast are those of the list file §2–§3 (header block row). The badge is the same `VacancyFlags` component, so list, preview and card cannot drift. `note` (closed hint, private-draft note) renders under the badges in the existing note slot; a closed urgent vacancy uses `Info` instead of `Lock`.

### 6. The urgency control (interaction)

| Topic            | Spec                                                                                                                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pattern          | `SegmentedControl` + `FormField layout="group"` (same as the create form): radio group, arrows move and select, Tab enters on the checked option. No «Зберегти» button; one value, instantly reversible                       |
| Apply            | `onValueChange` → `PATCH /vacancies/{id}` `{ priority, expectedVersion }`, **optimistic**: the badge, the tint (card + the cached list row + preview) flip in the same frame, < 100 ms. Press feedback = existing `scale .97`, 120 ms |
| While in flight  | group gets `aria-busy="true"` and ignores further input (one request per change; a typical round trip is shorter than a second click). No spinner, no dimming; the thumb already shows the target value                    |
| Success          | version updated from the response; success toast §3; history gets the event                                                                                                                                                |
| Failure          | the control and the highlight roll back (instant), error toast with «Повторити» (re-sends the same change); focus stays on the radio group                                                                                  |
| Conflict 409     | no overwrite, no retry; refetch (detail, list rows); the control shows the server value; warning toast §3 names the current value                                                                                          |
| Same value       | clicking the already selected option sends nothing                                                                                                                                                                         |
| Status flips to closed while the user is on the card | refetch turns the control into the read-only value + closed helper; focus (if it was in the group) moves to the section heading (`tabIndex=-1`), not to `<body>` |
| Draft help       | an own `DRAFT` edited here follows the same rule; the form (`/edit`) keeps its own field and wins on conflict via `expectedVersion`                                                                                        |

### 7. History (vacancy Історія, filter «Поля»)

| Event                              | Text (actor and time in their columns)                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `vacancy.updated` (priority)       | Терміновість змінено: Звичайна → Термінова                                                              |
| `vacancy.priority_overridden`      | Пріоритет тімліда для цієї вакансії змінено: порядок тепер Тарас Коваль → Василь Петренко · Причина: {reason} |
| Override reset                     | Пріоритет тімліда для цієї вакансії скинуто до налаштувань вертикалі · Причина: {reason}               |

The two events use different icons (flame vs `list-ordered`) so they are not confused in a long feed. A status change never writes an urgency event.

### 8. Override «Пріоритет тімліда для цієї вакансії» (Admin only)

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
| Override dialog                                  | existing `motion-modal` 200/150 ms (desktop), `motion-sheet-up` with `ease-drawer` (mobile); reduced motion = opacity only |
| ↑ / ↓ reorder                                    | none (keyboard-initiated)                                                                         |
| Toasts                                           | existing Sonner behaviour                                                                         |

No new tokens, keyframes or libraries.

### 10. States

| State                | Spec                                                                                                                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading (card, preview) | The section is part of the existing skeleton: heading bar, a 44 px control box (editable roles) or one 40 px value row (read-only roles), two helper lines reserved. The skeleton picks the variant from the session role, so the block does not change height after load (±2 px, E2E geometry assertion). Header block skeleton has no tint |
| Error (detail query) | Existing `SectionError`; the section never renders from partial data                                                                                                                                              |
| Mutation pending     | §6                                                                                                                                                                                                                |
| Mutation failed      | §6, rollback + toast                                                                                                                                                                                              |
| Conflict             | §6 toast; override dialog inline text §8                                                                                                                                                                          |
| Permission change mid-session | Section re-renders from fresh permissions; a control the user just lost becomes the read-only row with the role helper; focus rule as in §6                                                                  |
| Offline              | Click is rolled back after the failed request, toast «Немає зʼєднання» with «Повторити»; no queued writes                                                                                                         |

### 11. Accessibility and worst cases

- Label «Терміновість вакансії» on the radiogroup; helper linked with `aria-describedby`; touch targets ≥ 44 px (segments, ↑/↓, «Змінити порядок»); Tab order: header actions → urgency group (one stop) → «Змінити порядок» → team section.
- «Термінова» is text everywhere; the flame is `aria-hidden`. The tint is never the only signal (list file §4).
- Ukrainian length: «Звичайна»/«Термінова» fit two equal segments from 320 px; helper wraps to 4 lines at 320; override title and reason hint wrap, no truncation; the vacancy title in the dialog is clamped to 2 lines with the full text in `title`.
- Worst cases to assert in E2E: 200-char title in the tinted header (clamped to 3 lines, edge intact); 320 px and 200 % zoom (segments stay 2 columns, helper wraps); two Team Leads with the same name (the dialog shows vertical and base priority); a Team Lead deactivated after joining the group (row shows «неактивний», see question 2); change made in two tabs at once (second gets the conflict toast); long reason with line breaks (counter by server rule).

### 12. Screenshots (D125 lean matrix; `screenshots/phase-2/NN-<role>-vacancy-urgency-<state>-<viewport>-<theme>.png`)

| #  | Role                  | State                                                                                                         | Viewport | Theme |
| -- | --------------------- | ------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| C1 | Admin                 | Card, urgent `OPEN`: tinted header, editable urgency (Термінова), override block with «Змінити порядок»       | 1440     | light |
| C2 | Admin                 | Same screen (one dark capture)                                                                                | 1440     | dark  |
| C3 | Recruiter             | Card, urgent `OPEN`, read-only value + role helper, override read-only                                         | 1440     | light |
| C4 | Head Recruiter        | Card, urgent `FILLED`: neutral header, closed note, read-only + closed helper                                  | 1440     | light |
| C5 | Admin                 | Override dialog with changed order and reason (П1* shown)                                                     | 1440     | light |
| C6 | Admin                 | Override dialog (one dark capture)                                                                            | 1440     | dark  |
| C7 | Admin without 2FA     | Override section with the «Підтвердьте вхід кодом 2FA» alert (the one denial capture of this kind)           | 1440     | light |
| C8 | Head Recruiter        | Card, editable urgency, Звичайна → Термінова mid-state (header already tinted)                                 | 390      | light |
| C9 | Team Lead             | Card, urgent, read-only (TL flow on phone)                                                                    | 390      | light |
| C10| Admin                 | Override dialog as bottom sheet                                                                                | 390      | light |

Not PNGs (E2E assertions): toast wording (success, rollback, conflict, offline, 403), history event text, closed/draft/role helper copy, skeleton geometry, role × status matrix of §2 (control present/absent), reorder keyboard path and live region, focus after status flip, two-tab conflict, 200-char title, 320 px / 200 % zoom, axe on C1–C10. Role variants not captured because the UI barely differs: Head HR / HR (same as C3 minus override block), Head Recruiter on desktop (same as C1 minus the button).

### 13. Hand-off to the engineer

- New/changed: `VacancyFlags` (outline danger badge, closed neutral with `title`), `urgentEdge` + row tint/hover classes shared by table row, mobile card and header (`tone="urgent"` on `DetailHeader`), `UrgencyControl` (editable/read-only by permission + status), `TeamLeadOrderDialog` + section, `--destructive-subtle-hover` token, filter «Терміновість». Server remains the authority for every state in §2.
- Update the dev-ui badges gallery (`badges.closedUrgent`) so the closed variant is the same neutral component.

### 14. Open UX questions (also in the hand-off message)

1. **Reason for the override.** The story says «audited» but not that a reason is typed. This spec requires a reason (1–500) like other Admin overrides (bonus reward). Confirm, or drop the field and keep audit only.
2. **Inactive Team Lead in the group.** The dialog shows «неактивний» and keeps the row; recommendation: it can be moved, routing skips inactive Team Leads anyway (Phase 3). Confirm with the architect.
