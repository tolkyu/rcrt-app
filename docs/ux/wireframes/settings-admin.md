# Wireframe — Налаштування › Користувачі та ролі · Вертикалі · Журнал дій (Admin) [ROLE-01..06, D22, D33, D34, D40, D42..D45, D63, AUD, HIST-03, UI-04..06]

Reference: `reference/00-foundations.webp`, `reference/01-components.webp` (§02 controls, §03 filters, §04 chips/table row, §05 toasts/empty/error/skeleton, §06 bottom sheet). Shell per `app-shell.md`. Tokens per `design-system.md`. Stories: `docs/stories/phase-1.md` §3–§5, §7.

## 0. Settings frame (all three pages)

```
┌──────────────────────┬──────────────────────────────────────────────────────────────────────────────────────┐
│ [H] Hiring           │ [☰]                                                       ☀  (АД) Анна Дорошенко ▾  │
│                      │                                                                  Адміністратор       │
│ ▢ Профіль            ├──────────────────────────────────────────────────────────────────────────────────────┤
│                      │ ┌ Налаштування ──────┐  <page title display-xl>               [primary action]      │
│                      │ │ ▣ Користувачі      │  <subtitle text-sm muted>                                     │
│                      │ │   та ролі          │                                                              │
│                      │ │ ▢ Вертикалі        │  <page content: card on --surface, radius 16, shadow sm>      │
│                      │ │ ▢ Пріоритети       │                                                              │
│                      │ │   тімлідів         │                                                              │
│                      │ │ ▢ Журнал дій       │                                                              │
│ ⚙ Налаштування  ◂act │ └────────────────────┘                                                              │
└──────────────────────┴──────────────────────────────────────────────────────────────────────────────────────┘
```
- **SettingsNav** (new): 220 px column, `nav aria-label="Розділи налаштувань"`, items h 40, radius 12, active = `--primary-subtle` + `--link`, `aria-current="page"`. Only built sections (D28); each item shown only if the user holds its permission (§6). Labels wrap to 2 lines, never ellipsis.
- `/settings` → redirect to `/settings/users` (Admin landing, STORY-UI-04-1).
- **Mobile 390:** `/settings` = index list (rows h 56, chevron) → sub-page with back button «‹ Налаштування» in the top bar; the global bottom nav stays (Налаштування lives under «Ще»).
- Filters, search and the open drawer/record live in the URL (`?q=&status=&role=&vertical=&user=<id>`, `?from=&to=&actor=&action=&entityType=&entity=&result=&record=<id>`) → back button, shareable, survives reload.

---

## 1. Користувачі та ролі — `/settings/users`

### 1.1 Desktop 1440 — list

```
│ Користувачі та ролі                                                             [+ Запросити]  │
│ Хто має доступ до Hiring і з якими ролями                                                     │
│                                                                                              │
│ [🔍 Пошук за ПІБ або email          ] [Статус: Усі ▾] [Роль: Усі ▾] [Вертикаль: Усі ▾]          │
│ (Запрошено ×) (Гемблінг ×)  Скинути фільтри                                                   │
│ ┌──────────────────────────────┬──────────────────────────────┬────────────────────┬──────────────┬────────────────┬───┐ │
│ │ Користувач                   │ Ролі                         │ Статус             │ 2FA          │ Останній вхід  │   │ │
│ ├──────────────────────────────┼──────────────────────────────┼────────────────────┼──────────────┼────────────────┼───┤ │
│ │ (АД) Анна Дорошенко (ви)     │ (Адміністратор)              │ ● Активний         │ ✓ 2 пристрої │ 01.11 09:12    │ ⋯ │ │
│ │      admin@demo              │                              │                    │              │                │   │ │
│ │ (ОШ) Олена Шевченко          │ (Керівник рекрутингу·Гемблінг)│ ● Активний        │ — Не налашт. │ 31.10 18:40    │ ⋯ │ │
│ │      head.recruiter.gambling…│                              │                    │              │                │   │ │
│ │ (НБ) Наталія Бондар          │ (Керівник HR·Гемблінг) (+1)  │ ● Активний         │ — Не налашт. │ 30.10 11:02    │ ⋯ │ │
│ │ (ВП) Василь Петренко         │ (Тімлід·Гемблінг)            │ ● Активний         │ — Не налашт. │ 01.11 08:55    │ ⋯ │ │
│ │ (ЛК) Лариса Кравець          │ (Фінансист)                  │ ● Активний         │ ⚠ Обовʼязкова│ —  Входів не   │ ⋯ │ │
│ │                              │                              │                    │  не налашт.  │    було        │   │ │
│ │ (МС) Марина Савчук           │ (Рекрутер·Гемблінг)          │ ◔ Запрошено        │ —            │ —              │ ⋯ │ │
│ │      marina@…                │                              │   до 04.11 10:05   │              │                │   │ │
│ │ (БП) Богдан Поліщук          │ (Рекрутер·Крипто)            │ ◷ Запрошення       │ —            │ —              │ ⋯ │ │
│ │      expired.invite@demo     │                              │   прострочене      │              │                │   │ │
│ │ (ІЛ) Ігор Литвин             │ (Тімлід·Гемблінг)            │ ○ Деактивовано     │ —            │ 12.10 17:30    │ ⋯ │ │
│ │      (деактивовано)          │                              │                    │              │                │   │ │
│ └──────────────────────────────┴──────────────────────────────┴────────────────────┴──────────────┴────────────────┴───┘ │
│ Показано 8 з 8                                                                                │
```
- Row h 56, two lines (name `text-sm` 600 + email `text-xs` muted, `overflow-wrap:anywhere`, ellipsis + tooltip in the cell). Whole row is the click/`Enter` target → drawer (§1.3); `⋯` = row DropdownMenu with the same actions as the drawer footer (only allowed ones).
- **Ролі:** RoleChip «Роль · Вертикаль» (glossary role names D27; global roles without vertical), max 2 chips + «+N» chip with tooltip listing all. Deactivated user: chips muted (roles kept but inactive, ROLE-05-5).
- **Статус** (UserStatusChip, dot + label, colour never the only cue): Активний green · Запрошено blue + line 2 «до {date}» · Запрошення прострочене amber · Відкликано slate · Деактивовано slate (dashed border). Derived: `is_active` + `activated_at` + latest invite `status/expires_at`.
- **2FA** (MfaStatus): «✓ N пристрої» (success icon) · «— Не налаштовано» · «⚠ Обовʼязкова — не налаштована» (warning-text; ADMIN/FINANCE holders without a factor) · «🔒 Заблоковано до 14:35» (`mfa_locked_until`) · «—» for users who never activated.
- **Останній вхід:** `dd.MM HH:mm` (year shown when not current), tooltip with full date; «Входів не було».
- Sort: alphabetical by ПІБ (uk collation), deactivated users last. No column sorting in v1.
- 10k users: TanStack Virtual rows, cursor pages of 50 loaded on scroll; footer «Показано 50 з 10 240» (PERF-02).
- Filters (FilterBar): Статус (multi: Активний, Запрошено, Запрошення прострочене, Відкликано, Деактивовано), Роль (multi, 7 roles), Вертикаль (multi + «Без вертикалі (глобальні)»). Search debounced 200 ms, min 2 chars, name or email. Active filters = FilterChips + «Скинути фільтри».

### 1.2 «Запросити» dialog (Dialog 560, desktop)

