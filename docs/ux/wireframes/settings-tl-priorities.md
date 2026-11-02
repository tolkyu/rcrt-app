# Wireframe — Налаштування › Пріоритети тімлідів (Admin) [ROUTE-01, ROUTE-02, ROUTE-07, ROUTE-09, D5]

## Phase 1 scope — build now [STORY-ROLE-01-3, ROUTE-01, D5, D47, D73]

Phase 1 = priority **data** only (no vacancies, no routing yet). Frame, tokens, states and a11y follow `settings-admin.md` §0, §7. Everything below "Phase 2–3 target" is **not** built now.

### P1.1 Decisions

| #   | Topic                             | Decision                                                                                                                                                                                                                                                                                                                                                                                      | Why (one line)                                                                                                                                                                                                                         |
| --- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Route / nav                       | `/settings/priorities`; SettingsNav order: Користувачі та ролі · Вертикалі · **Пріоритети тімлідів** · Журнал дій (as `settings-admin.md` §0). Item + route gated by `settings.priorities.manage` (GLOBAL, aal2); without it → nav hidden, route 404                                                                                                                                          | Priorities depend on verticals and roles, so they come after both                                                                                                                                                                      |
| 2   | Vertical tabs                     | Segmented Tabs, all verticals (Admin is global), uk collation order. `?vertical=<id>` in URL; missing/unknown id → first vertical, `router.replace`                                                                                                                                                                                                                                           | Shareable, survives reload, target for the drawer link                                                                                                                                                                                 |
| 3   | Who is listed                     | Users with an **active** TEAM_LEAD role in that vertical: `is_active = true` **and** `activated_at IS NOT NULL`. Deactivated users and invitees who haven't accepted are excluded; invitees shown only as a count line (`pendingInvites`)                                                                                                                                                     | Only people who can log in and work are routed; a new TL appears automatically in «Без пріоритету» (D47 safe default) after first login. Server applies the same rule: a batch targeting anyone else → 409 `STALE_STATE` (decision 12) |
| 4   | Order on screen                   | Group 1: prioritised, `priority asc`, ties by ПІБ (uk collation). Group 2 «Без пріоритету»: alphabetical                                                                                                                                                                                                                                                                                      | Matches D47; display tie order is cosmetic, real tie-break is oldest vacancy (D5)                                                                                                                                                      |
| 5   | Editing                           | Number field per row: text input `inputMode="numeric"`, integer **0–99**, ties allowed, **empty = не задано** (clearing allowed, D47). Re-sort on blur / `Enter`, never while typing; focus follows the row. `Esc` reverts the field to its value on focus                                                                                                                                    | Clearing has a defined meaning (D47); live re-sort while typing is disorienting                                                                                                                                                        |
| 6   | Reorder                           | `[↑][↓]` buttons + `Alt+↑/↓` anywhere in the row. A move **renumbers the prioritised group 0, 1, 2…** (breaks ties; ties only via typed numbers). `[↑]` on a «Без пріоритету» row moves it to the end of the prioritised group. `[↓]` disabled on the last prioritised row and on all unprioritised rows (DisabledReason)                                                                     | Predictable; arrows never silently clear a priority                                                                                                                                                                                    |
| 7   | Drag-and-drop                     | **No dnd-kit in Phase 1**                                                                                                                                                                                                                                                                                                                                                                     | 2–5 rows per vertical: field + arrows cover it; DnD adds bundle weight and a second a11y path for no gain                                                                                                                              |
| 8   | Badge                             | PriorityBadge «П{n}» (draft value) with tooltip «Пріоритет 0 — найвищий»; no priority → muted dashed badge «Пріоритет не задано». Changed row: 3 px `--primary` left bar + muted «було П1»                                                                                                                                                                                                    | Story AC badges + visible diff before saving                                                                                                                                                                                           |
| 9   | Tie hint                          | Every row whose value equals another row's: `text-xs` muted line «Рівний пріоритет — спершу найстаріша вакансія»                                                                                                                                                                                                                                                                              | D5                                                                                                                                                                                                                                     |
| 10  | Save model                        | Batched per vertical. Sticky footer «Незбережені зміни: N» + list «Name: from → to» (max 3, then «ще N») + [Скасувати] [Зберегти]. Footer only when dirty. Save disabled while any field invalid                                                                                                                                                                                              | One review point, one transaction                                                                                                                                                                                                      |
| 11  | Confirm dialog                    | **None in Phase 1.** The footer summary is the review; change is reversible and audited. (OPEN-P2 in-flight sentence returns with routing in Phase 3)                                                                                                                                                                                                                                         | Not destructive; double confirmation = friction                                                                                                                                                                                        |
| 12  | Concurrency                       | **Per-row versions** (table already has `version`; no per-vertical version). `PUT /api/v1/verticals/{id}/team-lead-priorities` body `{ changes: [{ userId, priority: int \| null, version: int \| null }] }`, `version: null` = row didn't exist. All-or-nothing transaction; any stale/unexpected row, or a user who is no longer an eligible TL → **409 `STALE_STATE`** for the whole batch | No schema change; same 409 pattern as roles (ADR-006)                                                                                                                                                                                  |
| 13  | 409 UX                            | Inline Alert (warning) above the list: «Пріоритети щойно змінив інший адміністратор.» + «Оновіть дані й повторіть свої зміни.» [Оновити]. Drafts stay visible until [Оновити] (refetch → drafts dropped, focus → first row). Background refetch while dirty never overwrites drafts                                                                                                           | Admin sees what they typed; no silent merge                                                                                                                                                                                            |
| 14  | Save error (5xx/network)          | Inline Alert (destructive) «Не вдалося зберегти. Спробуйте ще раз.» [Спробувати ще раз]; drafts kept                                                                                                                                                                                                                                                                                          | Never lose edits                                                                                                                                                                                                                       |
| 15  | Success                           | Save button «Зберігаємо…» (disabled), on 200 → server state replaces drafts, footer hides, toast «Пріоритети збережено · {vertical}»                                                                                                                                                                                                                                                          | —                                                                                                                                                                                                                                      |
| 16  | Unsaved + switching tab / leaving | Tab switch, SettingsNav or any in-app link while dirty → AlertDialog «Є незбережені зміни» [Залишитися] [Не зберігати]. In-app links: document capture-phase click guard on `a[href]`; reload/close: native `beforeunload`. Browser Back is not guarded                                                                                                                                       | Drafts are per vertical, not kept across tabs — simplest correct model                                                                                                                                                                 |
| 17  | History (D73)                     | One save → per changed TL: one `audit_log` row (action `vertical.tl_priority_changed`, entity = vertical, details `teamLead`, before/after `priority`) and one `entity_event` visible in **that TL's «Історія»**. Recommended: write the event with `subjectType: 'app_user'`, `subjectId: <TL>`, `verticalId: <vertical>` (payload `{userId, old, new}` already allows `null`)               | D73; same `requestId` groups one save                                                                                                                                                                                                  |
| 18  | Drawer link                       | Drawer «Пріоритет тімліда» block: each TL vertical line «Гемблінг: П0» / «Гемблінг: пріоритет не задано» + link «Змінити» → `/settings/priorities?vertical=<id>` (`aria-label` names the vertical). Replaces the single «Пріоритети тімлідів →» link in `settings-admin.md` §1.3                                                                                                              | Unambiguous when a TL has 2+ verticals                                                                                                                                                                                                 |
| 19  | Role removed / deactivated        | Removing TEAM_LEAD, including omission during reactivation, deletes that vertical's priority row in the same transaction and records old→null in the TL's history (D73). Deactivation keeps the priority row, but the user is not listed (rule 3)                                                                                                                                             | Confirmed in the owner's resume request; reassigning TEAM_LEAD starts without a priority                                                                                                                                               |
| 20  | Data / perf                       | RSC prefetch verticals + selected vertical → `HydrationBoundary`; query key `['settings','priorities',verticalId]`; one SQL query returns TLs + `pendingInvites` count; other tabs fetched on hover/focus of the tab                                                                                                                                                                          | PERF budgets; instant tab switch                                                                                                                                                                                                       |

