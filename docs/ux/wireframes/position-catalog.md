# Wireframe — Довідник посад — `/vacancies/positions` [VAC-01, D75, D76, D83, D90, ADR-013 §UI]

Pattern source: Verticals screen in `settings-admin.md` §2 + `components/settings/verticals-view.tsx` / `vertical-name-dialog.tsx`. Shell per `app-shell.md` (Hiring shell, not the Settings frame). Tokens per `design-system.md`. Scope: catalog management only — **no** create-vacancy form, **no** Team Lead request UI here (they consume the catalog later: V2b, D90).

## 0. Access and entry

| Item             | Rule                                                                                                                                                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Who              | Holders of `position.manage`: Admin (all verticals), Head Recruiter (own verticals). Page = HTTP 404 (`NotFoundState`) for everyone else, incl. Recruiter, TL, HR, Head HR; Finance 404 before any param parsing                                            |
| Entry            | Outline button «Довідник посад» (icon `book-open`) in the «Вакансії» `PageHeader` actions, rendered only with `position.manage`. No sidebar/bottom-nav item. Sidebar «Вакансії» stays active on this route                                                  |
| Back             | Link `‹ Вакансії` above the title (desktop and mobile); returns to the remembered vacancy list URL (`vacancy-list-memory`), so vacancy filters survive the round trip                                                                                       |
| Admin at aal1    | Grants are withheld (SEC-CORE-09) → the entry button is hidden; a typed URL redirects to `/mfa/verify?next=…` like other privileged pages. aal drop mid-session (401 `MFA_REQUIRED`): Alert «Підтвердьте вхід кодом 2FA, щоб керувати довідником.» + button |
| Denied-by-design | No disabled "future" controls and no DisabledReason: every control shown is allowed (the list already holds only managed verticals). The only disabled states are pending mutations and "name unchanged"                                                    |

## 1. Desktop 1440 — list

Content = `PageHeader` + `Card p-0` (radius 16), `max-w-5xl` (1024) left-aligned so rows stay readable. Row h 48, single line (long names wrap to a 2nd line, never ellipsis). The page-header button sits inside this column. Only one layout is in the DOM: table from 768 px, cards below (server hint from the User-Agent, then `matchMedia`); cards use `content-visibility: auto`.

### 1.1 Several verticals (Admin; Head Recruiter with ≥ 2 managed verticals) — grouped, filter «Усі вертикалі»

```
│ ‹ Вакансії                                                                                     │
│ Довідник посад                                                         [Додати посаду]        │
│ Посади, які можна обрати у вакансіях                                                          │
│                                                                                                │
│ Вертикаль            ☐ Показати неактивні                                                      │
│ [ Усі вертикалі     ▾]                                                                         │
│ ┌────────────────────────────┬─────────────┬────────────────────┬────────────┬──────────────────────────────────┐ │
│ │ Назва                      │ Статус      │ Відкриті вакансії  │ Створено   │                                  │ │
│ ├────────────────────────────┴─────────────┴────────────────────┴────────────┴──────────────────────────────────┤ │
│ │ Гемблінг · 4 активні, 1 неактивна                                                                            │ │
│ ├────────────────────────────┬─────────────┬────────────────────┬────────────┬──────────────────────────────────┤ │
│ │ Медіабаєр — Facebook       │ ● Активна   │ 2                  │ 15.10.2026 │ [✎ Перейменувати] [Деактивувати] │ │
│ │ Старший спеціаліст із закуп│ ● Активна   │ 0                  │ 20.10.2026 │ [✎ Перейменувати] [Деактивувати] │ │
│ │ івлі трафіку та масштабува │             │                    │            │                                  │ │
│ │ ння кампаній Facebook Ads  │             │                    │            │                                  │ │
│ ├────────────────────────────┴─────────────┴────────────────────┴────────────┴──────────────────────────────────┤ │
│ │ Крипто · 1 посада                                                                                            │ │
│ ├────────────────────────────┬─────────────┬────────────────────┬────────────┬──────────────────────────────────┤ │
│ │ Трейдер-аналітик           │ ● Активна   │ 1                  │ 02.11.2026 │ [✎ Перейменувати] [Деактивувати] │ │
│ └────────────────────────────┴─────────────┴────────────────────┴────────────┴──────────────────────────────────┘ │
│ Показано 5 посад                                                                                               │
│ ⓘ Посади не видаляються. Неактивну посаду можна повернути, а її назва лишається зайнятою.                       │
```