```
┌ Запросити користувача ─────────────────────────────────────────────── [×] ┐
│ Ми надішлемо лист із посиланням. Воно діє 72 години.                      │
│                                                                           │
│ ПІБ *                                                                     │
│ [                                                         ]               │
│ Електронна пошта *                                                        │
│ [                                                         ]               │
│ З цією адресою людина входитиме, зокрема через Google.                    │
│                                                                           │
│ Ролі та вертикалі *                                                       │
│ ┌──────────────────────────┬────────────┬────────────┐                    │
│ │ Роль                     │ Гемблінг   │ Крипто     │                    │
│ ├──────────────────────────┼────────────┼────────────┤                    │
│ │ Керівник рекрутингу      │    [ ]     │    [ ]     │                    │
│ │ Рекрутер                 │    [✓]     │    [ ]     │                    │
│ │ Керівник HR              │    [ ]     │    [ ]     │                    │
│ │ HR-менеджер              │    [ ]     │    [ ]     │                    │
│ │ Тімлід                   │    [ ]     │    [ ]     │                    │
│ ├ Глобальні ролі — без вертикалі ────────────────────┤                    │
│ │ Адміністратор            │ [ ] Усі вертикалі  🛡 Потрібна 2FA       │    │
│ │ Фінансист                │ [ ] Усі вертикалі  🛡 Потрібна 2FA       │    │
│ └──────────────────────────┴─────────────────────────┘                    │
│ Обрано 1 роль: (Рекрутер · Гемблінг)                                      │
│                                                                           │
│                                     [Скасувати] [Надіслати запрошення]    │
└───────────────────────────────────────────────────────────────────────────┘
```
- **RoleMatrix** (new): rows = vertical-scoped roles, columns = verticals (from `vertical.read`, alphabetical); global section with one checkbox per role (D40 — UI cannot produce an invalid combination). > 4 verticals → horizontal scroll, sticky first column. Custom roles (ROLE-04) appear here when they exist (Phase 2+).
- Any combination allowed (D35). ADMIN/FINANCE row shows «🛡 Потрібна 2FA» with tooltip «Користувач налаштує 2FA під час першого входу з цією роллю.»
- Summary line below = selected RoleChips (`aria-live="polite"`).
- No verticals yet → matrix body replaced by Alert «Вертикалей ще немає — доступні лише глобальні ролі.» + link «Створити вертикаль».
- Validation on blur + submit (react-hook-form + shared `createInviteSchema`); first invalid field focused.
- Server conflicts (409) shown under the email field:
  - `USER_EXISTS` → «Користувач з таким email уже існує.» + link «Відкрити користувача».
  - `INVITE_PENDING` → «Запрошення вже надіслано.» + button «Надіслати повторно».
  - `USER_DEACTIVATED` → Alert «Цей користувач деактивований. Його можна активувати знову з попередніми ролями.» + «Активувати знову» (opens §1.6 for that user) (D42). ⚠ OPEN-U3.
- Success → dialog closes, row appears optimistically at its sorted place with «Запрошено», toast «Запрошення надіслано · {email} · діє до {date}». `delivered: false` → warning toast «Запрошення створено, але лист не надіслано» + «Спробуйте «Надіслати повторно» в картці користувача.» ⚠ OPEN-U2.

### 1.3 User drawer (Sheet right, 400; `?user=<id>`)

```
┌ Користувач ───────────────────────────── [×] ┐
│ (ВП)  Василь Петренко                        │
│ 48    vasyl.tl@demo                    [⋯]   │
│       ● Активний · Останній вхід: 01.11.2026 08:55 │
│ ───────────────────────────────────────────  │
│ [Профіль і ролі] [Історія]      (segmented)  │
│                                              │
│ Ролі та вертикалі              [Змінити ролі]│
│ (Тімлід · Гемблінг)                          │
│                                              │
│ Пріоритет тімліда                            │
│ Гемблінг: (П0)        Пріоритети тімлідів →  │
│                                              │
│ Безпека входу                                │
│ Двофакторна автентифікація                   │
│ — Не налаштовано                             │
│ Необовʼязкова для ролей цього користувача.   │
│                                [Скинути 2FA]░│  ← disabled, DisabledReason «У користувача немає налаштованої 2FA.»
│                                              │
│ ───────────────────────────────────────────  │
│ [Деактивувати]  (destructive-soft)           │
└──────────────────────────────────────────────┘
```
Variants of the drawer body/footer (only allowed actions render; blocked ones are disabled with DisabledReason):

| User state | Sections | Footer actions |
|---|---|---|
| Активний | Ролі, Пріоритет тімліда (only if TEAM_LEAD), Безпека входу | «Скинути 2FA» (enabled if ≥ 1 factor or locked), «Деактивувати» |
| Запрошено / прострочене | Ролі, block «Запрошення»: «Надіслано: …» · «Діє до: …» / «Прострочене з …» · «Надсилалося повторно: N» | «Надіслати повторно» (secondary), «Відкликати» (destructive-soft; both states — an expired invite is still `PENDING` in the data) |
| Відкликано | Ролі, block «Запрошення» (revoked at/by) | «Запросити знову» (§1.7, D70) |
| Деактивовано | Ролі (muted, «неактивні»), name suffix «(деактивовано)» | «Активувати знову» (primary) |
| Self «(ви)» | as Активний | «Деактивувати» disabled «Не можна деактивувати власний обліковий запис.»; «Скинути 2FA» disabled «Свою 2FA ви не можете скинути — це робить інший адміністратор.» |
| Last active Admin | as Активний | «Деактивувати» disabled «Це останній активний адміністратор. Спершу призначте ще одного.» |

- `[⋯]` header menu: «Скопіювати email», «Усі дії в журналі» (→ `/settings/audit?entity=user:<id>`, needs `audit.read`), «Змінити email» (D69, dialog §1.11).
  - In code the audit link is an inline header link (keep it). Phase 1 builds the `[⋯]` DropdownMenu (trigger `aria-label` «Інші дії», ghost icon button 44×44 / 36 desktop) with **only** «Змінити email»; the trigger renders only when the menu has ≥ 1 item.
  - «Змінити email» visibility by status:

| Status | Item |
|---|---|
| Запрошено · Запрошення прострочене · Відкликано | shown, enabled |
| same, but 0 roles | shown, **disabled**: second line in the item `text-xs` muted = `drawer.noRolesReason` «Спершу призначте ролі — без ролей запрошення недійсне.» (same reason as resend / re-invite). Use `aria-disabled="true"` + `onSelect` → `preventDefault()`, **not** Radix `disabled` (Radix skips disabled items in arrow navigation, so the reason would never be read) |
| same, while a resend / revoke / re-invite / change-email mutation is pending | trigger disabled (shared `mutationKey` `['settings','user',id,'invite']` → `useIsMutating`) |
| Активний · Деактивовано | **hidden** (no Phase 1 action; activated-user email change = Phase 5, ends sessions — D69) |
- **Історія** tab: user timeline from `entity_event` (append-only, HIST-03) via compact `Timeline`: icon, action label (same labels as Журнал дій §3.4), actor, `dd.MM.yyyy HH:mm`, old→new for roles/name. Cursor «Показати ще». No IP/UA here (that is Журнал дій).
- Drawer opens instantly from the list row cache (name/status/roles), details stream in (skeleton for Безпека/Історія only).

### 1.4 «Змінити ролі» dialog

```
┌ Ролі — Василь Петренко ──────────────────────────────── [×] ┐
│ Зміни діють одразу, повторний вхід не потрібен.              │
│ <RoleMatrix prefilled>                                       │
│   Адміністратор  [■] Усі вертикалі  ← disabled for self /    │
│                                       last Admin + reason    │
│ Буде додано: (Рекрутер · Гемблінг)                           │
│ Буде знято:  (Тімлід · Крипто)                               │
│ ⚠ У користувача не залишиться ролей — він бачитиме лише «Профіль». (only if 0) │
│                                  [Скасувати] [Зберегти зміни] │
└──────────────────────────────────────────────────────────────┘
```
- «Зберегти зміни» disabled until the set differs. Diff lines `aria-live="polite"`.
- Removals present → AlertDialog «Зняти ролі?» — «{name} втратить доступ, який давали ці ролі, з наступної дії в системі:» + list of removed chips → [Скасувати] [Зняти та зберегти] (filled destructive). Adds only → save directly.
- Invited user with 0 roles → warning «Без ролей запрошення стане недійсним.» (ROLE-05-2 edge case).
- Phase 2–3: removal blocked while open work exists (D43) — the dialog gets a reassignment section then; not in Phase 1.
- Optimistic chips in the drawer/list; 409 → toast conflict + refetch; validation error → inline under matrix.

### 1.5 «Деактивувати» (AlertDialog)

```
┌ Деактивувати користувача: Василь Петренко? ─────────────┐
│ Користувач не зможе увійти. Історія залишиться.          │
│ • Усі його сесії завершаться протягом хвилини.           │
│ • Ролі збережуться неактивними — їх можна відновити.     │
│ Причина (необовʼязково)                                  │
│ [                                              ] 0/500   │
│ Бачать лише адміністратори в журналі дій.                │
│                         [Скасувати] [Деактивувати]       │
└──────────────────────────────────────────────────────────┘
```
- Ukrainian names decline; all titles put «{name}» after a colon (nominative) to avoid case forms.
- Phase 2–3 adds the open-work reassignment section (D24, STORY-ROLE-06-1).

