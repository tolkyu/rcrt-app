# Wireframe and spec — Створення вакансії, чернетки (S3) [VAC-01, VAC-02, STORY-VAC-01-1, STORY-VAC-01-3]

Sources: `phase-2.md` stories, `ui-foundation.md` (G6, G11, G14, G17, G20, §4.1 toast copy), `vacancies-list.md`, `lib/schemas/vacancy.ts`, built components (`FormPageLayout`, `FormSkeleton`, `RowActionsMenu`, `DetailHeader`, `ConfirmDialog`, `DisabledReason`, `Select`, `Combobox`, `FilterChips`, form kit). Owner decisions: D82, D87–D101, D110–D113. There is **no designer mockup of this form**; the look follows the invitation mockup (labelled fields, two columns, summary card on the right, footer «Скасувати» left / primary right). Copy below is real Ukrainian; keys go to `messages/uk.json` under `vacancyForm.*` and `vacancies.draft.*` (the engineer moves them; nothing here is hard-coded).

## 1. Entry points

| Place                                              | Control                                                                                   | Visible for                                                                                                     | Hidden for                                                                                                       |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `/vacancies` PageHeader (desktop, ≥ md)            | primary link-button «Створити вакансію» (`Plus`, h 40), last in the actions slot          | `canAuthorDrafts` (Admin; Head Recruiter of the vertical; Recruiter) — same flag that shows the «Чернетки» chip | HR, Head HR, Finance (no create), Team Lead (uses «Запросити вакансію», S4; not built until then)                |
| `/vacancies` mobile (< md)                         | `StickyActionBar` with the same label, 48 px above BottomNav; list gets `pb` = bar height | same                                                                                                            | same; bar is absent on detail/edit/form pages                                                                    |
| `/vacancies` EmptyState, first-ever and «Чернетки» | CTA «Створити вакансію»                                                                   | same                                                                                                            | same: HR/TL see the empty state without a button                                                                 |
| Direct URL `/vacancies/new`                        | form                                                                                      | same                                                                                                            | everyone else gets the S-18 «Сторінку не знайдено або доступ обмежено» (404, no redirect; S4 decides the TL URL) |

- It is a **link** (`next/link`, prefetch on hover/focus/touchstart), not a button with an `onClick`: opens in a new tab with middle click, instant client navigation.
- The CTA is never disabled: the 50-draft limit only blocks «Зберегти чернетку» inside the form (publishing still works).
- Vertical presets: header switcher (D83) → form «Вертикаль». With several verticals and «Усі мої вертикалі» there is no preset (user must choose). With one allowed vertical it is preset and shown as a disabled Select (context stays visible).
- Vertical options = verticals where the user holds `vacancy.create` **and** a recruiting-side grant (`assign_recruiters` / `self_assign`), not just the verticals they can read (an HR + Recruiter user must not get the HR vertical). Engineer: derive from the session grants.

## 2. `/vacancies/new` — fields

Page = `FormPageLayout`: back link «До списку вакансій» (`/vacancies`), `h1` «Нова вакансія», subtitle «Поля з * потрібні для публікації. Для чернетки достатньо вертикалі й назви.». One `<form noValidate>`. `*` on a label means **required to publish** (`FormField required`); the subtitle states the draft minimum. Validation runs on blur (touched) and on submit, per action: «Створити вакансію» validates the `PUBLISH` schema, «Зберегти чернетку» the `DRAFT` subset (a position error shown by a previous publish attempt disappears when it no longer applies).

| #   | Group   | Field (label)                      | Control                                                                                              | Req. publish / draft | Default / preset                                                        | Shown to                                                                     |
| --- | ------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | Основне | Вертикаль                          | `Select` (placeholder «Оберіть вертикаль»)                                                           | ✓ / ✓                | header vertical (D83), else empty; single option = disabled preset      | all authors                                                                  |
| 2   | Основне | Посада                             | `Combobox` (local filter, active positions of the chosen vertical, ≤ 200)                            | ✓ / —                | empty; disabled until vertical is chosen («Спочатку оберіть вертикаль») | all authors                                                                  |
| 3   | Основне | Назва вакансії                     | `Input` + counter `0/200` (`serverTextLength`)                                                       | ✓ / ✓                | prefilled from position (see §2.1), editable                            | all authors                                                                  |
| 4   | Основне | Кількість місць                    | `Input` text, `inputMode="numeric"`, 1–100                                                           | ✓ / —                | `1`                                                                     | all authors                                                                  |
| 5   | Основне | Терміновість вакансії              | `SegmentedControl` «Звичайна» · «Термінова» (`FormField layout="group"`)                             | — / —                | «Звичайна»                                                              | all authors (D100)                                                           |
| 6   | Основне | Тімлід                             | `Combobox` (avatar + «Тімлід · Гемблінг · П0»), clearable, active TLs only                           | — / —                | empty                                                                   | **Admin, Head Recruiter** (`vacancy.team_lead.set`); Recruiter: field absent |
| 7   | Умови   | Рівень                             | `Select`: «Не вказано» + `VACANCY_SENIORITIES`                                                       | — / —                | «Не вказано»                                                            | all                                                                          |
| 8   | Умови   | Формат роботи                      | `Select`: «Не вказано» · Віддалено · В офісі · Гібрид                                                | — / —                | «Не вказано»                                                            | all                                                                          |
| 9   | Умови   | Зайнятість                         | `Select`: «Не вказано» + `VACANCY_EMPLOYMENT_TYPES`                                                  | — / —                | «Не вказано»                                                            | all                                                                          |
| 10  | Умови   | Локація                            | `Input` (≤ 200), placeholder «Наприклад, Київ»                                                       | — / —                | empty                                                                   | all                                                                          |
| 11  | Умови   | Зарплатна вилка: Від · До · Валюта | `Input` ×2 (`inputMode="decimal"`, accepts `2 500,50`) + `Select` (`$ USD`, `€ EUR`, `₴ UAH`; Q-183) | — / —                | empty                                                                   | all                                                                          |
| 12  | Умови   | Випробувальний термін, днів        | `Input` numeric 30–90                                                                                | — / —                | `90`                                                                    | **Admin only**; others see a read-only line (below)                          |
| —   | —       | Опис, Вимоги                       | `RichTextEditor` (F10)                                                                               | — / —                | —                                                                       | **hidden until F10 lands** (Q-184)                                           |