(Word breaks in the long name above are only an ASCII artefact; real text wraps whole words, no hyphenation, `lang="uk"`.)

- **Grouping:** when the filter is «Усі вертикалі» and the user manages ≥ 2 verticals, rows are grouped under vertical sub-headings (`h2`, `text-sm` 600, `--surface-muted` band, `colspan` row, count «N активних, M неактивних» with Ukrainian plural forms, e.g. «Гемблінг · 0 активних, 3 неактивні»; the inactive part is omitted when there are none; inactive positions are counted from the loaded data even while «Показати неактивні» is off). A vertical without positions still shows its band plus one muted row «У цій вертикалі посад ще немає.» and a text button «Додати посаду» that opens the create dialog with that vertical preselected.
- **Single vertical selected** (or the user manages exactly one): flat list, no bands; the vertical name sits in the subtitle («Посади вертикалі «Гемблінг», які можна обрати у вакансіях»).
- **Vertical filter:** native `<select>` with label (same `FilterSelect` as the vacancy list; extract it to a shared component in T3). Options = managed verticals only (Admin = all). Hidden when the user manages one vertical.
- **Initial value (D83 logic):** `?vertical=` → else the header vertical switcher value if it is one of the **managed** verticals → else «Усі вертикалі». A header value the user cannot manage here (e.g. Recruiter role in B) falls back to «Усі вертикалі». Changing the page filter does not change the header switcher.
- **«Показати неактивні»:** checkbox (native, label row `min-h-11`), default off. The data call is always `status=all` (needed for counts and the toggle); the toggle only filters the client list, so flipping it is instant.
- **URL state:** `?vertical=<id|all>&inactive=1` (`replaceState`, survives reload and Back).
- **Sort:** inside a group by name (uk collation), like verticals; active and inactive interleaved.
- **Status column:** `PositionStatusChip` (dot + text, never colour alone): Активна = green (`--success-subtle` / `--success-text`), Неактивна = slate with dashed border (same as deactivated user chip). Inactive row text uses `--muted-foreground`; name stays AA.
- **Відкриті вакансії:** integer, `tabular-nums`, right-aligned header/cell not required (left, like other columns). Count = live vacancies with status OPEN only (owner 2026-11-09: no drafts, no ON_HOLD; ADR-013); no link yet (vacancy list has no position filter in V2a; add `?position=` link when it ships). `null` → «—».
- **Row actions:** two ghost buttons, h 32. Active row: «Перейменувати» + «Деактивувати»; inactive row: «Перейменувати» + «Активувати». Below `lg` (1024) the labels collapse to icons (`pencil`, `power-off`/`power`) with `aria-label` «Перейменувати: {name}» etc.; hit area still ≥ 32.
- **Footer:** `role="status"` «Показано N посад» (count of visible rows) and the info note — `text-sm`/`text-xs` muted.

### 1.2 Head Recruiter with one managed vertical

Same as 1.1 without vertical filter, without bands; subtitle names the vertical; dialog has no vertical field.

### 1.3 Dialogs (Dialog 440 centred; same component and structure as `VerticalNameDialog`)

```
┌ Нова посада ────────────────────────── [×] ┐   ┌ Перейменувати посаду ──────────────── [×] ┐
│ Вертикаль *                                 │   │ Поточна назва: Медіабаєр — Facebook        │
│ [ Оберіть вертикаль                    ▾]   │   │ Назва *                                    │
│ Назва *                                     │   │ [ Медіабаєр — Facebook          ] 21/80    │
│ [                              ] 0/80       │   │ Нова назва одразу зʼявиться у вакансіях і  │
│ Від 2 до 80 символів. Регістр не            │   │ фільтрах. Стара залишиться в історії.      │
│ враховується, назва унікальна в межах       │   │            [Скасувати] [Перейменувати]    │
│ вертикалі.                                  │   └────────────────────────────────────────────┘
│                    [Скасувати] [Додати]     │
└─────────────────────────────────────────────┘
```