### 1.6 «Активувати знову» (Dialog)
- Title «Активувати знову: {name}?», body «Користувач зможе входити. Оберіть ролі, які відновити.» + checkbox list of previous roles (all checked) → [Скасувати] [Активувати]. No previous roles → «Попередніх ролей немає — призначте ролі після активації.» (D44)

### 1.7 «Відкликати запрошення» (AlertDialog) / «Надіслати повторно» (no dialog)
- Revoke: «Відкликати запрошення: {name}?» — «Посилання з листа перестане діяти, і користувач не зможе прийняти запрошення.» → [Скасувати] [Відкликати].
- Resend: immediate (not destructive for the invitee — a fresh link replaces the old). Toast «Запрошення надіслано повторно · Попереднє посилання більше не діє. Нове діє до {date}.»

### 1.8 «Скинути 2FA» (AlertDialog with form)

```
┌ Скинути 2FA: Ольга Мельник? ─────────────────────────────┐
│ Усі пристрої 2FA буде видалено, а всі сесії користувача — │
│ завершено. Під час наступного входу він налаштує 2FA      │
│ знову. Ми повідомимо його листом.                          │
│ Причина *                                                  │
│ [ Втрачено телефон…                             ] 18/500   │
│ Запис потрапить у журнал дій.                              │
│                              [Скасувати] [Скинути 2FA]    │
└────────────────────────────────────────────────────────────┘
```
- Reason 10–500 chars (shared `mfaResetSchema`); confirm disabled until valid. Never offered on self (D22, STORY-SEC-AUTH-3).
- 503 `MFA_RESET_INCOMPLETE` → inline error in the dialog «2FA скинуто не повністю. Спробуйте ще раз.», dialog stays open with the reason kept.

### 1.9 Mobile 390

```
┌──────────────────────────────┐      ┌──────────────────────────────┐
│ ‹ Налаштування   🔍  🔔 (АД) │      │ Користувач               [×] │  full-height sheet
│ Користувачі та ролі          │      │ (ВП) Василь Петренко         │
│ [🔍 Пошук…        ] [⚙ Фільтри 2]│  │ vasyl.tl@demo                │
│ ┌──────────────────────────┐ │      │ ● Активний · 01.11 08:55     │
│ │ (ОШ) Олена Шевченко   ⋯  │ │      │ [Профіль і ролі] [Історія]   │
│ │ head.recruiter.gambling… │ │      │ Ролі та вертикалі            │
│ │ (Керівник рекрутингу ·   │ │      │ (Тімлід · Гемблінг)          │
│ │  Гемблінг)               │ │      │ [Змінити ролі]               │
│ │ ● Активний · 31.10 18:40 │ │      │ Безпека входу …              │
│ └──────────────────────────┘ │      │                              │
│ ┌──────────────────────────┐ │      ├──────────────────────────────┤
│ │ (МС) Марина Савчук    ⋯  │ │      │ [ Деактивувати ] (lg, 48)    │  sticky footer
│ │ ◔ Запрошено до 04.11     │ │      └──────────────────────────────┘
│ └──────────────────────────┘ │
│ [+ Запросити] (sticky, 48)   │
├──────────────────────────────┤
│ ⌂ … bottom nav … Ще(active)  │
└──────────────────────────────┘
```
- Cards radius 16, chips wrap (no ellipsis on role chips at 390 — «Керівник рекрутингу · Гемблінг» wraps inside the chip, max 2 lines).
- Filters → bottom sheet (Статус / Роль / Вертикаль as checkbox lists) with «Показати результати» + «Скинути фільтри».
- Invite → full-height bottom sheet; RoleMatrix becomes grouped lists: section per vertical («Гемблінг»: 5 role checkboxes, rows h 44) + section «Глобальні ролі — без вертикалі». Inputs 44 px, `text-base` (no iOS zoom). Footer sticky «Надіслати запрошення».
- All dialogs → bottom sheets with full-width stacked buttons: confirm/destructive at the bottom (thumb zone), «Скасувати» above it. Desktop: confirm on the right.

### 1.10 States
- Loading (> 150 ms): filter bar static; 8 skeleton rows (avatar circle + 2 lines + 2 chip pills + status pill); drawer: header from cache, skeleton sections.
- Empty (filtered): EmptyState `user-search` «Нікого не знайдено» · «Змініть пошук або фільтри.» · [Скинути фільтри]. Unfiltered empty is impossible (the Admin exists).
- Error: SectionError in the table card («Не вдалося завантажити дані» + «Спробувати ще раз»); filters stay usable.
- 401 `MFA_REQUIRED` on any call (aal dropped): Alert under page header «Підтвердьте вхід кодом 2FA, щоб керувати налаштуваннями.» + [Підтвердити кодом] → `/mfa/verify?next=…`. (At aal1 the Settings nav item is hidden anyway — grants are withheld, D63.)
- 404 (user id not visible/unknown in `?user=`): drawer shows NotFoundState «Сторінку не знайдено або доступ обмежено.»
- 409 version conflict: toast «Дані щойно змінив інший адміністратор. Ми оновили сторінку — перевірте й повторіть.» + refetch.

### 1.11 «Змінити email» (Dialog; D69, ROLE-05)

Only for users who never activated (Запрошено / прострочене / Відкликано; visibility §1.3). Effect: the current invite is revoked (old link dies), a new 72 h invite goes to the new address with the user's **current** roles; status becomes «Запрошено».

```
┌ Змінити email: Марина Савчук ───────────────────────── [×] ┐
│ Попереднє посилання з листа перестане діяти. На нову        │
│ адресу ми надішлемо запрошення, яке діятиме 72 години.      │
│                                                             │
│ Поточна адреса                                              │
│ marina.savchuk@gmial.com                 (text, read-only)  │
│                                                             │
│ Нова адреса                                                 │
│ [ marina.savchuk@gmail.com                          ]       │
│ З цією адресою людина входитиме, зокрема через Google.      │
│                                                             │
│ Ролі після прийняття: Рекрутер · Гемблінг                   │
│                                                             │
│              [Скасувати] [Змінити й надіслати запрошення]   │
└─────────────────────────────────────────────────────────────┘
```

- **Dialog, not AlertDialog:** it is a form (initial focus must land in the field, like §1.4 / §2.2 rename); nothing is lost — the old link is replaced, and the consequence is the dialog description. Component: `components/ui/dialog.tsx` (desktop 448 centred; < 768 px bottom sheet built in).
- **Current address:** plain text (`<p>` with visible label, not a disabled input — better contrast, copyable), `overflow-wrap:anywhere`.
- **New address:** `type="email"`, `autocomplete="off"`, `inputMode="email"`, `text-base` on mobile (no iOS zoom), h 44 / 40. **Prefilled with the current email**, all text selected on open → typing replaces it, arrow keys let the Admin fix one typo.
- **Roles line:** reuse `drawer.reinviteDialog.roles`; chips joined via `useRoleLabel` exactly like the re-invite dialog.
- **Validation** (client, shared `emailAddressSchema`; format on blur + submit; server re-checks):

| Case | Where | Message (key) |
|---|---|---|
| empty | under field | `inviteDialog.errors.emailRequired` «Введіть адресу електронної пошти.» |
| invalid format / server 400 | under field | `inviteDialog.errors.emailInvalid` «Введіть коректну адресу електронної пошти.» |
| equals current (trim + case-insensitive; server `EMAIL_UNCHANGED`) | under field, muted hint (not error), submit **disabled** while equal | `drawer.changeEmail.errors.unchanged` «Це поточна адреса — введіть виправлену.» — shown after the **first edit** (not on open, not on blur: opening inside the Sheet can blur/refocus the field once) |
| 409 address held by another user | under field (`role="alert"`), field focused, dialog stays open | same copy as the invite dialog §1.2 by code: `USER_EXISTS` → `errors.userExists`, `INVITE_PENDING` → `errors.invitePending`, `USER_DEACTIVATED` → `errors.userDeactivated`, `INVITE_REVOKED` → `errors.inviteRevoked`; + link-button `errors.showInList` «Показати в списку» (STORY-ROLE-05-7) → closes the dialog **and** the card, puts that address into the list search, focus → list search field |

