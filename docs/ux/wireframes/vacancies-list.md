# Wireframe — Вакансії (list + preview panel) [VAC-01..04, BONUS-16, D1, D19]

Reference: `reference/03-vacancies.webp`. Adoption: A-13, A-14, A-15, A-21, A-30, A-31, A-32.

Current first read increment: [`../phase-2-vacancies.md`](../phase-2-vacancies.md). The full target below includes later vacancy/candidate/bonus features; render their controls only with working data and actions.

## Desktop 1440 — Head Recruiter, light

```
┌ shell ───────────────────────────────────────────────────────────────────────────────────────────────┐
│ Вакансії                                                                       [+ Створити вакансію] │
│ Усі відкриті та закриті вакансії вашої команди                                                       │
│ [Вертикаль ▾] [Статус ▾] [Тімлід ▾] [Рекрутер ▾] [📅 Період] [Терміновість ▾]                            │
│ (Усі 24) (● Відкриті 8) (● Чернетки 4) (● Призупинені 3) (● Заповнені 9) (● Скасовані 0)  [×]         │
│ ┌ table (8/12) ───────────────────────────────────────────────────────────┐┌ preview (360) ─────────┐│
│ │☐ Назва вакансії  Вертикаль  Тімлід Рекрутери Статус  Воронка Найнято Відкрита Остання ⋯││ Медіабаєр — Facebook ⋯ ││
│ │☐ Медіабаєр —    (Гемблінг)  (ВП)  (ОК)(ДЛ)+2 ● Відкрита ▬▬▭  0 з 2  12 дн. Сьогодні,⋯││ (● Відкрита)[Термінова]││
│ │  Facebook [Термінова]                                   14:30    ││ (Middle)(Віддалено)    ││
│ │  Middle                                                          ││ [Огляд][Кандидати 14][Історія]││
│ │☐ Affiliate      (Крипто)    (ТК)  (ОК)+1   ● Призупинена ▬▭ 1 з 3 25 дн. Вчора ⋯ ││ Команда                ││
│ │  Manager [З бота]                                                ││ Тімлід                 ││
│ │  Middle                                                          ││ (ВП) Василь Петренко   ││
│ │ … rows h 56, selected row = --primary-subtle bg + 2 px left --brand bar           ││      Тімлід · Гемблінг · П0││
│ │                                                                  ││ Рекрутери (ОК)(ДЛ)+2 [+]││
│ │                                                                  ││ ┌🎁 Винагорода рекрутеру┐││
│ │                                                                  ││ │ 1 000 $   [Змінити]  │││
│ │                                                                  ││ │ 30 % на старті ВТ,   │││
│ │                                                                  ││ │ 70 % після ВТ        │││
│ │                                                                  ││ └──────────────────────┘││
│ │                                                                  ││ Міні-воронка · 14      ││
│ │                                                                  ││ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ (bars)  ││
│ │                                                                  ││ 3 5 4 3 2 1 1 0        ││
│ │                                                                  ││ Деталі вакансії        ││
│ │                                                                  ││ Відкрита 12 дн. (з 22.10.2026)││
│ │                                                                  ││ Терміновість Термінова ││
│ │                                                                  ││ Формат     Віддалено   ││
│ │                                                                  ││ Зайнятість Повна       ││
│ │ Показано 1–25 з 24 вакансій        [‹] [›]       [25 на сторінці ▾]││ Остання активність     ││
│ └──────────────────────────────────────────────────────────────────┘│ (ОК) змінила етап…     ││
│                                                                     └────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Status column = VAC-02 status only** (A-14). «Термінова» / «З бота» are badges next to the title.
- **Voronka cell:** FunnelMini `bar` (stacked segments, visible applications only, D19); hover/focus shows counts per stage.
- **Row interactions:** click selects the row → panel; Enter / title link → S-06; ⋯ → Відкрити · Редагувати · Клонувати · Призупинити/Відкрити · Видалити (separated, red). No «Архівувати» (A-35).
- **Panel tabs:** Огляд (above) · Кандидати (compact list with StageChip) · Історія (vacancy timeline). Panel closes with × or Esc; it is sticky (own scroll).
- **Recruiter reward block (BONUS-16):** Admin sees «Змінити» (disabled + reason «Наступна зміна можлива з 15.01.2027»); recruiters of the vacancy and HRec see it read-only; TL/HR do not see the block.
- **Pagination (A-21):** total + cursor ‹ › + page size 25/50/100.

## Role differences

Same as `screens.md` S-04. Recruiter: unassigned rows show «Взяти в роботу» inline. TL: «Тімлід» column hidden, only own vacancies, «Запросити вакансію». HHR/HR: no checkboxes, no create, panel read-only.

## Mobile 390

```
┌──────────────────────────────┐
│ Вакансії            [Усі 24 ▾]│
│ (● Відкриті 8)(● Чернетки 4) →│
│ ┌──────────────────────────┐ │
│ │[▣] Медіабаєр — Facebook ⋯│ │
│ │ Middle · Гемблінг        │ │
│ │ (● Відкрита) 0 з 2  12 дн.│ │
│ └──────────────────────────┘ │
│ … cards …                    │
│ [   + Створити вакансію    ] │  sticky 48 px above bottom nav
├──────────────────────────────┤
│ bottom nav                   │
└──────────────────────────────┘
```

Tap a card → S-06 (no preview panel).

## States

- Loading: filter bar real, chips skeleton, 10 rows skeleton, panel skeleton (header + 4 blocks).
- Empty: «Відкритих вакансій немає» + «Створити вакансію» (if allowed; TL «Запросити вакансію»); panel hidden.
- Filtered empty: «Нічого не знайдено за фільтрами» [Скинути фільтри].
- No row selected: panel shows the first row; on narrow screens (< 1280) the panel becomes a Sheet.
- Error: table-level SectionError; panel error separate.

## Терміновість (VAC-08-2, VAC-04-4)

Scope of this file: how urgency **looks** in the list, the preview panel and the filter. The control that changes it, the history wording, toasts and conflicts are in [`vacancy-card.md`](vacancy-card.md) → «Терміновість (VAC-08-2, VAC-04-4)». Decisions D94, D97, D99, D127 (urgency changes only on `OPEN`/`ON_HOLD`; the Team Lead priority override is Phase 3 and is not shown anywhere in the list or preview). Skills applied: `emil-design-eng` (frequency gate, no decorative motion), `animate` (gate result: no animation).

### 1. One rule, one component

`isUrgentHighlighted(vacancy)` (already in `vacancy-badges.tsx`) is the only condition: `priority = URGENT` and status ∈ `DRAFT`, `OPEN`, `ON_HOLD`. Every surface (table row, mobile card, preview header, card header, future pickers and kanban header) calls it. The label «Термінова» is shown for every urgent vacancy, also when closed; only the red styling depends on status (D99). Closed = `FILLED` or `CANCELLED` only, never dates.

| State of the vacancy                       | Surface                                                                       | Badge                                          | Edge   |
| ------------------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------- | ------ |
| Звичайна (any status)                      | plain                                                                         | none                                           | none   |
| Термінова, `OPEN` / `ON_HOLD` / `DRAFT`    | tinted `--destructive-subtle`                                                 | red outline badge, flame, «Термінова»          | 3 px `--destructive` |
| Термінова, `FILLED` / `CANCELLED`          | plain (no tint)                                                               | neutral badge, flame, «Термінова», tooltip     | none   |

An urgent `ON_HOLD` row keeps the tint and shows the amber «Призупинена» status badge next to the red badge (different icon: status has a dot, urgency has a flame). An urgent `DRAFT` row keeps the dashed «Чернетка» badge (only its author sees it, D92).

### 2. Tokens (exact)

New derived token, added to `design-system.md` §1.2: `--destructive-subtle-hover` = light `#FCE8E8`, dark `#471E24` (tint mixed 5 % / 8 % towards `--destructive`). Everything else already exists.