### P1.2 Desktop 1440

```
┌ Налаштування ──────┐  Пріоритети тімлідів
│ ▢ Користувачі      │  Пріоритет 0 — найвищий. За ним система вирішує, якому тімліду першим
│   та ролі          │  передати нового кандидата. Якщо пріоритети рівні — спершу найстаріша вакансія.
│ ▢ Вертикалі        │
│ ▣ Пріоритети       │  [ Гемблінг | Крипто ]                                     ?vertical=<id>
│   тімлідів         │  ┌ Гемблінг · 4 тімліди ──────────────────────────────────────────────────┐
│ ▢ Журнал дій       │  │ Пріоритет   Тімлід                                          Порядок    │
└────────────────────┘  │  [ 0 ]      (ВП) Василь Петренко    (П0)                    [↑]░ [↓]   │
                        │ ▌[ 0 ]      (ТК) Тарас Коваль       (П0) було П1            [↑]  [↓]   │
                        │             Рівний пріоритет — спершу найстаріша вакансія              │
                        │  [ 1 ]      (МС) Марина Савчук      (П1)                    [↑]  [↓]░  │
                        │ ─ Без пріоритету · стоять у черзі після всіх тімлідів із пріоритетом ─ │
                        │  [   ]      (ІЛ) Ігор Литвин        (Пріоритет не задано)   [↑]  [↓]░  │
                        │                                                                        │
                        │ Стрілки перенумеровують пріоритети по порядку: 0, 1, 2… Щоб зробити    │
                        │ пріоритети рівними, введіть однакові числа. Порожнє поле — не задано.  │
                        │ Ще 1 тімлід очікує прийняття запрошення — зʼявиться тут після входу.   │
                        ├────────────────────────────────────────────────────────────────────────┤
                        │ Незбережені зміни: 1 · Тарас Коваль: П1 → П0   [Скасувати] [Зберегти]  │
                        └────────────────────────────────────────────────────────────────────────┘
```