Not in this form, on purpose: **Рекрутери** (assigned on the vacancy card; a Recruiter creator is auto-assigned, D102), **Схема бонусів / винагорода рекрутеру** (not in the create contract — unknown keys answer 400; Q-181), **Пріоритет тімліда для цієї вакансії** (Admin, later, D94). The payload is built **only from visible fields**, so the API never receives a refused key (`teamLeadId` from a Recruiter, `probationDays` from non-Admin). PATCH sends only changed keys.

Read-only line for Head Recruiter / Recruiter at the end of «Умови» (`text-xs`, muted): «Випробувальний термін — 90 днів. Змінити його може адміністратор або керівник HR.»

Hints and helper text (muted, under the control, linked by `aria-describedby`):

| Field            | Hint                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| Посада           | «Потрібна для публікації. Для чернетки можна пропустити.»                                                       |
| Назва            | «Так вакансію бачитимуть у списках і пошуку.»; while auto-filled: «Підставлено з посади — можна змінити.»       |
| Кількість місць  | «Від 1 до 100.»                                                                                                 |
| Терміновість     | «Термінові вакансії виділяються червоним у списках.» (not «Пріоритет», D94)                                     |
| Тімлід           | «Без тімліда вакансія стане «Вакансією від рекрутера» і не потрапить до розподілу, доки тімліда не призначено.» |
| Зарплатна вилка  | «Необовʼязково. Якщо вказуєте суму, оберіть валюту.»                                                            |
| Випробувальний   | «Від 30 до 90 днів. За замовчуванням — 90.»                                                                     |
| Вертикаль (edit) | «Вертикаль чернетки змінити не можна.» (Q-185)                                                                  |

### 2.1 Dependent behaviour

- **Position → title:** choosing a position fills the title when it is empty or still equals the last auto-filled value; a title the user typed is never overwritten. Clearing the position removes an untouched auto-filled title.
- **Vertical change** (only before the first save) clears position and team lead; if something was cleared, a polite live note under «Вертикаль»: «Посаду й тімліда скинуто: вони належать іншій вертикалі.»
- **Position list empty for the vertical:** Combobox empty row «У цій вертикалі немає активних посад» + (Admin/Head Recruiter) link «Додати посаду» to `/vacancies/positions` in a new tab; Recruiter: hint «Попросіть керівника рекрутингу додати посаду». A draft can still be saved without it.
- **Team lead list empty:** «У цій вертикалі немає активних тімлідів».
- **Combobox load error:** row «Не вдалося завантажити список» + «Спробувати ще раз» (existing `common.combobox*`).
- **Salary:** parse to minor units string on blur and show normalised «2 500» (`uk-UA`, `tabular-nums`); currency without any amount → error on currency; amount without currency → error on currency; max < min → error on «До».
- **Enter in a single-line field does not submit** (implicit submit would hit the primary «Створити вакансію» and publish by accident). `Ctrl/⌘ + Enter` runs the primary action; Enter in a Combobox/Select only selects.
- **Readiness rail** (≥ 1280 only, sticky, 320 px, no input): «Готовність до публікації» — ✓/○ «Вертикаль», «Назва», «Посада»; footnote «Чернетку можна зберегти, коли є вертикаль і назва. Бачите її лише ви.»; «Після створення» note: Recruiter «Вас буде призначено рекрутером на цю вакансію.», Head Recruiter/Admin «Рекрутерів призначте на картці вакансії після створення.» Below 1280 the rail is dropped; the note moves to a muted line above the footer. Updates silently (not an `aria-live` region). If the slice runs over budget the rail can be cut; the subtitle already carries the rule.

## 3. Wireframes — create form

### Desktop 1440, Admin, light (content width 1152; form column 720 + rail 320)

```
┌ sidebar 240 ┬ content ───────────────────────────────────────────────────────────────────────┐
│             │ ‹ До списку вакансій                                                           │
│             │ Нова вакансія                                                                  │
│             │ Поля з * потрібні для публікації. Для чернетки достатньо вертикалі й назви.    │
│             │ [!] Виправте 2 поля                                  (FormError, only on error)│
│             │ ┌ form (max 720) ──────────────────────────────────┐ ┌ rail 320, sticky ─────┐ │
│             │ │ Основне                                          │ │ Готовність до         │ │
│             │ │ ────────────────────────────────────────────     │ │ публікації            │ │
│             │ │ Вертикаль *           Посада *                   │ │ ✓ Вертикаль           │ │
│             │ │ [Гемблінг        ▾]   [Оберіть посаду         ▾] │ │ ○ Назва               │ │
│             │ │                       Потрібна для публікації…   │ │ ○ Посада              │ │
│             │ │ Назва вакансії *                          0/200  │ │                       │ │
│             │ │ [                                              ] │ │ Чернетку можна        │ │
│             │ │ Так вакансію бачитимуть у списках і пошуку.      │ │ зберегти, коли є      │ │
│             │ │ Кількість місць *     Терміновість вакансії      │ │ вертикаль і назва.    │ │
│             │ │ [1            ]       (Звичайна)(Термінова)      │ │ Бачите її лише ви.    │ │
│             │ │ Тімлід                                           │ │                       │ │
│             │ │ [Без тімліда                                  ▾] │ │ Рекрутерів призначте  │ │
│             │ │ Без тімліда вакансія стане «Вакансією від…       │ │ на картці вакансії    │ │
│             │ │                                                  │ │ після створення.      │ │
│             │ │ Умови                                            │ └───────────────────────┘ │
│             │ │ ────────────────────────────────────────────     │                           │
│             │ │ Рівень                Формат роботи              │                           │
│             │ │ [Не вказано      ▾]   [Не вказано             ▾] │                           │
│             │ │ Зайнятість            Локація                    │                           │
│             │ │ [Не вказано      ▾]   [Наприклад, Київ          ] │                           │
│             │ │ Зарплатна вилка                                  │                           │
│             │ │ [Від        ] [До          ] [Валюта         ▾] │                           │
│             │ │ Необовʼязково. Якщо вказуєте суму, оберіть валюту│                           │
│             │ │ Випробувальний термін, днів                      │                           │
│             │ │ [90         ]  Від 30 до 90 днів. За замовч. — 90│                           │
│             │ └──────────────────────────────────────────────────┘                           │
│             │ ┌ footer, sticky bottom 0 (border-top, surface) ────────────────────────────┐ │
│             │ │ [Скасувати]                        [Зберегти чернетку] [Створити вакансію] │ │
│             │ └───────────────────────────────────────────────────────────────────────────┘ │
└─────────────┴────────────────────────────────────────────────────────────────────────────────┘
```