| Part                                   | Light                                                              | Dark                                                              |
| -------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Urgent row / card / header background  | `--destructive-subtle` `#FEF2F2`                                   | `--destructive-subtle` `#3A1D24`                                  |
| Hover and `:active` (touch)            | `--destructive-subtle-hover` `#FCE8E8`                             | `--destructive-subtle-hover` `#471E24`                            |
| Selected row (preview open)            | `--primary-subtle` bg + 2 px `--brand` bar **and** the 3 px red edge: `shadow-[inset_3px_0_0_var(--destructive),inset_5px_0_0_var(--brand)]` | same tokens                          |
| Accent edge                            | 3 px inset `--destructive` `#DC2626` (existing `urgentEdge`)       | same                                                              |
| Title                                  | `--foreground` (unchanged: never red, so long titles stay readable) | `--foreground`                                                    |
| Secondary text in an urgent row (number, dates, team lead name) | row sets `--muted-foreground: var(--muted-foreground-strong)` `#475569` | `#94A3B8` (strong = muted in dark)                                |
| Urgency badge                          | `Badge tone="danger" outline`: bg `--destructive-subtle`, text + flame `--error-text` `#B91C1C`, border `--destructive` | text + flame `#F87171`, border `#DC2626` |
| Closed urgent badge                    | `Badge tone="neutral"` (`--surface-muted` bg, `--muted-foreground-strong` text), flame | same tokens                                                    |
| Preview / card header block            | `rounded-lg p-4 bg-destructive-subtle` + 3 px inset red edge; eyebrow `--muted-foreground-strong`; action buttons sit **below** the block, outside the tint | same |