- Card on `--surface`, radius 16; rows h 56; field w 64, centered digits, `aria-label` «Пріоритет: {name}»; arrow buttons ghost icon 36 (44 on touch), `aria-label` «Вище: {name}» / «Нижче: {name}».
- List = `<table>` with `<caption class="sr-only">` «Тімліди вертикалі «{vertical}» за пріоритетом»; group divider = `<tr>` with `<th colspan scope="rowgroup">`.
- Live region (`aria-live="polite"`) after a move / blur re-sort: «{name}: пріоритет {priority}, позиція {position} з {total}» or «{name}: пріоритет не задано». Focus stays on the pressed arrow; if it became disabled → the other arrow.
- Invalid field: `--danger` border + `aria-invalid` + message under the row «Ціле число від 0 до 99 або порожнє поле.»; Save disabled.
- Footer: `position: sticky; bottom: 0` inside the card; summary `aria-live="polite"`.

### P1.3 Mobile 390

```
┌ ‹ Налаштування ──────────────────┐
│ Пріоритети тімлідів               │
│ Пріоритет 0 — найвищий. За ним …  │
│ [ Гемблінг | Крипто ]  (h-scroll) │
│ ┌──────────────────────────────┐  │
│ │ (ВП) Василь Петренко   (П0)  │  │
│ │ Пріоритет [ 0 ]   [↑]░  [↓]  │  │
│ └──────────────────────────────┘  │
│ ┌──────────────────────────────┐  │
│ │▌(ТК) Тарас Коваль  (П0) було П1│ │
│ │ Рівний пріоритет — спершу    │  │
│ │ найстаріша вакансія          │  │
│ │ Пріоритет [ 0 ]   [↑]   [↓]  │  │
│ └──────────────────────────────┘  │
│ ── Без пріоритету ──              │
│ ┌──────────────────────────────┐  │
│ │ (ІЛ) Ігор Литвин             │  │
│ │ (Пріоритет не задано)        │  │
│ │ Пріоритет [   ]   [↑]   [↓]░ │  │
│ └──────────────────────────────┘  │
│┌ sticky above bottom nav ───────┐ │
││ Незбережені зміни: 1           │ │
││ [Скасувати]        [Зберегти]  │ │
│└────────────────────────────────┘ │
└───────────────────────────────────┘
```