- **Vertical field (create only):** shown when the user manages ≥ 2 verticals; native select with label. Preselected only when the page filter is a single vertical; with «Усі вертикалі» it starts empty (placeholder «Оберіть вертикаль») so a position never lands in the wrong vertical by default. Single managed vertical → field not rendered. Rename never shows it (a position never moves vertical).
- **Name field:** trim; `maxLength` = 80 + 20 (so a paste shows the error instead of silently cutting); counter `0/80` (`aria-hidden`); text selected on open in rename; `autocomplete="off"`; `text-base` on mobile.
- **Validation:** blur + submit, shared `positionNameSchema` (trim, 2..80, no control chars). Messages in §6. First invalid field focused.
- **Rename unchanged:** submit disabled + muted hint «Назва не змінилася.» (after first edit, as vertical). Case-only change is a change.
- **Create/rename wait for the server** (no optimistic row — name uniqueness is a server truth). Submit label «Зберігаємо…», buttons disabled, Esc/overlay ignored while pending.
- **Success:** dialog closes, `['positions']` invalidated, `['vacancies']`/`['vacancy']` too on rename; toast; focus rule §5.

#### Duplicate name (409 `POSITION_NAME_TAKEN`)

- Inline error under the name field (`role="alert"`, `aria-describedby`, field `aria-invalid`), dialog stays open, typed value kept, field focused: «Посада з такою назвою вже є; неактивна посада резервує назву.»
- Client pre-check against the loaded list (same vertical, case-insensitive) shows the same error on submit without a request; if the match is **inactive** the text becomes «Посада «{name}» вже є, але неактивна. Активуйте її в списку.» Server stays the only arbiter (race → 409 → same inline message).
- Applies to create and rename; same-vertical scope only (same name in another vertical is fine).

#### Stale version (409 `STALE_STATE`, rename / deactivate / reactivate)

- Rename dialog: stays open with the typed value; inline `Alert` (warning, `role="alert"`) above the buttons «Посаду щойно змінили. Ми оновили дані — перевірте й повторіть.»; list refetched; «Поточна назва» line updates; submit re-enabled with the fresh `expectedVersion`. If the refreshed name already equals the typed value → "unchanged" state.
- Deactivate dialog: stays open, same Alert, body and open-vacancies count re-rendered from the refetch; the user presses «Деактивувати» again. If the position is already inactive, the dialog closes with toast «Посада вже неактивна.» (reactivate: «Посада вже активна.»).
- Row buttons (optimistic reactivate) → rollback + the same Alert as a toast `positions.errors.stale`.

#### Deactivate confirm (AlertDialog, 440; default focus «Скасувати»)

```
┌ Деактивувати посаду: Медіабаєр — Facebook? ───────────────┐
│ Посада перестане пропонуватися в нових вакансіях. Наявні   │
│ вакансії, кандидати й історія не зміняться.                │
│ ┌ ⚠ За цією посадою є 2 відкриті вакансії. Вони           ┐│
│ │ працюватимуть як раніше, але нову вакансію з цією       ││
│ │ посадою створити не вдасться.                           ││   ← only if openVacanciesCount > 0
│ └─────────────────────────────────────────────────────────┘│
│ Посаду можна активувати знову будь-коли. Її назва           │
│ залишається зайнятою.                                       │
│                         [Скасувати] [Деактивувати]          │
└─────────────────────────────────────────────────────────────┘
```

- Open vacancies **do not block** (ADR-013): warning = inline Alert (`--warning-subtle` / `--warning-text`, icon `triangle-alert`, not colour-only), not a second confirm step. Count uses ICU plural (1 відкрита вакансія / 2–4 відкриті вакансії / 5+ відкритих вакансій).
- Confirm = filled destructive (consistent with user/vertical-level deactivation, design-system §4); title puts `{name}` after the colon (no case forms).
- After confirm: **optimistic** — row switches to «Неактивна» (or leaves the list if «Показати неактивні» is off) at once; failure → rollback + toast `positions.errors.saveFailed`.
- **Reactivate has no dialog** (not destructive, instantly reversible): optimistic chip flip + toast «Посаду «{name}» знову активна».

## 2. Mobile 390