- **Pending:** submit label `inviteDialog.submitting` «Надсилаємо…» + `aria-busy`; input `readOnly`; «Скасувати» disabled; [×] stays enabled but does nothing (guard in `close()`), Escape and overlay click ignored — same as the invite dialog. No optimistic update (address uniqueness + email send are server truths).
- **Success** (`{ inviteId, expiresAt, delivered }`): dialog closes → invalidate user detail, users list, audit (same `refresh()` as `user-invite-actions.tsx`) → focus the drawer heading (`onFocusHeading`). Drawer header and Запрошення block show the new address / new «Діє до».
  - `delivered: true` → success toast `drawer.changeEmail.toast`.
  - `delivered: false` → error toast `drawer.changeEmail.notDelivered` (email already changed and old link dead — the toast says so; «Надіслати повторно» in the footer is the recovery).
- **Errors** (same mapping as `onError` in `user-invite-actions.tsx`):

| Response | Behaviour |
|---|---|
| 409 `INVITE_ROLES_INVALID` | toast `drawer.rolesInvalid`, close, refetch, focus heading |
| 409 `STALE_STATE` (`expectedVersion` outdated — e.g. two Admins change the same email, STORY-ROLE-05-7 edge case) / other 409 (user activated, invite moved) / 404 | toast `settings.common.conflict`, close, refetch, focus heading (the `[⋯]` may disappear) |
| 409 address taken (`body.email`) | field error (table above), stays open |
| other / network | toast `settings.common.saveFailed`; dialog stays open, typed value kept |

- **Focus & Escape:** the menu item opens the dialog via state after the DropdownMenu closes (avoid the Radix menu→dialog focus fight). Initial focus = new-address input (text selected). Cancel/[×]/Escape → focus back to the `[⋯]` trigger; **every close caused by a server answer** (success, conflict, `INVITE_ROLES_INVALID`) → drawer heading; «Показати в списку» → list search field. **Escape closes only the Dialog, never the Sheet behind it:** reuse `useNestedDialog` from `components/settings/invite-dialog-behaviour.ts` (`onEscapeKeyDown` → `preventDefault`, `onKeyDown` Escape → close if not busy, `onCloseAutoFocus` → heading when flagged).
- **Mobile 390:** bottom sheet (`max-h 85dvh`, safe-area padding); fields full width; buttons stacked full width, h 48: «Змінити й надіслати запрошення» at the bottom (thumb zone), «Скасувати» above (§1.9). Long Ukrainian label wraps to 2 lines, never truncates. Keyboard open → content scrolls, primary stays reachable.
  - Follow-up (small): the invite dialog §1.2 on mobile still puts the confirm button above «Скасувати»; align it with §1.9/§1.11 (confirm at the bottom).
- **Accessibility:** title = accessible name; description via `aria-describedby`; no visible «*» on «Нова адреса» (consistent with the invite dialog), `aria-required="true"`; errors/hint linked with `aria-describedby`, `role="alert"` on every field error returned by the server (taken, 400 invalid, `EMAIL_UNCHANGED`); client-side checks only describe the field.
- **Audit / history:** event `user.email_changed` (actor, user, invite ids); old/new email only in `audit_log` (Admin, aal2). User «Історія» entry «Змінено email» shows the roles line (like «Запрошено повторно»), **never** the addresses (same rule as D72 for ПІБ).
- **API:** `PUT /api/v1/users/{userId}/email` body `{ email, expectedVersion }` → `200 { inviteId, expiresAt, delivered }`; stale version → 409 `STALE_STATE`; perm `settings.users.manage` (aal2); one transaction: revoke current invite (any of PENDING/expired/REVOKED), update `app_user.email`, create invite, emit event; email sent after commit.

**New strings** → `messages/uk.json`:

```json
"settings": { "users": { "drawer": {
  "moreActions": "Інші дії",
  "changeEmail": {
    "menuItem": "Змінити email",
    "title": "Змінити email: {name}",
    "description": "Попереднє посилання з листа перестане діяти. На нову адресу ми надішлемо запрошення, яке діятиме 72 години.",
    "currentLabel": "Поточна адреса",
    "newLabel": "Нова адреса",
    "submit": "Змінити й надіслати запрошення",
    "errors": {
      "unchanged": "Це поточна адреса — введіть виправлену."
    },
    "toast": "Email змінено. Запрошення надіслано на {email} · діє до {at, date, ::dd.MM.yyyy HH:mm}",
    "notDelivered": "Email змінено, але лист не надіслано, а попереднє посилання вже не діє. Спробуйте «Надіслати повторно»."
  }
} },
"audit": {
  "actions": { "user.email_changed": "Змінено email" }
} }
```
Reused (do not duplicate): `inviteDialog.emailHint`, `inviteDialog.submitting`, `inviteDialog.errors.{emailRequired,emailInvalid,userExists,invitePending,userDeactivated,inviteRevoked,showInList}`, `drawer.reinviteDialog.roles`, `drawer.noRolesReason`, `drawer.rolesInvalid`, `settings.common.{cancel,conflict,saveFailed}`, dialog close label as in `invite-user-dialog.tsx` (`tClose('close')`).

---

## 2. Вертикалі — `/settings/verticals`

### 2.1 Desktop 1440

```
│ Вертикалі                                                                 [+ Створити вертикаль] │
│ Напрями бізнесу. Ролі, вакансії й кандидати належать вертикалі.                                 │
│ ┌─────────────────────────────────┬──────────────────────┬────────────────┬──────────────────────┐ │
│ │ Назва                           │ Користувачі          │ Створено       │                      │ │
│ ├─────────────────────────────────┼──────────────────────┼────────────────┼──────────────────────┤ │
│ │ Гемблінг                        │ 9 користувачів →     │ 15.10.2026     │ [✎ Перейменувати] [⋯]│ │
│ │ Крипто                          │ 4 користувачі →      │ 15.10.2026     │ [✎ Перейменувати] [⋯]│ │
│ └─────────────────────────────────┴──────────────────────┴────────────────┴──────────────────────┘ │
│ ⓘ Вертикалі не деактивуються й не видаляються. Назву можна змінити — стара залишиться в історії. │
```
- Table rows h 48 (single line), alphabetical (uk collation). «Користувачі» = active users with ≥ 1 role in the vertical; link → `/settings/users?vertical=<id>`.
- `⋯` menu: «Історія змін» → `/settings/audit?entity=vertical:<id>` (needs `audit.read`). **No** deactivate/delete anywhere (D34, Q-37).
- Info line = Alert (info, inline, not dismissible) so the Admin does not look for a delete action.

### 2.2 Create / rename dialog (Dialog 440)

```
┌ Нова вертикаль ─────────────────── [×] ┐   ┌ Перейменувати вертикаль ───────────── [×] ┐
│ Назва *                                 │   │ Поточна назва: Гемблінг                    │
│ [                              ] 0/50   │   │ Назва *                                    │
│ Від 2 до 50 символів, унікальна.        │   │ [ Гемблінг                      ] 8/50    │
│                  [Скасувати] [Створити] │   │ Нова назва одразу зʼявиться всюди: у ролях,│
└─────────────────────────────────────────┘   │ фільтрах і картках. Стара залишиться в     │
                                              │ історії.                                   │
                                              │             [Скасувати] [Перейменувати]    │
                                              └────────────────────────────────────────────┘
```
- Trim; duplicate check case-insensitive on the server (409 → field error «Вертикаль з такою назвою вже існує.»). Rename with the same name → submit disabled + hint «Назва не змінилася.»
- Rename is not destructive → no extra confirm. Optimistic row update; rollback toast on error.
- Toasts: «Вертикаль «{name}» створено» · «Вертикаль перейменовано: «{from}» → «{to}»».
- Per-vertical toggles (D2 approval, ROUTE-09 auto-routing) are stored but **not shown** in Phase 1; they appear here in their phases (STORY-ROLE-03-1). No polygraph-review toggle (D36).

### 2.3 Mobile 390
- Card list: name (`text-base` 600), «9 користувачів →», «Створено 15.10.2026», trailing `⋯` (Перейменувати, Історія змін). Sticky «+ Створити вертикаль» (48). Dialogs → bottom sheets.

### 2.4 States
- Loading: 3 skeleton rows. Empty: EmptyState `layers` «Вертикалей ще немає» · «Створіть першу вертикаль, щоб призначати ролі.» · [Створити вертикаль]. Error: SectionError. 409 on rename: conflict toast + refetch, dialog stays open with typed value.