Footer: «Скасувати» outline (leaves; dirty → leave guard), «Зберегти чернетку» outline, «Створити вакансію» primary (rightmost, thumb zone). On desktop the cancel stays visually grouped with the others right-aligned (`FormPageFooter` as built: `justify-end`).

### Mobile 390, Recruiter, light

```
┌──────────────────────────────┐
│ ‹ До списку вакансій         │
│ Нова вакансія                │
│ Поля з * потрібні для        │
│ публікації. Для чернетки     │
│ достатньо вертикалі й назви. │
│ Основне                      │
│ Вертикаль *                  │
│ [Гемблінг                  ▾]│  h 44, 16 px text
│ Посада *                     │
│ [Оберіть посаду            ▾]│
│ Потрібна для публікації…     │
│ Назва вакансії *      0/200  │
│ [                           ]│
│ Кількість місць *            │
│ [1                          ]│
│ Терміновість вакансії        │
│ [ Звичайна | Термінова ]     │  segmented, 44 high
│ (no Тімлід field for Rec)    │
│ Умови                        │
│ Рівень / Формат / Зайнятість │  one per row
│ Локація                      │
│ Зарплатна вилка              │
│ [Від      ] [До           ]  │  2 cols
│ [Валюта                    ▾]│
│ Випробувальний термін — 90   │
│ днів. Змінити його може      │
│ адміністратор або керівник HR│
│ Вас буде призначено          │
│ рекрутером на цю вакансію.   │
├──────────────────────────────┤  footer sticky above BottomNav (bottom: --chrome-bottom)
│ [Скасувати][Зберегти чернетку]│  row 1 (flex-1 each)
│ [     Створити вакансію     ]│  row 2, full width (wraps as built)
├──────────────────────────────┤
│ bottom nav                   │
└──────────────────────────────┘
```

- Inputs 16 px (no iOS zoom), `enterKeyHint="next"`; keyboard opens → `interactive-widget=resizes-content` lifts the footer; the footer is in-flow sticky (no overlay) so the last field is never covered.
- Popups (Select/Combobox) `max-height: min(60dvh, available)`; Select options 44 px.
- Footer height ≈ 112 px (two rows) + safe area; accepted because the primary action must stay last and full width.

## 4. Submit, results and feedback

| Action              | Request                                               | Pending                                                                                                                                                                            | Success                                                                                                                                     | Toast                                                         |
| ------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| «Створити вакансію» | `POST /vacancies` `mode: PUBLISH` + `Idempotency-Key` | press feedback < 100 ms; the clicked button `aria-busy`, spinner after 150 ms, **label and width unchanged**; both footer buttons inert (no draft/publish race); fields `readOnly` | seed the detail query cache with the response, `guardRef.release()`, `router.replace('/vacancies/{id}')` → vacancy card                     | success «Вакансію створено» · «V-0015 · Медіабаєр — Facebook» |
| «Зберегти чернетку» | `POST /vacancies` `mode: DRAFT` + key                 | same                                                                                                                                                                               | `release()`, `router.replace('/vacancies?status=DRAFT&vertical={verticalId}&vacancy={id}')` — list with «Чернетки» chip, new draft selected | success «Чернетку збережено» · «V-0015 · …»                   |

- **Idempotency:** one key per attempt, generated on first click, **reused for a retry of the same payload** (network error/timeout), regenerated when any value changes. A second click on a pending button is ignored: exactly one request.
- The draft list landing carries `vertical=` so the header preset (D83) cannot hide the new draft.
- **Leave guard:** `dirty` = any value differs from the initial state; preset vertical and headcount 1 do **not** count, picking a position (which fills the title) does. Covers «Скасувати», back link, sidebar links, browser Back, tab close (F9b). Dialog «Вийти без збереження?» (existing copy). After a successful save always `release()` before `router.replace`.
- **Validation failure:** `FormError` «Виправте N поля/полів» announced once (`role="alert"`), focus to the first invalid field, per-field errors inline (icon + text). Fields that are only invalid for publication are not flagged on «Зберегти чернетку».

### 4.1 Field errors (Zod/API code → Ukrainian)