```
┌──────────────────────────────┐
│ ☰  Hiring        🔔  (АД)    │  top bar 56
├──────────────────────────────┤
│ ‹ Вакансії                   │  link, h 44
│ Довідник посад               │  heading-lg
│ Посади, які можна обрати у   │
│ вакансіях                    │
│ Вертикаль                    │
│ [ Усі вертикалі           ▾] │  h 44, text-base
│ ☐ Показати неактивні         │  row h 44
│                              │
│ Гемблінг · 4 активні,        │  group heading (sticky under top bar),
│ 1 неактивна                  │  wraps at 390
│ ┌──────────────────────────┐ │
│ │ Медіабаєр — Facebook     │ │  text-base 600, wraps
│ │ ● Активна                │ │
│ │ Відкриті вакансії: 2     │ │
│ │ Створено 15.10.2026      │ │
│ │ [✎ Перейменувати][Деакт.]│ │  2 buttons h 44, 50/50
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ Трейдер-аналітик         │ │
│ │ ○ Неактивна              │ │
│ │ Відкриті вакансії: 0     │ │
│ │ [✎ Перейменувати][Активувати]│
│ └──────────────────────────┘ │
│ [ + Додати посаду ] sticky 48│
├──────────────────────────────┤
│ ⌂  Вакансії●  Кандидати … Ще │  bottom nav 64
└──────────────────────────────┘
```

- Cards radius 16 (24 for full-width card edge per DS), gap 8, padding 16; list bottom padding = sticky button + bottom nav + safe area so the last card is never covered.
- Row action buttons `h-11` (44), labels always visible, equal width; «Перейменувати» and «Деактивувати» fit at 390 (≈159 px each); if a label wraps, buttons grow to 2 lines, never truncate.
- Dialogs → bottom sheets (built into `components/ui/dialog.tsx` < 768): `max-h 85dvh`, safe-area padding, stacked full-width buttons h 48, confirm at the bottom, «Скасувати» above. Inputs 44 px, `text-base` (no iOS zoom). Keyboard open → sheet content scrolls, primary stays reachable. The deactivate warning stays above the buttons, never scrolled off by the keyboard (buttons are sticky in the sheet).
- «Додати посаду» in the page header is hidden below `md` (the sticky button replaces it); the header entry «Довідник посад» on the «Вакансії» page is h 44.

## 3. States

| State                                  | Presentation                                                                                                                                                                                                                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading (> 150 ms, `skeleton-delayed`) | Heading, subtitle and filter row render at once with final geometry; card body = `role="status"` + `sr-only` «Завантаження…»; desktop: 2 band skeletons + 5 rows `h-12`; mobile: 3 card skeletons `h-32`; no layout jump on resolve; no shimmer                                     |
| Initial empty (no positions in scope)  | `EmptyState` icon `list-checks`, «Посад ще немає» · «Додайте першу посаду — її можна буде обрати у вакансії.» · [Додати посаду] (also the only create CTA; page-header button hidden while empty, as verticals). Vertical selected: title «У вертикалі «{vertical}» посад ще немає» |
| Empty group (grouped view)             | Band + muted row «У цій вертикалі посад ще немає.» + text button «Додати посаду» (vertical preset)                                                                                                                                                                                  |
| All positions inactive, toggle off     | `EmptyState` «Активних посад немає» · «Усі посади тут неактивні. Покажіть їх, щоб повернути потрібну.» · [Показати неактивні] (sets `inactive=1`, focus → toggle row)                                                                                                               |
| Error                                  | `SectionError` inside the card with «Спробувати ще раз» (`retrying` while fetching); filter row stays usable. Error on background refetch with data on screen: list kept, `SectionError` below it (as vacancy list)                                                                 |
| Mutation errors                        | 400 → field error; 409 name → §1.3; 409 stale → §1.3; 403 → toast `forbidden`; 404 on write (position gone / scope lost) → toast `notFound`, dialog closes, refetch; network/5xx → toast `saveFailed`, dialog stays with typed value                                                |
| Pending row                            | Row buttons `disabled` + `aria-busy` on that row only (shared `mutationKey ['positions', id]`); rest of list stays interactive                                                                                                                                                      |
| Long data                              | 77-char Ukrainian name, long vertical name, `Нова посада` with 80 chars wrap whole words; buttons never push the row beyond card width; no page-level horizontal scroll at 390                                                                                                      |
| Non-manager / Finance                  | Existing 404 page, recovery link «На головну»                                                                                                                                                                                                                                       |

## 4. Components