---

## 3. Журнал дій — `/settings/audit`

### 3.1 Desktop 1440

```
│ Журнал дій                                                                                        │
│ Усі зміни та входи. Записи не можна змінити чи видалити, вони зберігаються 3 роки.                │
│ [ Усі дії | Входи та безпека ]                                                                    │
│ [Період: Останні 7 днів ▾] [Хто: Усі ▾] [Дія: Усі ▾] [Обʼєкт: Усі ▾] [Результат: Усі ▾]            │
│ (Обʼєкт: Користувач · Тарас Коваль ×)  Скинути фільтри                     Дати за київським часом │
│ ┌─────────────────────┬────────────────────────┬──────────────────────────┬─────────────────────────────┬─────────────┬────────────────┐ │
│ │ Час                 │ Хто                    │ Дія                      │ Обʼєкт                      │ Результат   │ IP             │ │
│ ├─────────────────────┼────────────────────────┼──────────────────────────┼─────────────────────────────┼─────────────┼────────────────┤ │
│ │ 01.11.2026 10:05:12 │ (АД) Анна Дорошенко    │ Запрошено користувача    │ Користувач · Марина Савчук  │ Успішно     │ 91.203.4.17    │ │
│ │ 01.11.2026 09:58:40 │ ⚙ Система              │ Сесію завершено          │ Користувач · Ігор Литвин    │ Успішно     │ —              │ │
│ │ 01.11.2026 09:12:03 │ ? Невідомий користувач │ Невдала спроба входу     │ —                           │ ⛔ Відмовлено│ 185.12.40.3    │ │
│ │ 31.10.2026 18:20:55 │ (АД) Анна Дорошенко    │ Перейменовано вертикаль  │ Вертикаль · Крипто          │ Успішно     │ 91.203.4.17    │ │
│ │ 31.10.2026 17:02:10 │ (ОШ) Олена Шевченко    │ Запрошено користувача    │ —                           │ ⛔ Відмовлено│ 10.0.4.2       │ │
│ └─────────────────────┴────────────────────────┴──────────────────────────┴─────────────────────────────┴─────────────┴────────────────┘ │
│ Показано 50 · [Показати ще]                                                                       │
```
- Newest first, cursor pagination (50/page) + TanStack Virtual; no total count (avoids a full count over 3 years of rows).
- **Views** (segmented ToggleGroup): «Усі дії» · «Входи та безпека» = preset `action ∈ auth.* + user.mfa_*` (login history for all users, STORY-AUD-3). Same table, same detail.
- **Filters:** Період (presets Сьогодні / Останні 7 днів (default) / Останні 30 днів / Свій період → range Calendar, Monday first; boundaries = Kyiv midnight, STORY-AUD-2) · Хто (searchable combobox of users + «Система») · Дія (grouped multi-select: Користувачі / Входи та безпека / Вертикалі / Налаштування; labels §3.4) · Обʼєкт (type: Користувач, Запрошення, Вертикаль, Налаштування) · Результат (Усі / Успішно / Відмовлено). Specific entity filter is set from links («Усі дії з цим обʼєктом», drawer/vertical «Історія змін») and shows as a FilterChip.
- **Хто:** UserAvatar + current name; deactivated → «(деактивовано)»; `actor_kind=SYSTEM` → «⚙ Система», except `auth.login_failed` without entity → «Невідомий користувач» (no email is stored, T4-K02).
- **Обʼєкт:** «{type} · {label}», label = current name for users/verticals (Admin can open them anyway), never values from PII side tables. Unknown/removed target → type + short ID «#3f2a…». Phase 2+ candidate/application entities: label = application/candidate ID only ⚠ OPEN-L2.
- **Результат:** «Успішно» muted text; «Відмовлено» = red-soft chip with `ban` icon (security events, STORY-AUD-1).
- Row click / `Enter` → detail Sheet (480; `?record=<id>`). `j/k` move between rows while the sheet is open (detail follows).

### 3.2 Record detail (Sheet right 480)

```
┌ Запис журналу ────────────────────────────────── [×] ┐
│ Запрошено користувача                       Успішно  │
│ user.invited                                (mono xs)│
│ ──────────────────────────────────────────────────── │
│ Час         01.11.2026 10:05:12 (Київ)               │
│             UTC: 2026-11-01 08:05:12                 │
│ Хто         (АД) Анна Дорошенко                       │
│ Обʼєкт      Користувач · Марина Савчук   [Відкрити]  │
│             Усі дії з цим обʼєктом →                 │
│ IP-адреса   91.203.4.17                              │
│ Пристрій    Chrome 130 · Windows                     │
│             ▸ User-Agent (collapsible, mono, wraps)  │
│ ID запиту   7c1e…a90b                      [Копіювати]│
│ ──────────────────────────────────────────────────── │
│ Зміни                                                │
│ ┌──────────┬──────────────┬─────────────────────────┐│
│ │ Поле     │ Було         │ Стало                   ││
│ │ Ролі     │ —            │ (Рекрутер · Гемблінг)   ││
│ └──────────┴──────────────┴─────────────────────────┘│
│ Подробиці                                            │
│ Запрошення  #a41c…                                   │
│ [Показати JSON]                                      │
└──────────────────────────────────────────────────────┘
```
- Renders **only the stored audit row** (`before`, `after`, `details`, `ip`, `user_agent`, `request_id`); known fields localized (roles → RoleChips, verticalId → vertical name, reason codes → §3.4 labels), unknown keys shown raw. DENIED rows show «Причина відмови» from `details.reason`.
- «Відкрити» → user drawer / vertical row (only with the matching permission; otherwise hidden).
- «Показати JSON» = read-only `<pre>` of before/after/details (mono, wraps, copy button). No edit/delete affordances anywhere (DB-enforced append-only).

### 3.3 Mobile 390
- View toggle full width; filters → bottom sheet; list of cards: line 1 action label + result chip if DENIED, line 2 actor · object, line 3 time (`dd.MM HH:mm`) · IP. Tap → full-height sheet with the same detail; Зміни table becomes stacked «Поле — Було → Стало» blocks.

### 3.4 States
- Loading: filter bar static + 10 skeleton rows (4 text bars). Detail: skeleton key–value rows.
- Empty: EmptyState `scroll-text` «Записів не знайдено» · «За цей період і фільтри дій немає.» · [Скинути фільтри].
- Error: SectionError. Detail 404: NotFoundState inside the sheet.
- Custom period > 366 days → field error «Оберіть період не довший за рік.» ⚠ OPEN-L3.

---

## 4. Components

| Component | Source | Status in code |
|---|---|---|
| Button, Input, Label, Card, Avatar, DropdownMenu, Sheet, Skeleton, Tooltip, Separator, Sonner | shadcn (`components/ui/*`) | exist |
| EmptyState, SectionError, NotFoundState, PageHeader | `components/states/*`, `components/shell/page-header.tsx` | exist |
| Dialog, AlertDialog, Checkbox, Textarea (+ counter), Select, Popover + Command (combobox), Tabs (segmented), ToggleGroup, Calendar (range, uk, Monday first), Alert, Collapsible, Badge | shadcn | **add** |
| Drawer (vaul) — mobile bottom sheets | shadcn | **add** |
| Table (TanStack Table + Virtual), FilterBar, FilterChip, DisabledReason | design-system §4–5 | **add** |
| SettingsNav · RoleChip · UserStatusChip · MfaStatus · RoleMatrix · AuditActorCell · AuditChanges (diff table + JSON) · Timeline `compact` | custom | **add** (`components/settings/*`; Timeline in `components/ui`) |

---

## 5. Copy — `messages/uk.json` → `settings`

Role names reuse `common.roles.*`; date format via ICU like existing keys; apostrophe `ʼ`.