| Field           | Condition (client Zod = server code)                    | Copy                                                                                                                   |
| --------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Вертикаль       | empty                                                   | «Оберіть вертикаль.»                                                                                                   |
| Посада          | empty on publish (`body.positionId required`)           | «Оберіть посаду, щоб опублікувати вакансію.» (`draftErrors.positionRequired`)                                          |
| Посада          | `invalid_position` / 409 `POSITION_INACTIVE`            | «Посаду деактивовано. Оберіть іншу посаду.» (`draftErrors.positionInactive`); list refetches                           |
| Назва           | empty / `too_small` / `too_big` / `invalid_chars`       | «Введіть назву вакансії.» / «Щонайменше 2 символи.» / «Не більше 200 символів.» / «Назва містить недопустимі символи.» |
| Кількість місць | empty, 0, > 100, not a number                           | «Вкажіть кількість місць від 1 до 100.»                                                                                |
| Тімлід          | `body.teamLeadId invalid_team_lead`                     | «Цей тімлід більше не доступний у вертикалі. Оберіть іншого.» (`draftErrors.teamLeadInvalid`)                          |
| Від / До        | not a number / too large                                | «Введіть суму числом, наприклад 2 500.» / «Занадто велика сума.»                                                       |
| До              | min > max (`body.salaryMaxMinor invalid_salary`)        | «Максимум не може бути меншим за мінімум.»                                                                             |
| Валюта          | `body.salaryCurrency invalid_salary` with an amount     | «Оберіть валюту для зарплатної вилки.»                                                                                 |
| Валюта          | `body.salaryCurrency invalid_salary` without any amount | «Вкажіть суму або приберіть валюту.»                                                                                   |
| Локація         | > 200 / `invalid_chars`                                 | «Не більше 200 символів.» / «Локація містить недопустимі символи.»                                                     |
| Випробувальний  | not 30–90                                               | «Вкажіть від 30 до 90 днів.»                                                                                           |

### 4.2 Server and conflict states

| Response                                    | UI                                                                                                                                                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 409 `DRAFT_LIMIT_REACHED`                   | Inline alert above the footer (`role="alert"`): `createErrors.draftLimitReached` + link «Відкрити чернетки» (`target="_blank"`, so the form is not lost); «Зберегти чернетку» becomes disabled (below). Values kept. |
| 429                                         | Warning toast «Забагато змін за короткий час. Зачекайте хвилину й повторіть.»; daily-limit text (`createErrors.dailyLimitReached`) if the API distinguishes it. Values kept, key reused.                             |
| 403 `FORBIDDEN` (role lost mid-session)     | Error toast «Недостатньо прав для цієї дії.»; the form refetches permissions and hides the refused field.                                                                                                            |
| 404 on create (vertical gone / access lost) | Inline alert «Вертикаль недоступна: можливо, доступ змінився. Оберіть іншу вертикаль.»; verticals refetch.                                                                                                           |
| 409 `IDEMPOTENCY_KEY_REUSED`                | Silent: new key, one automatic retry; then the generic error toast.                                                                                                                                                  |
| Network / 5xx                               | Error toast «Немає зʼєднання» / «Не вдалося зберегти зміни», action «Повторити» (same key); the form stays editable and dirty.                                                                                       |

**50-draft limit:** when the cached draft count ≥ 50, «Зберегти чернетку» is `DisabledReason` (`aria-disabled`, focusable, tooltip on hover/focus, visible helper under the button on touch): `createErrors.draftLimitReached` — «Досягнуто ліміт чернеток (50). Опублікуйте або видаліть одну з них, щоб зберегти нову.» Publishing is not blocked. The server remains the authority (409 above).

## 5. `/vacancies/[id]/edit` — own draft

Same form and components, differences only:

| Aspect                                                      | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title / subtitle                                            | `h1` «Редагування чернетки»; subtitle is one line of text `V-0015 · Гемблінг · Чернетка · Збережено 14.11.2026, 14:05` (S3.3: no dashed badge, so the heading and its loading twin cannot differ in height)                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Vertical                                                    | disabled Select with hint «Вертикаль чернетки змінити не можна.» (Q-185)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Footer                                                      | «Скасувати» · «Зберегти» · «Опублікувати» (primary)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| «Зберегти»                                                  | `PATCH` with `expectedVersion` and **only changed keys**; success → `release()`, `replace('/vacancies?status=DRAFT&vertical=…&vacancy={id}')`, toast «Чернетку збережено». No changes → no request, just leaves (no toast)                                                                                                                                                                                                                                                                                                                                                                                                        |
| «Опублікувати»                                              | Validates the `PUBLISH` schema → errors as in §4.1. Then, if dirty, `PATCH`, then `POST /publish { expectedVersion }` with a per-click `Idempotency-Key`. No confirm dialog (D93). Success → `release()`, `replace('/vacancies/{id}')`, toast «Вакансію опубліковано» · «V-0015 · …». If the PATCH succeeded but publish is refused (`POSITION_INACTIVE`, `invalid_team_lead`), the draft stays saved (baseline updated, no longer dirty), fields show the §4.1 errors, error toast «Не вдалося опублікувати» · «Перевірте виділені поля: посада або тімлід більше недоступні.» with action «Показати поля» (focus first invalid) |
| Loading                                                     | `FormSkeleton` of the same geometry (below)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 404                                                         | S-18 «Сторінку не знайдено або доступ обмежено» (not the author, other role, deleted)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Not a draft (any other status, also a cancelled draft, D82) | The page shows the heading, the alert `draftErrors.notDraft` with the link «До картки вакансії» and **no form** (S3.3: nothing to show read-only). A 409 `VACANCY_NOT_DRAFT` from a save or publish refreshes the page into this state.                                                                                                                                                                                                                                                                                                                                                                                           |
| Unavailable values                                          | Stale position/team lead in the saved draft: Combobox shows the value with a «Недоступно» chip (never blank); error appears only on publish                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Blank headcount / probation                                 | A shown, blank «Кількість місць» or «Випробувальний термін» is the required-field error (`headcountRange`, `probationRange`) in either action, because a patch cannot clear them; create keeps its server defaults (S3.3 review)                                                                                                                                                                                                                                                                                                                                                                                                  |

### 5.1 Stale-version conflict (409 `STALE_STATE`, two tabs of the same author)