| Component                                                                                                      | Source                                                                        | Status                       |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------- |
| PageHeader, EmptyState, SectionError, NotFoundState, Card, Button, Input, Label, Skeleton, Dialog, AlertDialog | `components/shell`, `components/states`, `components/ui`                      | exist                        |
| FilterSelect (labelled native select)                                                                          | now local in `vacancies-view.tsx`                                             | extract to `components/ui`   |
| PositionStatusChip (Активна / Неактивна)                                                                       | custom, styles as `VacancyStatus` (`vacancy-badges.tsx`)                      | new, `components/positions/` |
| PositionNameDialog (create + rename, vertical field optional)                                                  | copy of `VerticalNameDialog` structure                                        | new                          |
| DeactivatePositionDialog (AlertDialog + open-vacancies Alert)                                                  | custom on `alert-dialog.tsx`                                                  | new                          |
| Inline Alert (warning)                                                                                         | styles only (`--warning-subtle`); full shadcn `Alert` is "add" in the DS list | new/inline                   |
| `toast`                                                                                                        | `lib/toast`                                                                   | exists                       |

No Tooltip/DisabledReason, Table/Virtual or Popover needed (≤ 500 rows, semantic `<table>` on md+, `<ul>` cards below, as verticals).

## 5. Accessibility and focus