```json
{
  "settings": {
    "metaTitle": "Налаштування",
    "title": "Налаштування",
    "nav": {
      "label": "Розділи налаштувань",
      "users": "Користувачі та ролі",
      "verticals": "Вертикалі",
      "priorities": "Пріоритети тімлідів",
      "audit": "Журнал дій",
      "back": "Налаштування"
    },
    "common": {
      "cancel": "Скасувати",
      "save": "Зберегти",
      "saving": "Зберігаємо…",
      "you": "(ви)",
      "deactivatedSuffix": "(деактивовано)",
      "system": "Система",
      "all": "Усі",
      "filters": "Фільтри",
      "filtersCount": "Фільтри ({count})",
      "applyFilters": "Показати результати",
      "resetFilters": "Скинути фільтри",
      "removeFilter": "Прибрати фільтр «{label}»",
      "loadMore": "Показати ще",
      "shown": "Показано {shown}",
      "shownOf": "Показано {shown} з {total}",
      "rowActions": "Дії: {name}",
      "copy": "Копіювати",
      "copied": "Скопійовано",
      "charCounter": "{count}/{max}",
      "dateTime": "{at, date, ::dd.MM.yyyy HH:mm}",
      "date": "{at, date, ::dd.MM.yyyy}",
      "conflict": "Дані щойно змінив інший адміністратор. Ми оновили сторінку — перевірте й повторіть.",
      "saveFailed": "Не вдалося зберегти. Спробуйте ще раз.",
      "rolledBack": "Зміну не збережено — повернули як було.",
      "mfaRequired": "Підтвердьте вхід кодом 2FA, щоб керувати налаштуваннями.",
      "mfaVerify": "Підтвердити кодом"
    },
    "users": {
      "metaTitle": "Користувачі та ролі",
      "title": "Користувачі та ролі",
      "subtitle": "Хто має доступ до Hiring і з якими ролями",
      "invite": "Запросити",
      "searchLabel": "Пошук користувачів",
      "searchPlaceholder": "Пошук за ПІБ або email",
      "filterStatus": "Статус",
      "filterRole": "Роль",
      "filterVertical": "Вертикаль",
      "globalVertical": "Без вертикалі (глобальні)",
      "columns": {
        "user": "Користувач",
        "roles": "Ролі",
        "status": "Статус",
        "mfa": "2FA",
        "lastLogin": "Останній вхід",
        "actions": "Дії"
      },
      "status": {
        "ACTIVE": "Активний",
        "INVITED": "Запрошено",
        "INVITE_EXPIRED": "Запрошення прострочене",
        "REVOKED": "Відкликано",
        "DEACTIVATED": "Деактивовано"
      },
      "inviteUntil": "до {at, date, ::dd.MM HH:mm}",
      "rolesMore": "+{count}",
      "rolesNone": "Без ролей",
      "lastLoginNever": "Входів не було",
      "mfa": {
        "enabled": "{count, plural, one {# пристрій} few {# пристрої} many {# пристроїв} other {# пристрою}}",
        "off": "Не налаштовано",
        "requiredMissing": "Обовʼязкова — не налаштована",
        "locked": "Заблоковано до {at, date, ::HH:mm}"
      },
      "empty": {
        "title": "Нікого не знайдено",
        "description": "Змініть пошук або фільтри."
      },
      "roleMatrix": {
        "caption": "Ролі за вертикалями",
        "roleColumn": "Роль",
        "globalGroup": "Глобальні ролі — без вертикалі",
        "allVerticals": "Усі вертикалі",
        "cellLabel": "{role} · {vertical}",
        "mfaNote": "Потрібна 2FA",
        "mfaNoteHint": "Користувач налаштує 2FA під час першого входу з цією роллю.",
        "selected": "{count, plural, =0 {Ролей не обрано} one {Обрано # роль} few {Обрано # ролі} many {Обрано # ролей} other {Обрано # ролі}}",
        "noVerticals": "Вертикалей ще немає — доступні лише глобальні ролі.",
        "toVerticals": "Створити вертикаль",
        "selfAdminLocked": "Не можна зняти роль адміністратора із себе.",
        "lastAdminLocked": "Це останній активний адміністратор — роль зняти не можна."
      },
      "inviteDialog": {
        "title": "Запросити користувача",
        "description": "Ми надішлемо лист із посиланням. Воно діє 72 години.",
        "nameLabel": "ПІБ",
        "emailLabel": "Електронна пошта",
        "emailHint": "З цією адресою людина входитиме, зокрема через Google.",
        "rolesLabel": "Ролі та вертикалі",
        "rolesHint": "Оберіть щонайменше одну роль. Адміністратор і Фінансист діють у всіх вертикалях.",
        "submit": "Надіслати запрошення",
        "submitting": "Надсилаємо…",
        "errors": {
          "nameRequired": "Введіть ПІБ.",
          "nameTooShort": "Щонайменше 2 символи.",
          "nameTooLong": "Не більше 100 символів.",
          "emailRequired": "Введіть адресу електронної пошти.",
          "emailInvalid": "Введіть коректну адресу електронної пошти.",
          "rolesRequired": "Оберіть щонайменше одну роль.",
          "rolesInvalid": "Перевірте ролі: Адміністратор і Фінансист — без вертикалі, інші — з вертикаллю.",
          "userExists": "Користувач з таким email уже існує.",
          "openUser": "Відкрити користувача",
          "invitePending": "Запрошення вже надіслано.",
          "resendInstead": "Надіслати повторно",
          "userDeactivated": "Цей користувач деактивований. Його можна активувати знову з попередніми ролями.",
          "reactivateInstead": "Активувати знову"
        },
        "toastSent": "Запрошення надіслано",
        "toastSentBody": "{email} · діє до {at, date, ::dd.MM.yyyy HH:mm}",
        "toastNotDelivered": "Запрошення створено, але лист не надіслано",
        "toastNotDeliveredBody": "Спробуйте «Надіслати повторно» в картці користувача."
      },
      "drawer": {
        "title": "Користувач",
        "close": "Закрити картку користувача",
        "moreActions": "Інші дії",
        "copyEmail": "Скопіювати email",
        "auditLink": "Усі дії в журналі",
        "tabsLabel": "Розділи картки користувача",
        "tabProfile": "Профіль і ролі",
        "tabHistory": "Історія",
        "lastLogin": "Останній вхід: {at, date, ::dd.MM.yyyy HH:mm}",
        "rolesTitle": "Ролі та вертикалі",
        "rolesInactive": "Ролі неактивні, поки користувача деактивовано.",
        "editRoles": "Змінити ролі",
        "noRoles": "Ролей немає — користувач бачить лише «Профіль».",
        "priorityTitle": "Пріоритет тімліда",
        "priorityValue": "{vertical}: П{priority}",
        "priorityNotSet": "{vertical}: пріоритет не задано",
        "toPriorities": "Пріоритети тімлідів",
        "securityTitle": "Безпека входу",
        "mfaLabel": "Двофакторна автентифікація",
        "mfaRequiredRole": "Обовʼязкова для ролей Адміністратор і Фінансист.",
        "mfaOptionalRole": "Необовʼязкова для ролей цього користувача.",
        "mfaReset": "Скинути 2FA",
        "inviteTitle": "Запрошення",
        "inviteSent": "Надіслано: {at, date, ::dd.MM.yyyy HH:mm}",
        "inviteExpires": "Діє до: {at, date, ::dd.MM.yyyy HH:mm}",
        "inviteExpired": "Прострочене з {at, date, ::dd.MM.yyyy HH:mm}",
        "inviteRevoked": "Відкликано: {at, date, ::dd.MM.yyyy HH:mm} · {name}",
        "inviteResentCount": "Надсилалося повторно: {count}",
        "resend": "Надіслати повторно",
        "revoke": "Відкликати",
        "deactivate": "Деактивувати",
        "reactivate": "Активувати знову",
        "historyEmpty": "Подій ще немає.",
        "reasons": {
          "selfDeactivate": "Не можна деактивувати власний обліковий запис.",
          "lastAdmin": "Це останній активний адміністратор. Спершу призначте ще одного.",
          "selfMfa": "Свою 2FA ви не можете скинути — це робить інший адміністратор.",
          "noMfa": "У користувача немає налаштованої 2FA."
        }
      },
      "rolesDialog": {
        "title": "Ролі — {name}",
        "description": "Зміни діють одразу, повторний вхід не потрібен.",
        "added": "Буде додано:",
        "removed": "Буде знято:",
        "lastRoleWarning": "У користувача не залишиться ролей — він бачитиме лише «Профіль».",
        "invitedNoRoles": "Без ролей запрошення стане недійсним.",
        "submit": "Зберегти зміни",
        "confirmTitle": "Зняти ролі?",
        "confirmBody": "{name} втратить доступ, який давали ці ролі, з наступної дії в системі:",
        "confirmSubmit": "Зняти та зберегти",
        "toast": "Ролі оновлено",
        "toastBody": "Зміни вже діють — повторний вхід не потрібен."
      },
      "deactivateDialog": {
        "title": "Деактивувати користувача: {name}?",
        "body": "Користувач не зможе увійти. Історія залишиться.",
        "sessions": "Усі його сесії завершаться протягом хвилини.",
        "roles": "Ролі збережуться неактивними — їх можна відновити.",
        "reasonLabel": "Причина (необовʼязково)",
        "reasonHint": "Бачать лише адміністратори в журналі дій.",
        "reasonTooLong": "Не більше 500 символів.",
        "submit": "Деактивувати",
        "toast": "{name}: деактивовано"
      },
      "reactivateDialog": {
        "title": "Активувати знову: {name}?",
        "body": "Користувач зможе входити. Оберіть ролі, які відновити.",
        "rolesLabel": "Попередні ролі",
        "noPreviousRoles": "Попередніх ролей немає — призначте ролі після активації.",
        "submit": "Активувати",
        "toast": "{name}: знову активний"
      },
      "revokeDialog": {
        "title": "Відкликати запрошення: {name}?",
        "body": "Посилання з листа перестане діяти, і користувач не зможе прийняти запрошення.",
        "submit": "Відкликати",
        "toast": "Запрошення відкликано"
      },
      "resend": {
        "toast": "Запрошення надіслано повторно",
        "toastBody": "Попереднє посилання більше не діє. Нове діє до {at, date, ::dd.MM.yyyy HH:mm}."
      },
      "mfaResetDialog": {
        "title": "Скинути 2FA: {name}?",
        "body": "Усі пристрої 2FA буде видалено, а всі сесії користувача — завершено. Під час наступного входу він налаштує 2FA знову. Ми повідомимо його листом.",
        "reasonLabel": "Причина",
        "reasonHint": "Наприклад, утрачено телефон. Запис потрапить у журнал дій.",
        "reasonTooShort": "Опишіть причину — щонайменше 10 символів.",
        "reasonTooLong": "Не більше 500 символів.",
        "submit": "Скинути 2FA",
        "incomplete": "2FA скинуто не повністю. Спробуйте ще раз.",
        "toast": "2FA скинуто",
        "toastBody": "{name} налаштує її під час наступного входу."
      }
    },
    "verticals": {
      "metaTitle": "Вертикалі",
      "title": "Вертикалі",
      "subtitle": "Напрями бізнесу. Ролі, вакансії й кандидати належать вертикалі.",
      "create": "Створити вертикаль",
      "columns": {
        "name": "Назва",
        "users": "Користувачі",
        "createdAt": "Створено",
        "actions": "Дії"
      },
      "usersCount": "{count, plural, =0 {Немає користувачів} one {# користувач} few {# користувачі} many {# користувачів} other {# користувача}}",
      "usersLink": "Показати користувачів вертикалі «{name}»",
      "rename": "Перейменувати",
      "history": "Історія змін",
      "permanentNote": "Вертикалі не деактивуються й не видаляються. Назву можна змінити — стара залишиться в історії.",
      "empty": {
        "title": "Вертикалей ще немає",
        "description": "Створіть першу вертикаль, щоб призначати ролі."
      },
      "dialog": {
        "createTitle": "Нова вертикаль",
        "renameTitle": "Перейменувати вертикаль",
        "currentName": "Поточна назва: {name}",
        "nameLabel": "Назва",
        "nameHint": "Від 2 до 50 символів, унікальна.",
        "renameNote": "Нова назва одразу зʼявиться всюди: у ролях, фільтрах і картках. Стара залишиться в історії.",
        "createSubmit": "Створити",
        "renameSubmit": "Перейменувати",
        "errors": {
          "required": "Введіть назву.",
          "tooShort": "Щонайменше 2 символи.",
          "tooLong": "Не більше 50 символів.",
          "duplicate": "Вертикаль з такою назвою вже існує.",
          "unchanged": "Назва не змінилася."
        }
      },
      "toastCreated": "Вертикаль «{name}» створено",
      "toastRenamed": "Вертикаль перейменовано: «{from}» → «{to}»"
    },
    "audit": {
      "metaTitle": "Журнал дій",
      "title": "Журнал дій",
      "subtitle": "Усі зміни та входи. Записи не можна змінити чи видалити, вони зберігаються 3 роки.",
      "views": {
        "label": "Вигляд журналу",
        "all": "Усі дії",
        "security": "Входи та безпека"
      },
      "filters": {
        "period": "Період",
        "periodToday": "Сьогодні",
        "period7": "Останні 7 днів",
        "period30": "Останні 30 днів",
        "periodCustom": "Свій період",
        "periodValue": "{from, date, ::dd.MM.yyyy} – {to, date, ::dd.MM.yyyy}",
        "periodHint": "Дати за київським часом",
        "periodTooLong": "Оберіть період не довший за рік.",
        "actor": "Хто",
        "actorSearch": "Пошук за ПІБ або email",
        "action": "Дія",
        "entityType": "Обʼєкт",
        "entity": "Обʼєкт: {label}",
        "result": "Результат"
      },
      "columns": {
        "time": "Час",
        "actor": "Хто",
        "action": "Дія",
        "entity": "Обʼєкт",
        "result": "Результат",
        "ip": "IP"
      },
      "time": "{at, date, ::dd.MM.yyyy HH:mm:ss}",
      "result": {
        "SUCCESS": "Успішно",
        "DENIED": "Відмовлено"
      },
      "actorUnknown": "Невідомий користувач",
      "entityLabel": "{type} · {label}",
      "entityTypes": {
        "user": "Користувач",
        "user_invite": "Запрошення",
        "vertical": "Вертикаль",
        "settings": "Налаштування"
      },
      "actionGroups": {
        "users": "Користувачі",
        "security": "Входи та безпека",
        "verticals": "Вертикалі",
        "settings": "Налаштування"
      },
      "actions": {
        "auth.login_succeeded": "Успішний вхід",
        "auth.login_failed": "Невдала спроба входу",
        "auth.logged_out": "Вихід",
        "auth.session_revoked": "Сесію завершено",
        "auth.mfa_challenge_failed": "Невірний код 2FA",
        "auth.mfa_locked": "Вхід із кодом 2FA заблоковано",
        "user.mfa_enrolled": "2FA налаштовано",
        "user.mfa_reset": "2FA скинуто",
        "user.invited": "Запрошено користувача",
        "user.invite_accepted": "Запрошення прийнято",
        "user.invite_resent": "Запрошення надіслано повторно",
        "user.invite_revoked": "Запрошення відкликано",
        "user.activated": "Користувача активовано",
        "user.profile_updated": "Змінено імʼя",
        "user.role_assigned": "Призначено роль",
        "user.role_removed": "Знято роль",
        "user.deactivated": "Користувача деактивовано",
        "user.reactivated": "Користувача активовано знову",
        "vertical.created": "Створено вертикаль",
        "vertical.renamed": "Перейменовано вертикаль",
        "vertical.tl_priority_changed": "Змінено пріоритет тімліда"
      },
      "actionUnknown": "Інша дія ({code})",
      "reasons": {
        "RATE_LIMITED": "Забагато спроб",
        "CODE_INVALID": "Невірний код",
        "INVITE_INVALID": "Недійсне запрошення",
        "MFA_RESET_INCOMPLETE": "2FA скинуто не повністю",
        "unknown": "Код причини: {code}"
      },
      "fields": {
        "roles": "Ролі",
        "fullName": "ПІБ",
        "name": "Назва",
        "reason": "Причина",
        "priority": "Пріоритет",
        "removedFactors": "Видалено пристроїв 2FA",
        "inviteId": "Запрошення",
        "method": "Спосіб входу"
      },
      "detail": {
        "title": "Запис журналу",
        "close": "Закрити запис",
        "time": "Час",
        "timeKyiv": "{at, date, ::dd.MM.yyyy HH:mm:ss} (Київ)",
        "timeUtc": "UTC: {at}",
        "actor": "Хто",
        "actionCode": "Код дії",
        "result": "Результат",
        "reason": "Причина відмови",
        "entity": "Обʼєкт",
        "openEntity": "Відкрити",
        "entityHistory": "Усі дії з цим обʼєктом",
        "ip": "IP-адреса",
        "device": "Пристрій",
        "userAgent": "User-Agent",
        "requestId": "ID запиту",
        "changes": "Зміни",
        "field": "Поле",
        "before": "Було",
        "after": "Стало",
        "emptyValue": "—",
        "noChanges": "Запис без змін даних.",
        "details": "Подробиці",
        "showJson": "Показати JSON",
        "hideJson": "Сховати JSON"
      },
      "empty": {
        "title": "Записів не знайдено",
        "description": "За цей період і фільтри дій немає."
      }
    }
  }
}
```
Shared keys reused, not duplicated: `common.roles.*`, `common.roleInVertical`, `common.retry`, `states.errorTitle/errorDescription`, `errors.notFoundDescription`, `profile.methods.*` (sign-in method in audit details).