- The page **never overwrites what the user is typing** (ui-foundation §4.1). It shows a persistent inline warning above the form (`role="alert"`, tone warning) and a warning toast with the same id (`stale:vacancy:{id}`): «Чернетку змінено в іншій вкладці» / «Ваші правки ще не збережено. Завантажте актуальну версію й внесіть їх знову.»
- When the conflict follows a retry of a save whose answer was lost, the stored draft is read once: if it already holds the change, the save counts as done (toast «Чернетку збережено», no warning).
- Actions in the alert: **«Завантажити актуальну»** (resets the form to the server values, loses local edits; ConfirmDialog only if dirty) and, because PATCH is a diff, **«Зберегти мої правки»** (re-sends my changed keys with the new version; no overlap problem). The second action is optional for the slice; the first is required.
- Publish with a stale version: same alert, draft stays a draft.

### Skeleton (create and edit)

`FormSkeleton` must match the final geometry (G20, ±2 px): real back link, title and subtitle; two group heading bars; field rows as in the grid above (pairs side by side from md, stacked below), segmented-control row, salary trio row; footer with three buttons. Today `FormSkeleton` takes a flat `fields` list — extend it with grid rows (`fields: (kind | kind[])[]`) and group title bars in S3.1. Appears after 150 ms, no shimmer.

## 6. Drafts in the list [STORY-VAC-01-3]

### 6.1 Chip, empty, row

- `FilterChips`: Усі · Відкриті · **Чернетки N** · Призупинені · Заповнені · Скасовані. «Чернетки» exists only for `canAuthorDrafts`; `N` comes from `GET /vacancies/drafts/count` (query key `['vacancies','draftCount']`, own live drafts of authoring verticals; optimistic ±1 after save/publish/cancel/delete). Announced «Чернетки, 4, вибрано». «Усі» neither lists nor counts drafts (D110). Other chips have no counts in S3.
- Empty «Чернетки»: icon `FileText`, title «У вас немає чернеток», description «Збережені чернетки бачите лише ви.», CTA «Створити вакансію». The view does not auto-switch chips when the count reaches 0.
- Draft row (desktop table / mobile card): status cell = dashed **«Чернетка»** badge (G12; never colour alone); «Відкрита з» cell «Ще не відкривалась» (existing `notOpenedYet`); position missing → muted second line «Посаду не обрано»; «Термінова» draft keeps the red edge and flame (D99: DRAFT is highlighted). Row `⋯` (`RowActionsMenu`, aria-label «Дії: {title}») is visible on touch and keyboard, not hover-only.

```
┌ desktop row (h ≈ 68) ─────────────────────────────────────────────────────────────────────────┐
│ Медіабаєр — Facebook  [Термінова 🔥]    Гемблінг   —   (┄ Чернетка ┄)   Ще не відкривалась  ⋯ │
│ V-0015 · Посаду не обрано                                                                      │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
  ⋯ menu            ┌───────────────────────────┐
                    │ ✎  Редагувати             │
                    │ ➤  Опублікувати           │  disabled + reason when position is empty
                    │ ───────────────────────── │
                    │ ⊘  Скасувати вакансію…    │  destructive
                    │ 🗑  Видалити…              │  destructive
                    └───────────────────────────┘
```