Why outline on the badge: on a row already tinted with `--destructive-subtle` a plain `danger` badge has the same fill and would vanish; the border keeps its shape on tint, white, `--primary-subtle` (selected) and hover.

### 3. Contrast (WCAG 2.1 AA, relative luminance, checked 2026-11-17)

| Pair                                                               | Light            | Dark             | Need  |
| ------------------------------------------------------------------ | ---------------- | ---------------- | ----- |
| `--foreground` on urgent bg                                        | 16.3 (`#0F172A` / `#FEF2F2`) | 14.5 (`#F8FAFC` / `#3A1D24`) | 4.5 |
| `--foreground` on urgent hover                                     | 15.2             | 13.6             | 4.5   |
| `--error-text` on urgent bg (badge text, flame)                    | 5.91             | 5.50             | 4.5   |
| `--error-text` on urgent hover                                     | 5.50             | 5.13             | 4.5   |
| `--error-text` on `--primary-subtle` (selected row, badge is bordered) | 5.79         | 5.03             | 4.5   |
| `--muted-foreground-strong` on urgent bg / hover                   | 6.93 / 6.44      | 5.93 / 5.54 (`#94A3B8`) | 4.5 |
| `--muted-foreground` `#5B6B82` on urgent bg (why the row overrides it) | 4.96 (hover 4.61) | 5.93         | 4.5 (passes, thin) |
| `--destructive` edge / badge border on urgent bg                   | 4.42             | 3.15             | 3 (1.4.11) |
| `--destructive` border on white / `--surface` (preview, header)    | 4.83             | 3.67             | 3     |
| `--link` `#5558EF` on urgent bg (inline links, if any)             | 4.76             | n/a (`#818CF8` on `#3A1D24` = 5.09) | 4.5 |

All pass. QA repeats the numbers with axe `color-contrast` on the screenshot states below, including hover and selected.

### 4. Not colour alone (1.4.1)

1. Visible text «Термінова» + flame icon in every urgent row, card, panel and header (closed ones too).
2. Shape cues: 3 px edge on the row (decorative duplicate of the badge, so forced-colours mode losing the `box-shadow` costs nothing; the badge border is kept by forced colours).
3. Screen readers read «Термінова» in reading order after the title link; no extra `aria-label`, no `role="img"` on the flame (`aria-hidden`).
4. Hover, selected and urgent are three different signals: hover = whole row one step darker (same hue), selected = indigo fill + indigo bar, urgent = red tint + red edge. Selected-and-urgent shows both bars.
5. The closed neutral badge carries `title` «Вакансію закрито — червоне виділення вимкнено.» (desktop hover/focus on the badge; on touch the card header shows the same sentence as a muted line, see card file §3).