| Topic          | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structure      | `h1` title; bands are `h2`; table `th scope="col"`, name cell `th scope="row"`; action column header `sr-only` «Дії»; list wrapped in `section aria-label` «Список посад»; mobile `<ul>`/`<li>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Labels         | Every control has a visible label (select, checkbox, inputs). Icon-only buttons carry `aria-label` with the position name («Перейменувати: {name}», «Деактивувати: {name}», «Активувати: {name}»)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Status         | Dot + text, never colour alone; warning Alert has icon + text; contrast AA in both themes (tokens §1.3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Targets        | Mobile ≥ 44 (buttons, select, checkbox row, back link, sticky CTA); desktop ≥ 32                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Keyboard       | Tab order: back link → «Додати посаду» → select → checkbox → row buttons (rename, deactivate/activate) in DOM order. Enter submits dialogs; Esc closes (blocked while pending); AlertDialog default focus = «Скасувати». No row-click target, so no nested-interactive problem                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Errors         | Field errors linked by `aria-describedby`, `role="alert"` for server-returned ones; stale/forbidden Alerts `role="alert"`; list count line and toasts `role="status"` (polite)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Focus on close | Cancel / Esc / × → the control that opened the dialog (create → «Додати посаду» or the group's text button; row dialogs → that row's button). Create success → the new row's name cell (`tabindex="-1"`, programmatic focus; also announced by the toast). Rename success → that row's «Перейменувати» (key = id, survives re-sort). Deactivate success: toggle on → same row's button (now «Активувати»); toggle off → next row's first button, else previous row's, else the empty state heading. Reactivate → same button (now «Деактивувати»). Stale/pending errors keep focus inside the dialog on the first invalid field or the Alert. «Показати неактивні» from the empty state → focus the toggle |
| Motion         | `prefers-reduced-motion` honoured; no animation in screenshot mode                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Text           | Whole-word wrapping, `lang="uk"`, apostrophe `ʼ`; test strings: 77-char name, «Керівник напряму з пошуку та залучення персоналу», «Перейменувати» / «Деактивувати» at 390                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## 6. Copy — proposal for `messages/uk.json` → `positions`

Reuse (do not duplicate): `settings.common.{cancel,saving,charCounter}`, `common.close`, `states.loading`, `settings.common.mfaVerify`. The entry link label is `vacancies.positionsEntry` (the vacancy list shell carries it; `positions.*` loads only on the catalog route). Glossary term: UI says «Посада» (glossary «Position → Посада»).

```json
"positions": {
  "metaTitle": "Довідник посад",
  "title": "Довідник посад",
  "subtitle": "Посади, які можна обрати у вакансіях",
  "subtitleVertical": "Посади вертикалі «{vertical}», які можна обрати у вакансіях",
  "backToVacancies": "Вакансії",
  "create": "Додати посаду",
  "filtersLabel": "Фільтри довідника",
  "filterVertical": "Вертикаль",
  "allVerticals": "Усі вертикалі",
  "showInactive": "Показати неактивні",
  "listLabel": "Список посад",
  "columns": {
    "name": "Назва",
    "status": "Статус",
    "openVacancies": "Відкриті вакансії",
    "createdAt": "Створено",
    "actions": "Дії"
  },
  "status": { "active": "Активна", "inactive": "Неактивна" },
  "openVacanciesLine": "Відкриті вакансії: {count}",
  "openVacanciesUnknown": "—",
  "createdDate": "{at, date, ::dd.MM.yyyy}",
  "createdOn": "Створено {at, date, ::dd.MM.yyyy}",
  "shown": "{count, plural, one {Показано # посаду} few {Показано # посади} many {Показано # посад} other {Показано # посади}}",
  "groupCount": "{count, plural, one {# посада} few {# посади} many {# посад} other {# посади}}",
  "groupEmpty": "У цій вертикалі посад ще немає.",
  "groupAdd": "Додати посаду",
  "groupAddLabel": "Додати посаду у вертикалі «{vertical}»",
  "rename": "Перейменувати",
  "renameLabel": "Перейменувати: {name}",
  "deactivate": "Деактивувати",
  "deactivateLabel": "Деактивувати: {name}",
  "reactivate": "Активувати",
  "reactivateLabel": "Активувати: {name}",
  "permanentNote": "Посади не видаляються. Неактивну посаду можна повернути, а її назва лишається зайнятою.",
  "empty": {
    "title": "Посад ще немає",
    "description": "Додайте першу посаду — її можна буде обрати у вакансії."
  },
  "emptyVertical": {
    "title": "У вертикалі «{vertical}» посад ще немає",
    "description": "Додайте першу посаду — її можна буде обрати у вакансії."
  },
  "emptyActive": {
    "title": "Активних посад немає",
    "description": "Усі посади тут неактивні. Покажіть їх, щоб повернути потрібну.",
    "action": "Показати неактивні"
  },
  "dialog": {
    "createTitle": "Нова посада",
    "renameTitle": "Перейменувати посаду",
    "currentName": "Поточна назва: {name}",
    "verticalLabel": "Вертикаль",
    "verticalPlaceholder": "Оберіть вертикаль",
    "nameLabel": "Назва",
    "nameHint": "Від 2 до 80 символів. Регістр не враховується, назва унікальна в межах вертикалі.",
    "renameNote": "Нова назва одразу зʼявиться у вакансіях і фільтрах. Стара залишиться в історії.",
    "createSubmit": "Додати",
    "renameSubmit": "Перейменувати",
    "errors": {
      "verticalRequired": "Оберіть вертикаль.",
      "required": "Введіть назву.",
      "tooShort": "Щонайменше 2 символи.",
      "tooLong": "Не більше 80 символів.",
      "invalid": "Назва містить недопустимі символи.",
      "duplicate": "Посада з такою назвою вже є; неактивна посада резервує назву.",
      "duplicateInactive": "Посада «{name}» вже є, але неактивна. Активуйте її в списку.",
      "unchanged": "Назва не змінилася."
    }
  },
  "deactivateDialog": {
    "title": "Деактивувати посаду: {name}?",
    "description": "Посада перестане пропонуватися в нових вакансіях. Наявні вакансії, кандидати й історія не зміняться.",
    "openWarning": "{count, plural, one {За цією посадою є # відкрита вакансія} few {За цією посадою є # відкриті вакансії} many {За цією посадою є # відкритих вакансій} other {За цією посадою є # відкрита вакансія}}. Вони працюватимуть як раніше, але нову вакансію з цією посадою створити не вдасться.",
    "reversible": "Посаду можна активувати знову будь-коли. Її назва залишається зайнятою.",
    "submit": "Деактивувати"
  },
  "toast": {
    "created": "Посаду «{name}» створено",
    "renamed": "Посаду перейменовано: «{from}» → «{to}»",
    "deactivated": "Посаду «{name}» деактивовано. Її можна повернути через «Показати неактивні».",
    "reactivated": "Посаду «{name}» знову активна",
    "alreadyInactive": "Посада вже неактивна.",
    "alreadyActive": "Посада вже активна."
  },
  "errors": {
    "stale": "Посаду щойно змінили. Ми оновили дані — перевірте й повторіть.",
    "forbidden": "Недостатньо прав для цієї дії.",
    "notFound": "Посаду не знайдено — можливо, доступ змінився. Ми оновили список.",
    "saveFailed": "Не вдалося зберегти. Спробуйте ще раз.",
    "rolledBack": "Зміну не збережено — повернули як було.",
    "mfaRequired": "Підтвердьте вхід кодом 2FA, щоб керувати довідником."
  }
}
```

Plural check: `other` for fractional counts is unreachable (integers) but required by ICU; `openWarning.other` repeats the singular form deliberately.
Audit viewer labels (engineering T2, `settings.audit.actions`): «Створено посаду», «Перейменовано посаду», «Деактивовано посаду», «Активовано посаду»; action group «Посади».

## 7. Screenshot matrix for QA (`<NN>-<role>-positions-<state>-<viewport>-<theme>.png`)

Roles: **Admin** (sees Гемблінг + Крипто → grouped, filter, vertical field), **Head Recruiter** (`head.recruiter.gambling@demo`, one vertical → flat list, no filter, no vertical field). Viewports/themes: D = desktop 1440×900, M = mobile 390×844; L/Dk = light/dark. «×4» = D-L, D-Dk, M-L, M-Dk.

Fixture needs (seeded Ukrainian data, fixed clock): Гемблінг ≥ 5 positions incl. «Медіабаєр — Facebook» with 2 open vacancies, one with 0 vacancies, one inactive, one 77-char name «Старший спеціаліст із закупівлі трафіку та масштабування кампаній Facebook Ads»; Крипто ≥ 2 positions incl. one inactive. The empty states need a vertical without positions (test-only vertical or API-fixture) — not in the default seed.

| #   | State                                                                       | Admin         | Head Recruiter | Notes                                                            |
| --- | --------------------------------------------------------------------------- | ------------- | -------------- | ---------------------------------------------------------------- |
| 01  | List, default (Admin grouped «Усі вертикалі»; HR flat)                      | ×4            | ×4             | Includes the long name                                           |
| 02  | List, one vertical selected (flat, subtitle with vertical)                  | ×4            | —              | HR has no selector                                               |
| 03  | List, «Показати неактивні» on                                               | ×4            | ×4             | Inactive chip + «Активувати»                                     |
| 04  | Loading skeleton                                                            | ×4            | D-L, M-L       | Held with a delayed API                                          |
| 05  | Initial empty (no positions)                                                | ×4            | D-L, M-L       |                                                                  |
| 06  | Empty group inside grouped view                                             | ×4            | —              |                                                                  |
| 07  | All inactive, toggle off                                                    | D-L, M-Dk     | D-L, M-Dk      |                                                                  |
| 08  | List error + retry                                                          | ×4            | D-L, M-L       |                                                                  |
| 09  | Create dialog, blank                                                        | ×4            | ×4             | Admin shows vertical select; HR does not (mobile = bottom sheet) |
| 10  | Create dialog, validation (1 char / 81 chars / empty vertical)              | D-L, M-Dk     | D-L, M-Dk      |                                                                  |
| 11  | Create dialog, duplicate 409 (active name)                                  | ×4            | ×4             | Message from §6                                                  |
| 12  | Create dialog, duplicate with inactive match                                | D-L, M-Dk     | D-L            | `duplicateInactive` variant                                      |
| 13  | Rename dialog (prefilled, text selected)                                    | ×4            | D-L, M-Dk      |                                                                  |
| 14  | Rename dialog, unchanged hint / stale-version Alert                         | D-L, M-L      | D-L            | Two images                                                       |
| 15  | Deactivate confirm, position without open vacancies                         | D-L, M-Dk     | D-L, M-Dk      |                                                                  |
| 16  | Deactivate confirm, with open-vacancies warning (count 2)                   | ×4            | ×4             | Check warning contrast in dark                                   |
| 17  | After create / deactivate: toast + focus ring on the target element         | D-L, M-L      | D-L            | Focus visible                                                    |
| 18  | Long data: 77-char name + 80-char new name in dialog, 390 px overflow check | M-L, M-Dk     | M-L            | No horizontal scroll (assert `scrollWidth <= clientWidth`)       |
| 19  | «Вакансії» header with «Довідник посад» entry                               | D-L, M-L      | D-L, M-L       | Plus the same header without the button for Recruiter (D-L)      |
| 20  | 404 on `/vacancies/positions` — Recruiter, Finance                          | D-L, M-L each | —              | Role-denial evidence                                             |
| 21  | Admin aal1 → MFA redirect / Alert                                           | D-L           | —              |                                                                  |

E2E assertions paired with the gallery: keyboard-only create → duplicate → rename → deactivate → reactivate; focus targets from §5; 44 px target measurement at native 390×844; row count text; filter + toggle URL restore on reload and Back.

## 8. Open UX questions

1. Resolved by the owner (2026-11-09): «Відкриті вакансії» counts only status OPEN; no count footnote.
2. Copy term: the requested duplicate message said «Позиція…»; the glossary fixes «Посада», so §6 uses «Посада з такою назвою вже є; неактивна посада резервує назву.» If the literal «Позиція» wording is required, change `dialog.errors.duplicate` and add a glossary exception.