- Cards, no table; field and arrows 44×44; names wrap (never ellipsis); footer buttons 50/50 full width; summary list collapsed to the count.

### P1.4 States

| State              | UI                                                                                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading            | Title + subtitle text, Tabs skeleton (2 pills), card with 3 skeleton rows of final height (field / avatar+name / 2 arrows)                                                                                                            |
| Load error         | `SectionError`: `states.errorTitle` / `states.errorDescription` + [Спробувати ще раз]                                                                                                                                                 |
| No verticals       | EmptyState «Вертикалей ще немає» · «Спершу створіть вертикаль і призначте в ній тімлідів.» · [Створити вертикаль] → `/settings/verticals`                                                                                             |
| No TLs in vertical | EmptyState «У вертикалі «{vertical}» ще немає тімлідів» · «Призначте роль «Тімлід» у розділі «Користувачі та ролі».» · [Перейти до користувачів] → `/settings/users?role=TEAM_LEAD&vertical=<id>`; `pendingInvites` line below if > 0 |
| Dirty              | Changed-row bar + «було …», sticky footer                                                                                                                                                                                             |
| Saving             | Save «Зберігаємо…» disabled, fields + arrows disabled, Cancel disabled                                                                                                                                                                |
| Save error         | Destructive Alert above list + retry; drafts kept                                                                                                                                                                                     |
| 409                | Warning Alert + [Оновити]; Save disabled until refreshed                                                                                                                                                                              |
| Leave while dirty  | AlertDialog (decision 16)                                                                                                                                                                                                             |

### P1.5 History lines

| Where                     | Rendering                                                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Журнал дій row            | Дія «Змінено пріоритет тімліда» · Обʼєкт «Вертикаль · Гемблінг»                                                                           |
| Журнал дій detail «Зміни» | Тімлід = Тарас Коваль · Пріоритет: Було «П1» → Стало «П0» (`null` → «не задано»)                                                          |
| TL drawer «Історія» (D73) | «Змінено пріоритет тімліда» + line «Гемблінг: П1 → П0» · actor · `dd.MM.yyyy HH:mm` (`null` → «не задано», e.g. «Крипто: не задано → П2») |

### P1.6 Strings (`messages/uk.json`)

Reused as-is: `settings.common.cancel` «Скасувати», `settings.common.saving` «Зберігаємо…», `settings.common.saveFailed`, `common.retry`, `states.errorTitle`, `states.errorDescription`, `common.roles.TEAM_LEAD`, `settings.users.drawer.priorityTitle|priorityValue|priorityNotSet`, `settings.audit.actions.vertical.tl_priority_changed`.

New keys:

```json
{
  "settings": {
    "nav": { "priorities": "Пріоритети тімлідів" },
    "priorities": {
      "metaTitle": "Пріоритети тімлідів",
      "title": "Пріоритети тімлідів",
      "subtitle": "Пріоритет 0 — найвищий. За ним система вирішує, якому тімліду першим передати нового кандидата. Якщо пріоритети рівні — спершу найстаріша вакансія.",
      "tabsLabel": "Вертикалі",
      "cardTitle": "{vertical} · {count, plural, one {# тімлід} few {# тімліди} many {# тімлідів} other {# тімліда}}",
      "caption": "Тімліди вертикалі «{vertical}» за пріоритетом",
      "columns": {
        "priority": "Пріоритет",
        "teamLead": "Тімлід",
        "order": "Порядок"
      },
      "fieldLabel": "Пріоритет: {name}",
      "badge": "П{priority}",
      "badgeHint": "Пріоритет 0 — найвищий",
      "notSet": "Пріоритет не задано",
      "notSetGroup": "Без пріоритету",
      "notSetGroupHint": "стоять у черзі після всіх тімлідів із пріоритетом",
      "notSetGroupLine": "{group} · {hint}",
      "valueShort": "П{priority}",
      "valueNone": "не задано",
      "was": "було {value}",
      "tieHint": "Рівний пріоритет — спершу найстаріша вакансія",
      "hint": "Стрілки перенумеровують пріоритети по порядку: 0, 1, 2… Щоб зробити пріоритети рівними, введіть однакові числа. Порожнє поле — не задано.",
      "pendingInvites": "{count, plural, one {Ще # тімлід очікує прийняття запрошення — зʼявиться тут після входу.} few {Ще # тімліди очікують прийняття запрошення — зʼявляться тут після входу.} many {Ще # тімлідів очікують прийняття запрошення — зʼявляться тут після входу.} other {Ще # тімліда очікують прийняття запрошення — зʼявляться тут після входу.}}",
      "moveUp": "Вище: {name}",
      "moveDown": "Нижче: {name}",
      "reasons": {
        "top": "Уже найвищий пріоритет.",
        "lastSet": "Щоб зняти пріоритет, очистіть поле.",
        "notSetNoOrder": "Тімліди без пріоритету не впорядковуються. Натисніть «Вище», щоб задати пріоритет."
      },
      "moved": "{name}: пріоритет {priority}, позиція {position} з {total}",
      "clearedLive": "{name}: пріоритет не задано",
      "invalid": "Ціле число від 0 до 99 або порожнє поле.",
      "unsaved": "Незбережені зміни: {count}",
      "unsavedItem": "{name}: {from} → {to}",
      "unsavedMore": "ще {count}",
      "save": "Зберегти",
      "toastSaved": "Пріоритети збережено · {vertical}",
      "conflictTitle": "Пріоритети щойно змінив інший адміністратор.",
      "conflictBody": "Оновіть дані й повторіть свої зміни.",
      "conflictAction": "Оновити",
      "leaveDialog": {
        "title": "Є незбережені зміни",
        "body": "Зміни пріоритетів у вертикалі «{vertical}» буде втрачено.",
        "stay": "Залишитися",
        "discard": "Не зберігати"
      },
      "empty": {
        "noVerticalsTitle": "Вертикалей ще немає",
        "noVerticalsDescription": "Спершу створіть вертикаль і призначте в ній тімлідів.",
        "noVerticalsAction": "Створити вертикаль",
        "noTeamLeadsTitle": "У вертикалі «{vertical}» ще немає тімлідів",
        "noTeamLeadsDescription": "Призначте роль «Тімлід» у розділі «Користувачі та ролі».",
        "noTeamLeadsAction": "Перейти до користувачів"
      }
    },
    "users": {
      "drawer": {
        "priorityEdit": "Змінити",
        "priorityEditLabel": "Змінити пріоритет у вертикалі «{vertical}»",
        "historyPriority": "{vertical}: {from} → {to}"
      }
    },
    "audit": {
      "fields": { "priority": "Пріоритет", "teamLead": "Тімлід" }
    }
  }
}
```

- `{from}` / `{to}` are formatted in code from `valueShort` / `valueNone` (no name declension anywhere — names only in the nominative before a colon).
- Fallback (only if the Tech Lead wants a confirm on save, decision 11): title «Зберегти пріоритети?», body «Зміни застосуються одразу. Їх можна буде змінити будь-коли — усе фіксується в журналі дій.», action «Зберегти».

### P1.7 Deferred → Phase 2–3 (do not build)

- Per-vacancy priority override (table + vacancy form field) — Phase 2 (vacancies).
- «Як це працює зараз» routing preview — Phase 3 (routing engine).
- Open-vacancy counts per TL — Phase 2.
- Auto-routing on/off banner and «Вертикалі» toggle — Phase 3 (OPEN-P3).
- Save confirm with in-flight candidates sentence — Phase 3 (OPEN-P2).
- Priority change as a vacancy timeline event — Phase 2–3 (OPEN-P4).
- Drag-and-drop reorder — only if lists grow beyond ~8 TLs per vertical.

---

## Phase 2–3 target (not built in Phase 1)

### Desktop 1440