### 5. Wireframes

**Desktop 1440, Head Recruiter, light** (columns trimmed; `▌` = 3 px red edge, `░` = tint)

```
┌ table ───────────────────────────────────────────────────────────────────────────────────────────────┐
│ Назва вакансії                              Вертикаль  Тімлід  Статус        Відкрита з              │
│▌░ Медіабаєр — Facebook  (🔥 Термінова)       Гемблінг   (ВП)    ● Відкрита   22.10.2026            ⋯ ▢│
│▌░ V-0007                                                                                           │
│▌░ Affiliate Manager  (🔥 Термінова)          Крипто     (ТК)    ● Призупинена  05.10.2026          ⋯ ▢│  red tint + amber status
│▌░ V-0012                                                                                           │
│▌░ Тімлід напряму  (┄ Чернетка ┄)(🔥 Термінова) Гемблінг  —      Ще не відкривалась                 ⋯ ▢│  own draft, red
│   Медіабаєр — TikTok  (🔥 Термінова)          Гемблінг   (ВП)    ● Заповнена  01.09.2026            ▢ │  NEUTRAL: no tint, no edge
│   V-0003                                                                                            │
│   Сапорт 24/7                                  Гемблінг   (ВП)    ● Відкрита   12.10.2026            ▢ │  Звичайна: plain
│   V-0009                                                                                            │
│▌▌ Медіабаєр — Facebook (selected + urgent)… selected = --primary-subtle fill, red 3 px + indigo 2 px │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
preview 360 (selected urgent OPEN row)
┌──────────────────────────────────┐
│ ┃░ V-0007 · Гемблінг            ░│  header block: --destructive-subtle, red edge, radius 8
│ ┃░ Медіабаєр — Facebook         ░│
│ ┃░ (● Відкрита)(🔥 Термінова)   ░│
│ [Відкрити картку] [Поділитися]   │  actions outside the tint
│ Терміновість вакансії            │  section from the card file §1: only for Head Recruiter/Admin on OPEN/ON_HOLD
│ (Звичайна)(Термінова)            │
│ Команда … Умови … (existing)     │
└──────────────────────────────────┘
```

**Filter** (`FilterBar`, new select after «Період»): label «Терміновість»; options «Усі» (default, not shown as a chip), «Термінова», «Звичайна»; active → chip «Терміновість: Термінова ×»; URL `urgency=URGENT|NORMAL`. «Термінова» keeps the selected status chip: with «Усі» it lists red rows (`DRAFT`/`OPEN`/`ON_HOLD`) and neutral rows (closed) together; with «Заповнені» every row is neutral. «Скинути фільтри» also clears it. The old «Пріоритет» label is removed everywhere (glossary).

**Mobile 390 (Recruiter, light)** — card `li`, full-bleed in the list

```
┌──────────────────────────────┐
│▌░ Медіабаєр — Facebook       │  title pr-11 only when the row has ⋯ (existing hasRowMenu)
│▌░ V-0007 · Гемблінг          │
│▌░ (● Відкрита) (🔥 Термінова)│  badges wrap under the title, never hide
│▌░ Тімлід  Василь Петренко    │
│▌░ Відкрита з 22.10.2026      │
├──────────────────────────────┤  divide-y --border
│▌░ Affiliate Manager          │
│▌░ (● Призупинена)(🔥 Термінова)│
├──────────────────────────────┤
│   Медіабаєр — TikTok         │  FILLED + urgent: plain card
│   (● Заповнена)(🔥 Термінова)│  neutral badge
├──────────────────────────────┤
│   Сапорт 24/7 …              │
└──────────────────────────────┘
```

The whole card stays one tap target (existing `after:absolute after:inset-0` link); `:active` = hover token. Touch has no hover tooltip: the neutral badge text alone is the cue, the reason line is on the card header.

### 6. States and live changes