---

## 6. Permission gates (`server/authz/permissions.ts`; all four are GLOBAL + `mfa: true` → aal2 only)

| UI element / action | Permission | API | In code |
|---|---|---|---|
| SettingsNav item «Користувачі та ролі», list, drawer, Історія tab | `settings.users.manage` | `GET /api/v1/users`, `GET /users/{id}`, `GET /users/{id}/events` | build |
| «Запросити» | `settings.users.manage` | `POST /invites` | ✔ `createInvite` |
| «Надіслати повторно» / «Відкликати» | `settings.users.manage` | `POST /invites/{id}/resend`, `POST /invites/{id}/revoke` | build |
| «Змінити ролі» | `settings.users.manage` | `PUT /users/{id}/roles` (+ `version`) | build |
| «Змінити email» (not-activated users only, D69) | `settings.users.manage` | `PUT /users/{id}/invite/email` (proposed, §1.11) | build |
| «Деактивувати» / «Активувати знову» | `settings.users.manage` | `POST /users/{id}/deactivate`, `/reactivate` | build |
| «Скинути 2FA» | `settings.users.manage` (server refuses self: 403) | `POST /users/{id}/mfa-reset` | ✔ `resetUserMfa` |
| Drawer «Пріоритет тімліда» + link | `settings.priorities.manage` (block hidden without it) | from `GET /users/{id}` | build |
| RoleMatrix columns | `vertical.read` | `GET /verticals` | ✔ (names only) |
| SettingsNav «Вертикалі», list, create, rename | `settings.verticals.manage` | `GET /verticals?admin` (+ users count, createdAt, version), `POST /verticals`, `PATCH /verticals/{id}` | build |
| SettingsNav «Журнал дій», list, detail, «Усі дії в журналі» / «Історія змін» links | `audit.read` | `GET /audit`, `GET /audit/{id}`, actor lookup | build |
| Audit «Відкрити» on a user / vertical | `settings.users.manage` / `settings.verticals.manage` | — | — |