**S3.4 decision — `⋯` placement (decided 2026-11-17, keeps the engineer's build).** `⋯` stays inside the title cell (right edge of the cell, top-aligned with the title, `shrink-0`) on the desktop table and top-right (`top-2 right-2`, 44 px touch) on the mobile card; the diagram above shows the target. Reason: the menu exists only on own drafts (and, in S3.5, own cancelled drafts), so a dedicated column would be empty on every other row and would force a new head cell and skeleton column. When the row menu reaches all vacancies (`vacancies-list.md`: Відкрити · Редагувати · Клонувати · Призупинити · Видалити), move it to a trailing «Дії» column (sr-only head, `w-14`, placed before the xl preview toggle) and update `VacanciesTableHead` and `RowSkeleton` in the same slice. Mobile: the title gets `pr-11` on every row that has a menu (today `DRAFT`; S3.5 adds own cancelled drafts — keep the condition in one helper next to `ownDraftActions`). Worst case to screenshot: 200-char title and the unbreakable 80-char word must never run under `⋯`.

Own **cancelled never-opened draft** (`status = CANCELLED` and `openedAt = null`; such a row can only be the viewer's own cancelled draft) under «Скасовані»: neutral «Скасована» badge, menu = «Відкрити картку» · ─ · «Видалити…». No edit/publish/cancel.

Naming: the footer button «Скасувати» means «leave the form»; the menu/dialog action is therefore **«Скасувати вакансію…»** (S-06 already uses it), with the dialog buttons «Скасувати вакансію» / «Залишити чернетку». Never a bare «Скасувати…» next to «Скасувати».

### 6.2 Preview panel (≥ 1280) and card (`/vacancies/[id]`, mobile)

`DetailHeader`: eyebrow `V-0015 · Гемблінг`, title clamped to 3 lines, badges (dashed «Чернетка», «Термінова»), muted line `vacancies.draft.privateNote` «Чернетку бачите лише ви.» (info tone), then the actions row:

```
┌ preview 360 ─────────────────────────┐        ┌ mobile card page, 390 ───────┐
│ V-0015 · Гемблінг                    │        │ V-0015 · Гемблінг            │
│ Медіабаєр — Facebook                 │        │ Медіабаєр — Facebook         │
│ (┄ Чернетка ┄) [Термінова 🔥]       │        │ (┄ Чернетка ┄) [Термінова]   │
│ Чернетку бачите лише ви.             │        │ Чернетку бачите лише ви.     │
│ [➤ Опублікувати] [✎ Редагувати] [⋯] │        │ [  ➤ Опублікувати          ] │ h 44, full width
│                                      │        │ [✎ Редагувати]          [⋯]  │
│ Команда … Умови … (existing blocks)  │        │ (existing sections)          │
└──────────────────────────────────────┘        └──────────────────────────────┘
```

**S3.4 decisions (2026-11-17)** — the wireframe above is the S3.5 target; S3.4 ships this interim state:

| #   | Topic                           | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2a  | «Поділитися» on a private draft | **Hidden** while the vacancy is private: `status = DRAFT`, or `CANCELLED` with `openedAt = null` (own cancelled draft). Nobody else can open the link (404), so the button promises something that cannot work. Predicate `isPrivateDraft(vacancy)` lives next to `ownDraftActions` and is used by `VacancyOverview`. The button appears when the card becomes `OPEN`. No product change: drafts are already author-only (D92, D98, D110)                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2b  | `privateNote`                   | **Draw it.** `DetailHeader` gets an optional `note` slot after the badges (`mt-3`, `text-xs`, muted-strong text, `Lock` icon 14 px `aria-hidden`); text key `vacancies.draft.privateNote` = «Чернетку бачите лише ви.» (**the key is missing in `messages/uk.json`; add it**). Shown in preview and on the card for private drafts; it also tells the user why there is no «Поділитися». It disappears with the optimistic flip to `OPEN` (one-off height change after a user action; accepted)                                                                                                                                                                                                                                                                                                                                                                  |
| 2c  | «Відкрити картку» in the preview | **Keep for S3.4**, after «Редагувати» (outline). Without `⋯` it is the only way from the preview to the card besides the row title link. At 320 px of panel width it wraps to a second row — accepted. **S3.5:** it moves into the preview `⋯` menu as the first item («Відкрити картку» · ─ · «Скасувати вакансію…» · «Видалити…»), giving the wireframe row [Опублікувати][Редагувати][⋯]. The card page never shows it                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2d  | Mobile card layout (< md)       | **Change.** Row 1: «Опублікувати» full width (`w-full`, h 44; `DisabledReason className="w-full"` so the touch helper text sits under the button, full width). Row 2: «Редагувати» `flex-1` (full width until S3.5, then `flex-1` + `⋯` 44 × 44). From md: natural width, one row (`md:w-auto`, `md:flex-none`). Implement with the wrapping classes on the two items inside the existing `flex-wrap` actions slot (`basis-full md:basis-auto` on the publish wrapper); do not change `DetailHeader` for it. Reason: the primary action sits in the thumb zone on a phone and the layout matches §3 forms                                                                                                                                                                                                                                              |
| 3   | Focus around publish on the card | See the focus rule below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

**Focus rule on the card (decision 3, change).** The press removes «Опублікувати» at once (optimistic `OPEN`), so focus must not be lost:

1. On press: remember `focusAfterPublish`. When the next render shows the `OPEN` header, move focus to its first action. Today that is «Поділитися», which does not exist while the draft is private (2a), so the current `shareButton.current?.focus()` inside `onRemoved` would find `null` and focus would fall to `<body>`. Use an effect keyed on the status flip, not a ref read inside the callback.
2. On refusal (`restored`): the card returns to `DRAFT` and «Опублікувати» is back. **Focus returns to «Опублікувати»** (the control the user pressed; a screen-reader user hears the error toast, then lands on the retry action). Today nothing handles `restored` on the card, so focus stays on «Поділитися». Add `onRestored` next to `onPublished`, wired to a ref on the publish button (forward the ref through `DisabledReason`'s child). Never focus the toast.
3. If the press was refused before any optimistic step (`fields`, blocker), focus never moved: do nothing.
4. In the list preview the `DraftLeave` context already moves selection and focus to the next row (§6.4); the card rule applies only when no list is mounted.
5. No animation on any of these focus moves.

**Worst case (break-ui) to screenshot for S3.4:** draft with no position on the card on a 320 px phone (disabled publish, touch helper text wraps to 2 lines, no overlap with «Редагувати»); 200-char title with «Термінова» in the preview; publish refused on the card (status back to «Чернетка», focus on «Опублікувати», toast visible above the bottom nav).

- «Опублікувати» primary, «Редагувати» outline, `⋯` (S3.5) = «Скасувати вакансію…», «Видалити…». Disabled publish: `DisabledReason` «Оберіть посаду, щоб опублікувати вакансію.» (tooltip on desktop, helper text on touch). Position is the only publish blocker known client-side (title and headcount are always valid); position/TL invalidity is decided by the server on click.
- Cancelled own draft: header actions = «Видалити…» only.
- Detail page after an action: publish → stays on the card, now `OPEN` (chip, actions, private note change; toast); cancel → stays, status «Скасована», actions reduce to «Видалити…»; delete → `router.replace('/vacancies?status=DRAFT')` (or `status=CANCELLED` for a cancelled draft) + toast.

### 6.3 Dialogs (`ConfirmDialog`, tone destructive, two different dialogs, never merged)

**Cancel** (`reason` required, multi-line, 1..500, Enter = new line, D113; counter must count like the server multi-line schema):

| Part         | Copy                                                                                                                                                                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title        | «Скасувати вакансію?»                                                                                                                                                                                                                   |
| Description  | «V-0015 · {title}» (wraps, ≤ 200 chars, `overflow-wrap:anywhere`)                                                                                                                                                                       |
| Consequences | «Вакансію буде закрито зі статусом «Скасована». Редагувати чи опублікувати її більше не вийде.» · «Скасовані чернетки бачите лише ви — у фільтрі «Скасовані». Їх можна видалити.» · «Щоб прибрати чернетку зовсім, оберіть «Видалити».» |
| Reason       | label «Причина скасування», hint «Бачите лише ви. Можна писати в кілька рядків.», counter `0/500`                                                                                                                                       |
| Buttons      | «Залишити чернетку» (default focus) · «Скасувати вакансію» (destructive; disabled with «Вкажіть причину» until a visible character exists)                                                                                              |
| Errors       | inline: 409 stale `draftErrors.stale`; `notDraft` `draftErrors.notDraft`; 404 → dialog closes, toast «Чернетку не знайдено» and the list refetches                                                                                      |

**Delete** (no reason field; fixed reason sent by the client):

| Part         | Copy                                                                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title        | «Видалити чернетку?» (cancelled one: «Видалити скасовану вакансію?»)                                                                                                       |
| Description  | «V-0015 · {title}»                                                                                                                                                         |
| Consequences | «Вакансія зникне зі списку. Відновити її не можна.» · «Номер V-0015 не буде використано повторно.» · «Щоб лише закрити вакансію й лишити запис, скасуйте її.» (draft only) |
| Buttons      | «Залишити» (default focus) · «Видалити» (destructive)                                                                                                                      |

Both: pending = buttons keep width, spinner after 150 ms, dialog cannot be dismissed while in flight; focus returns to the opener — or, if the row is gone, to the next row's title link (see 6.4).

### 6.4 After each action (list)

| Action                                  | Row / count                                                                                               | Selection (`vacancy=`)                                                           | Toast                                                                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Опублікувати (row/preview)              | **Optimistic**: row leaves «Чернетки» and the count −1 at once; rollback + toast on failure; no animation | next row, else previous, else none (empty state); focus to that row's title link | success «Вакансію опубліковано» · «V-0015 · …», action «Відкрити» (→ card)                                             |
| Скасувати вакансію                      | Dialog waits for the response, then row leaves «Чернетки» (appears under «Скасовані»), count −1           | same                                                                             | success «Вакансію скасовано» · «V-0015 · Причину збережено в історії»                                                  |
| Видалити                                | Dialog waits, then row disappears, count −1 (a cancelled draft: no count change)                          | same                                                                             | success «Чернетку видалено» (cancelled: «Скасовану вакансію видалено»)                                                 |
| Редагувати                              | navigates to `/vacancies/{id}/edit`                                                                       | —                                                                                | —                                                                                                                      |
| 409 `STALE_STATE` / `VACANCY_NOT_DRAFT` | list + detail refetch automatically (not a form)                                                          | stays or next                                                                    | warning «Дані вже змінилися» · «Ми оновили дані. Перевірте актуальний стан і повторіть дію.» (id `stale:vacancy:{id}`) |
| `POSITION_INACTIVE` on publish          | rollback                                                                                                  | stays                                                                            | error «Не вдалося опублікувати» · «Перевірте виділені поля: посада або тімлід більше недоступні.», action «Редагувати» |

Publishing from a row needs the draft `version`: use the cached detail (the row hover/focus already prefetches it); if missing, `fetchQuery` first with the row `aria-busy`. Backend nicety (not blocking): put `version` into `VacancySummary` for a single round trip.

## 7. States summary

| Screen           | Loading                                                                                      | Empty                        | Error                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `/vacancies/new` | route `loading.tsx` = `FormSkeleton` (RSC prefetch of verticals/positions usually skips it)  | n/a                          | verticals failed → `SectionError` «Не вдалося завантажити дані» + retry (URL kept); picker errors inline (see §2.1) |
| `/…/edit`        | `FormSkeleton`                                                                               | n/a                          | 404 → S-18; not-draft alert; stale alert                                                                            |
| List «Чернетки»  | `RowSkeleton`; chip count shows after load (no layout shift: chip has no number until known) | «У вас немає чернеток» + CTA | `SectionError`, filters kept                                                                                        |
| Preview/card     | existing skeletons                                                                           | —                            | existing                                                                                                            |

## 8. Accessibility and keyboard

- Tab order: back link → Вертикаль → Посада → Назва → Кількість → Терміновість (one tab stop, arrows move) → Тімлід → Рівень → Формат → Зайнятість → Локація → Від → До → Валюта → [Випробувальний] → «Скасувати» → «Зберегти чернетку» → «Створити вакансію». Rail is not focusable.
- Labels always visible; `*` + sr-only «(обовʼязкове)» (`FormField`); errors `aria-describedby` + `aria-invalid`; summary `role="alert"` once per failed submit; first invalid field focused and scrolled with `scroll-margin` above the sticky footer.
- Combobox follows APG (existing); Esc closes the popup first, never leaves the page; Select type-ahead works in Ukrainian.
- Disabled-with-reason controls stay focusable (`aria-disabled`); on touch the reason is visible text.
- Targets ≥ 44 px on touch (inputs, segments, options, `⋯`, footer buttons). Focus ring never removed; forced-colours safe. Contrast: `*`, errors, dashed badge text ≥ 4.5:1 in both themes.
- No motion in the form: no animation on validation, hints, rail ticks or field dependencies (frequency gate, ui-foundation §3). Only built motion applies (Dialog, Select/Combobox pop, toast). Reduced motion: opacity only.
- Speed: Link prefetch on the CTA; verticals/positions/team leads prefetched for the preset vertical; position list `staleTime` 60 s; response of create/publish seeds the detail cache so the card renders instantly; pending feedback < 100 ms on every click.

## 9. Worst-case data (break-ui) to cover

Title of 200 chars and the unbreakable «Медіабаєр-арбітражник-наставник-крос-платформений-спеціаліст-закупівлі-трафіку»; position name of 80 chars in Combobox trigger (ellipsis + `title`, wrapped in list); two Team Leads with the same name (show vertical + П0); inactive/removed position or TL in a saved draft («Недоступно»); salary `999 999 999 999 999` minor units, paste `2 500,50`, min > max; currency without amount; headcount `0`, `101`, `1e3`; 3-line error text; 320 px width and 200 % zoom (footer wraps, nothing clipped); 50 drafts (count `50`, save disabled); user with several verticals and no preset; role with one vertical (disabled preset); labels +30 % longer.

## 10. Screenshot list for QA

Naming `NN-<role>-vacancy-form-<state>-<viewport>-<theme>.png`, desktop 1440×900 / mobile 390×844, light and dark, fixed clock, axe on every state (fail on serious/critical).

| Group             | Roles                                         | States                                                                                                                                                                                                                                                                                 |
| ----------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| List entry        | Admin, Head Recruiter, Recruiter              | CTA in header (desktop), sticky bar over BottomNav (mobile), empty list with CTA                                                                                                                                                                                                       |
| List entry denied | HR, Head HR, TL, Finance                      | no CTA, empty state without button; `/vacancies/new` → S-18                                                                                                                                                                                                                            |
| Draft list        | Recruiter, Head Recruiter, Admin              | «Чернетки 4» selected (desktop+mobile), «Чернетки 0» empty, count 50, draft row (incomplete, urgent), row menu open (desktop, touch), disabled publish with tooltip / touch helper, preview header actions, mobile card actions, own cancelled draft (menu: Видалити…)                 |
| Create form       | Admin (all fields), Head Recruiter, Recruiter | empty, filled, preset single vertical, title auto-filled, publish errors with summary, draft-minimum errors, salary errors, position list empty, combobox open, team lead empty, vertical-change note, pending, draft limit (disabled save + hint), 409 inline alert, loading skeleton |
| Leave guard       | Recruiter                                     | dialog desktop + mobile sheet                                                                                                                                                                                                                                                          |
| Edit              | Recruiter, Admin                              | loaded (vertical disabled), loading, not-draft alert, 404, stale alert + toast, publish refused (position inactive) with fields flagged                                                                                                                                                |
| Dialogs           | Recruiter                                     | cancel (empty = disabled, filled, 500 chars multi-line, pending, inline stale, 200-char title), delete (draft, cancelled), mobile bottom sheet versions                                                                                                                                |
| Toasts            | Recruiter                                     | draft saved, created, published (with «Відкрити»), cancelled, deleted, 409 stale, limit/429, above the sticky bar on mobile                                                                                                                                                            |
| Worst case        | Admin                                         | 200-char title, long names, 320 px, 3-line errors                                                                                                                                                                                                                                      |

E2E (not screenshots): Enter in Назва does not submit; `Ctrl+Enter` publishes; double click → one request; Back with dirty form asks; after save no stale history entry; Admin payload contains `probationDays` only when changed, Recruiter never sends `teamLeadId`/`probationDays`; draft invisible to Admin/Head Recruiter (404 on `/edit`).

## 11. Slices (≤ ~400 lines each)

| Slice | Scope                                                                                                                                                                                                                                                                                                                                                 | ≈ lines |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| S3.1  | Entry points (PageHeader link, `StickyActionBar`, EmptyState CTA), `/vacancies/new` + `loading.tsx`, `FormSkeleton` grid/group extension, form state + client schema, group «Основне» (vertical, position, title prefill, headcount, urgency), both submits, idempotency, error mapping, leave-guard release, redirects, toasts, `vacancyForm.*` copy | 380     |
| S3.2  | Team lead picker (small API: assignable Team Leads of a vertical for `vacancy.team_lead.set`; existing endpoint is Admin-only), group «Умови» (selects, location, salary + currency, Admin probation, read-only line), readiness rail, draft-limit `DisabledReason`, field-level server errors                                                        | 360     |
| S3.3  | `/vacancies/[id]/edit`: load, diff PATCH, footer «Зберегти»/«Опублікувати» (PATCH → publish), not-draft/404, stale alert + toast, publish-refused handling                                                                                                                                                                                            | 330     |
| S3.4  | List: «Чернетки» chip + count query, draft badge/row, row `⋯` menu, preview/card header actions (Редагувати, Опублікувати + `DisabledReason`), optimistic publish, selection and focus handling                                                                                                                                                       | 350     |
| S3.5  | Cancel (multi-line reason; server schema helper from D113) and Delete dialogs wired to menu, preview and card; own cancelled-draft delete; toasts; inline 409; counts                                                                                                                                                                                 | 280     |
| S3.6  | QA: E2E, screenshots (§10), axe, real-phone check of footer/sticky bar; designer review `docs/ux/review-phase-2-s3.md`                                                                                                                                                                                                                                | tests   |
| F10   | RichTextEditor + «Опис»/«Вимоги» in the form (trails S3; Q-184)                                                                                                                                                                                                                                                                                       | 380     |

Order: S3.1 → S3.2 → S3.3 and S3.4 (independent) → S3.5 → S3.6. The orchestrator may ship S3.1–S3.2 without S3.3+ for an early owner look, but drafts have no edit path until S3.3.

## 12. Open questions (also in `docs/OPEN_QUESTIONS.md`, Q-181..Q-185)

| #     | Question                                                                                                                                                     | Recommendation                                                                                                                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Q-181 | Admin bonus scheme / recruiter reward: at creation (as `screens.md` S-05 says) or only on the vacancy card? The shipped create contract has no bonus fields. | а) on the card after creation (BONUS-16, with its 2-month rule and mandatory reason); form omits bonus                                   |
| Q-182 | Probation length 30–90: who sees it in the create form, and where does Head HR change it (Head HR cannot author vacancies)?                                  | а) field only for Admin in the form; Head HR on the vacancy card (VAC-08 slice); Recruiter/Head Recruiter see a read-only «90 днів» line |
| Q-183 | Salary currencies offered in the form (API accepts any ISO code).                                                                                            | а) USD, EUR, UAH (USD first)                                                                                                             |
| Q-184 | «Опис» / «Вимоги»: S3 without them (hidden until the rich text editor F10) means vacancies created meanwhile have no description and no edit path until V3.  | а) hide until F10 and show S3 + F10 to the owner together (a plain textarea would need a throwaway UI)                                   |
| Q-185 | The vertical of a draft cannot be changed after the first save (changing it would invalidate position and Team Lead and the authz scope).                    | а) keep; to change it, delete the draft and create a new one                                                                             |

Designer decisions taken without owner input (UX scope, easy to change): form is a page; one `*` meaning «потрібне для публікації»; Enter does not submit; publish from the row menu; «Зберегти» on edit returns to the list; menu action named «Скасувати вакансію…»; readiness rail is optional; stale-version «Зберегти мої правки» is optional.