| State                                | Behaviour                                                                                                                                                                                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading                              | Unchanged `RowSkeleton` (urgency is unknown, so skeleton rows are never tinted). Tint, edge and badge change no row geometry except one wrapped badge line, accepted because they arrive with the data.                          |
| Empty / filtered empty               | «Нічого не знайдено за фільтрами» + «Скинути фільтри»; with `urgency=URGENT` and no hits the description adds nothing about hidden vacancies (no count leak).                                                                       |
| Error                                | Unchanged `SectionError`; urgency never shows from stale data once the query errors.                                                                                                                                              |
| Urgency changes in another tab / by another user | Background refetch repaints row, panel header and chip filter at once. **No animation** (§8.3: list refresh, status chip change). No toast and no live announcement for changes the user did not make.        |
| Own change from the card/preview     | Optimistic: row and header repaint in the same frame as the click (< 100 ms), rolled back on failure (card file §4).                                                                                                              |
| Status flip `OPEN → FILLED/CANCELLED` | Tint and edge vanish immediately, badge turns neutral; reopening returns the red. Stored urgency never changes with status.                                                                                                      |
| Filter «Термінова» and the row stops matching after an own change to «Звичайна» | The row stays until the next refetch (no jumping list under the cursor); the list refetches in the background after the mutation settles and the row leaves then. |

### 7. Worst-case data (break-ui)

| Case                                                                                  | Expected                                                                                             |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 200-char title and an unbreakable 80-char word, urgent                                | Title wraps with `overflow-wrap:anywhere`; badge wraps below (`flex-wrap`), edge never under text (cell padding 16 px ≥ 3 px); mobile `pr-11` keeps `⋯` clear |
| 25 of 25 rows urgent                                                                  | Every row tinted and edged; accepted, no cap. If the owner finds it too loud, soften the tint, not the rule (see question in the handoff) |
| Urgent + `ON_HOLD` + «З бота» + long tag in one title cell                            | Four badges wrap onto two lines at 390; none truncated                                               |
| Urgent + selected + hover + keyboard focus on the title link                          | Four signals stay distinct: focus ring `--ring` 2 px outline (unchanged), indigo fill, indigo+red bars, hover token on the unselected state only (selected keeps its fill) |
| Dark theme, 320 px, 200 % zoom                                                        | Contrast table holds; badge border 3.15:1 minimum; no horizontal scroll                             |
| Urgent vacancy of a vertical the user cannot read                                     | Not in the response: no row, no count, no chip number; `urgency=URGENT` filter cannot reveal it      |
| Forced colours                                                                        | Tint and edge disappear; text «Термінова» + badge border remain                                      |

### 8. Screenshots (D125 lean matrix; `screenshots/phase-2/NN-<role>-vacancies-urgent-<state>-<viewport>-<theme>.png`)

| #  | Role            | State                                                                                                                              | Viewport | Theme |
| -- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| L1 | Head Recruiter  | List, `Усі` + «Чернетки» excluded: urgent `OPEN`, urgent `ON_HOLD`, urgent `FILLED` (neutral), urgent `CANCELLED` (neutral), a Звичайна row; one urgent row selected, panel header tinted | 1440     | light |
| L2 | Head Recruiter  | Same screen (one dark capture)                                                                                                    | 1440     | dark  |
| L3 | Admin           | Filter «Терміновість: Термінова» with chip, status «Усі» (own urgent draft red, closed neutral)                                    | 1440     | light |
| L4 | Recruiter       | Mobile list: urgent `OPEN`, urgent `ON_HOLD`, urgent `FILLED` neutral, Звичайна                                                    | 390      | light |
| L5 | Recruiter       | Same mobile list (one dark capture)                                                                                               | 390      | dark  |

Everything else is an E2E assertion, not a PNG: hover/selected tint tokens via computed style, closed-neutral rule per status (5 statuses × urgent), long-title overflow at 320 px, 25-urgent list, forced-colours, no leak for foreign verticals, background refetch repaint, axe `color-contrast` on L1–L5. Seed per the story: one urgent `OPEN` per vertical, plus urgent `FILLED`, `CANCELLED`, `ON_HOLD`.