Derived UI rules (server enforces the same; UI only explains): self → no deactivate / no 2FA reset / no ADMIN removal; last active Admin → no deactivate / no ADMIN removal (D45); invited (never activated) → no deactivate, no 2FA reset; Відкликано → no resend/revoke. The `/users/{id}` payload should return `allowedActions[]` + `disabledReasons{}` so the UI holds no rules (screens.md §0).

---

## 7. Accessibility
- **Tables:** real `<table>` semantics with `<caption class="sr-only">` («Користувачі», «Вертикалі», «Записи журналу»); virtualized rows keep `aria-rowcount`/`aria-rowindex`. Row = one tab stop (roving `tabindex`), `Enter` opens drawer/detail, `⋯` is a separate button `aria-label="Дії: {name}"`. `j/k` row navigation.
- **Drawer/detail Sheets:** `role="dialog"`, labelled by the name/action heading; focus moves to the heading on open, returns to the originating row on close; `Esc` closes. Opening via URL focuses the heading.
- **RoleMatrix:** `<table>` with `<th scope="col">` verticals and `<th scope="row">` roles; each checkbox has an accessible name «{role} · {vertical}» (not just the column); global rows «Адміністратор · Усі вертикалі». Disabled checkbox (self/last Admin) stays focusable via DisabledReason wrapper; reason in `aria-describedby`. Selected summary `aria-live="polite"`. Matrix group error linked with `aria-describedby` on the `fieldset` (legend «Ролі та вертикалі»).
- **Status / 2FA / result** never colour-only: icon + text. «Відмовлено» chip text, not just red.
- **Disabled actions** (DisabledReason): tooltip on hover/focus on desktop; visible helper text under the button on touch.
- **Forms:** visible labels, required marked «*» + `aria-required`; errors under fields via `aria-describedby`, first invalid focused on submit; counters announced only when over limit.
- **AlertDialogs:** initial focus on «Скасувати» (destructive actions), confirm is filled destructive; consequence text is the dialog description (`aria-describedby`).
- **Toasts** (Sonner): `role="status"`; errors `role="alert"`; never the only place a validation error appears.
- **Filters:** each select has a visible label; FilterChip remove buttons «Прибрати фільтр «Гемблінг»»; result count announced politely after filtering («Показано 8 з 240»).
- **Dates:** `<time datetime="ISO">` with Kyiv-formatted text; IP and request ID in `font-mono` with `lang="en"`/`translate="no"`.
- **Ukrainian overflow:** «Керівник рекрутингу · Гемблінг», «Запрошення прострочене», «Обовʼязкова — не налаштована» checked at 1440 (cell wraps to 2 lines max) and 390 (chips wrap). Emails `overflow-wrap:anywhere`.
- Mobile touch targets ≥ 44; sticky footers clear the bottom nav + safe area.

---

## ⚠ OPEN / gaps
- ~~**U1** Admin email change~~ — **resolved by D69** (owner 2026-11-01, Q-153): Phase 1 only for not-activated users (revoke invite + new 72 h invite to the corrected address, current roles); activated users → Phase 5 (ends sessions). Design: §1.3 (menu visibility) + §1.11 (dialog, states, strings).
- **U2** «Не доставлено» status (ROLE-05-1 edge case) needs a stored delivery status; `createInvite` only returns `delivered` at send time and `user_invite` has no delivery column. Glossary already defines «Надіслано / Доставлено / Не доставлено». Decide: persist send result (and later provider webhooks) or show only the toast.
- **U3** The 409 `USER_DEACTIVATED` from `POST /invites` carries no user id, so «Активувати знову» from the invite dialog cannot open the right user. API should return `userId` in the conflict details (Admin-only endpoint, no enumeration risk).
- ~~**U4** Re-inviting after «Відкликати»~~ — resolved by D70: «Запросити знову» (§1.7), dialog answers `INVITE_REVOKED`.
- **U5** 2FA column in a 10k-user list needs factor counts without one Supabase Admin API call per row (e.g. SQL join on `auth.mfa_factors` or a cached counter) — architect/perf decision; otherwise drop the column from the list and keep it in the drawer.
- **U6** Deactivation reason length limit is not specified (story: «reason optional»). Wireframe assumes 500 to match the 2FA reason; confirm.
- **L1** Audit PII separation: STORY-AUD-1 says PII in before/after is stored separately for purge, but `audit_log` has no PII side table and `resetUserMfa` writes the free-text reason into `audit_log.after`. Security/DB to resolve before the viewer shows `after` as-is.
- **L2** Entity labels in the audit viewer: resolving current user/vertical names is assumed fine for Admin; for Phase 2+ candidate entities, showing names would surface PII that purge must also hide — confirm «ID only» rule.
- **L3** No maximum audit period in the stories; the 1-year cap is a perf guard only (index on `occurred_at`). Confirm or remove.
- **L4** Entity type inconsistency: seed writes `entity_type = 'app_user' / 'user_invite'`, services write `'user'`. The Обʼєкт filter and labels need one vocabulary (DB engineer).
- **C1** Contradictions with D34/Q-37 (no vertical deactivation) remain in other docs: `screens.md` §0 rule «Read-only vertical … Вертикаль деактивована» and `glossary.md` row «Deactivate vertical / Деактивувати вертикаль». Recommend deleting both. (S-14 table row corrected in this change; it also listed a polygraph-review toggle that D36 removed.)
- **C2** `messages/uk.json` has two role-name sets: `common.roles.HR` = «HR-менеджер» (D27) vs `auth.roles.HR` = «HR» (shown on «Прийняти запрошення»). Settings uses `common.roles`; the invite screen should too.
- **C3** Story ROLE-05-4 status list (Запрошено / Активний / Деактивовано / Відкликано) has no expired state, while ROLE-05-3 treats expired invites separately (resend allowed). Wireframe adds the derived display status «Запрошення прострочене» (no new behaviour).