```
┌──────────────┬────────────────────────────────────────────────────────────────────────────────────┐
│ Налаштування │ Пріоритети тімлідів                                                                │
│ Вертикалі    │ Пріоритет 0 — найвищий. Нові кандидати, подані на посаду, спершу йдуть тімліду з    │
│ Користувачі  │ найвищим пріоритетом. При однаковому — найстаршій відкритій вакансії.               │
│  та ролі     │                                                                                    │
│ ▣ Пріоритети │ [Гемблінг] [Крипто]                     Автоматичний розподіл: (●) Увімкнено        │
│  тімлідів    │                                          (змінюється в «Вертикалі»)                 │
│ Схеми бонусів│ ┌ Тімліди · Гемблінг ─────────────────────────────────────────────────────────────┐│
│ Посади       │ │ ⠿  [ 0 ]  (ВП) Василь Петренко   2 відкриті вакансії   П0  [↑][↓]               ││
│ Причини      │ │ ⠿  [ 1 ]  (ТК) Тарас Коваль      1 відкрита вакансія   П1  [↑][↓]               ││
│  відмов      │ │ ⠿  [ 2 ]  (МС) Марина Савчук     0 відкритих           П2  [↑][↓]               ││
│ Місця для    │ │ ─ Без пріоритету (нові тімліди) ─────────────────────────────────────────────── ││
│  поліграфа   │ │ ⠿  [ — ]  (ІЛ) Ігор Литвин        1 відкрита вакансія  Пріоритет не задано       ││
│ Шаблони      │ └──────────────────────────────────────────────────────────────────────────────────┘│
│  оферів      │ Незбережені зміни: Тарас 1 → 0 (рівний з Василем)     [Скасувати] [Зберегти]       │
│ Загальні     │                                                                                    │
│ Журнал дій   │ Як це працює зараз — по посадах                                                    │
│              │ Медіабаєр — Facebook:  Василь (П0, 2 вак.) → Тарас (П1) → Марина (П2: немає вак.)   │
│              │ Арбітражник — Google:  Тарас (П1) → Ігор (—)                                       │
│              │                                                                                    │
│              │ Перевизначення для окремих вакансій                    [+ Додати перевизначення]   │
│              │ ┌───────────────────────────────┬───────────┬──────────┬──────────┬───────────────┐│
│              │ │ Вакансія                      │ Тімлід    │ Загальний│ Для вакан.│               ││
│              │ │ Медіабаєр — Facebook (#212)   │ Тарас К.  │ П1       │ [ 0 ]     │ [Скинути]     ││
│              │ └───────────────────────────────┴───────────┴──────────┴──────────┴───────────────┘│
└──────────────┴────────────────────────────────────────────────────────────────────────────────────┘
```

### Interaction

- Drag to reorder (`⠿` handle) — only if added later (Phase 1 decision 7). Number field allows ties; tie rows show «Рівний пріоритет — спершу найстаріша вакансія».
- Keyboard: `Alt+↑/↓`, or `[↑][↓]` buttons; live region as Phase 1.
- «Зберегти» opens confirm: «Нові пріоритети застосуються до наступних розподілів. Кандидати, які вже в роботі, не переміщуються.» ⚠ OPEN-P2.
- «Як це працює зараз» preview uses the server routing function on current open vacancies (skips Призупинені / Заповнені / Скасовані) — Admin sees the effect before saving (preview updates with unsaved order).
- Per-vacancy override: combobox of open vacancies in this vertical → integer; same field also on vacancy edit form (Admin only). Row shows both values; effective one bold.
- Vertical with auto-routing off: banner «Автоматичний розподіл вимкнено — рекрутер обирає наступного тімліда вручну. Пріоритети використовуються лише для сортування.» ⚠ OPEN-P3.
- Every save → Журнал дій + TL «Історія» (Phase 1) + Історія affected vacancies ⚠ OPEN-P4.

### Mobile

At 390 px the list is cards with `[↑][↓]` (Phase 1), override table becomes stacked cards.

### States (additions)

- Loading adds the preview block skeleton.

### ⚠ OPEN

~~P1 TL without priority~~ → resolved by D47 (ranked after all prioritised, «Пріоритет не задано»; Phase 1 §P1.1) · P2 effect of priority change on in-flight applications (ROUTE-10 "mid-flow priority change" — expected behaviour) · P3 meaning of priorities when auto-routing is off (ordering of manual choice list?) · P4 is a priority change a vacancy timeline event.
