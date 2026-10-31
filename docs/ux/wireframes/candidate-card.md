# Wireframe — Картка кандидата [CAND-04, HIST-01..03, PIPE, PROB, BONUS-14]

Reference: `reference/04-candidate-card.webp`. Adoption: A-03, A-04, A-05, A-17, A-18, A-19, A-20, A-36, A-37, A-43, A-44, A-45.

## Desktop 1440 — Recruiter, application on TL_INTERVIEW, light

```
┌ shell ───────────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Кандидати › Андрій Мельник                                                                        │
│ ┌──────┐ Андрій Мельник                                  [⋯] [↗ Поділитися] [Перемістити до…  ▾]     │
│ │photo │ Медіабаєр, Parimatch   (● Активний) [З бота]                                                │
│ │  96  │ ✉ andrii.melnyk@gmail.com   ☎ +380 67 123 45 67   📍 Київ, Україна   in LinkedIn ↗            │
│ └──────┘   (contacts row role-gated: TL sees LinkedIn only; HR from Polygraph)                        │
│ ┌Вакансія──────────────┬Джерело──────────┬Відповідальний────────┬Зарплатні очікування┬Теги───────────────┐│
│ │[</>] Медіабаєр —     │in LinkedIn      │(ОК) Оксана Кравець   │($) 2 500 $         │(Facebook)(Middle) ││
│ │Facebook · Гемблінг · │3 листопада 2026 │Рекрутер · Гемблінг   │                    │[+ Додати тег]     ││
│ │Віддалено             │                 │                      │                    │                   ││
│ └──────────────────────┴─────────────────┴──────────────────────┴────────────────────┴───────────────────┘│
│ Кандидатури: [● Медіабаєр — Facebook · Василь П. · Співбесіда] [Медіабаєр — FB · Тарас К. · Передано далі]│  (only if > 1)
│                                                                                                       │
│   (✓)────────(✓)────────(✓)────────(🎥)────────(📋)────────(📄)────────(📊)────────(✓)                   │
│  Новий     В роботі   У тімліда  Співбесіда   Поліграф     Офер    Випробування  Найнято               │
│  11.11     12.11      13.11      15.11                                                                   │
│  О. Кравець О. Кравець Василь П.  Василь П.                                                              │
│                                                                                                       │
│ ┌ Stage action panel ────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Співбесіда з тімлідом · 15.11, 14:00–15:00 · [Приєднатися ↗]          [Неявка] (role actions)      │ │
│ └────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│ [Історія] [Профіль] [Резюме] [Файли (3)] [Коментарі (8)] [Бонус]      (underline tabs)                │
│ ┌ Історія взаємодій (8/12) ─────────────────────────────────────┐ ┌ Наступна подія  (Заплановано) ──┐ │
│ │ Сьогодні   [📅] Співбесіда з тімлідом       [Приєднатися] [⋯] │ │ [📅] Співбесіда з тімлідом      │ │
│ │ 15.11      14:00–15:00 · Google Meet                          │ │ 📅 Сьогодні, 15 листопада       │ │
│ │            (ВП) Василь Петренко · Тімлід · Гемблінг           │ │ ◷ 14:00–15:00 (1 год)          │ │
│ │ 14.11      [💬] Коментар                                  [⋯] │ │ 📍 Google Meet                  │ │
│ │ 16:42      Кандидат дуже впевнено відповідав…                 │ │ Учасники                        │ │
│ │            (ОК) Оксана Кравець                                │ │ (ВП) Василь Петренко · Тімлід   │ │
│ │ 13.11      [👍] Тімлід прийняв кандидата  (● Прийнято)    [⋯] │ │ (АМ) Андрій Мельник · Кандидат  │ │
│ │ 11:20      Сильний кандидат, рекомендую співбесіду.           │ │ [📅 Додати в календар (.ics)][⋯]│ │
│ │ 12.11      [📄] Завантажено резюме  [PDF Andrii_CV.pdf 2,4 МБ ⬇]│ └─────────────────────────────────┘ │
│ │ 11.11      [+] Кандидата додано · Джерело: LinkedIn           │ ┌ Приватні нотатки  (Phase 3) ───┐ │
│ │ [Показати ще]   Фільтр: [Усі][Етапи][Поля][Файли][Коментарі]  │ │ ┌ yellow-soft note ──────────┐ │ │
│ │                 [Перенесення][Бонуси] Автор: [Усі ▾]          │ │ │ Має досвід в e-commerce…   │ │ │
│ └───────────────────────────────────────────────────────────────┘ │ └────────────────────────────┘ │ │
│                                                                   │ Оксана Кравець · 14.11.2026    │ │
│                                                                   │ Бачите лише ви  [+ Нотатка]    │ │
│                                                                   └────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Header:** photo (✅ A-04, optional; initials fallback) with no presence dot (A-08). Person status (A-36): «Активний» if ≥ 1 active application, else «Резерв». Actions: ⋯ (Редагувати, Перенести в іншу вертикаль, Видалити…), «Поділитися» copies the URL (✅ A-05, toast «Посилання скопійовано»), «Перемістити до… ▾» = MoveToMenu (allowed targets only).
- **Info strip:** bordered row of cells (radius 12). Salary = one amount + currency (A-20), shown only to roles allowed by §2.3.
- **Right column** (4/12, sticky): «Наступна подія» (screening / interview / polygraph, whichever is next; hidden if none). «Приватні нотатки» is visible only to the author and never appears in Історія (✅ A-03).
- **Feed rows:** date column (day + time) · icon tile (event-type colour) · title · body · actor (avatar + name + role · vertical) · ⋯ (only «Копіювати посилання»; append-only).

## Timeline stepper (HIST-02; 8-step variant ⏳ A-18)

| Step | Stage(s) | Caption when reached (date + actor always) |
|---|---|---|
| Новий | NEW | date · creator |
| В роботі | IN_WORK | date · recruiter · «Скринінг ↗Meet» in tooltip |
| У тімліда | SUBMITTED_TO_TL | date sent · «Прийнято 07.10» / «Відхилено» |
| Співбесіда | TL_INTERVIEW | date ↗Meet · TL · result |
| Поліграф | POLYGRAPH | place · date · result · PDF icon (permitted roles) |
| Офер | OFFER | salary (if permitted) · version · outcome |
| Випробування | PROBATION | start–end · «День X з Y» (ProbationProgress in tooltip/panel) |
| Найнято | PROBATION_PASSED | date · who («Достроково» tag) |

- Fallback if the owner keeps HIST-02 literally: merge «У тімліда» into «Співбесіда» (7 steps). The layout is unchanged.
- Step states per `design-system.md` §1.5. Terminal REJECTED/WITHDRAWN/PROBATION_FAILED: the failed step shows a red ✕ with the reason; later steps are hidden behind «—».
- Routed application: banner above the stepper «Передано від Тараса Коваля (П1) · 13.10 · причина: Профіль не підійшов тімліду».
- «Очікує перенесення» on Співбесіда: red-soft pill under the step.
- Admin force move: step tagged «Примусово» with a tooltip comment.
- Steps are buttons that filter the feed; `aria-current="step"`.

## Stage action panel by stage × role

| Stage | Recruiter | TL | HR | Head HR | Head Rec / Admin |
|---|---|---|---|---|---|
| Новий | Взяти в роботу (D-01) · Відмовити · Видалити | — | — | — | same as Rec |
| В роботі | Передати тімліду (D-02) · Відмовити · Самовідвід | — | — | — | same |
| У тімліда | «Очікує рішення тімліда» (info) / after accept: Призначити співбесіду (D-04) | Прийняти · Відхилити | — | — | same as Rec |
| Співбесіда | Неявка (D-08) · (Результат ⚠ OPEN-S6) | Перенести (D-06) · Результат (D-05) | — | — | + Повернути на попередній |
| Поліграф | (info: date / result) | (info) | Призначити (D-09) · Внести результат (D-10) | Призначити HR · Перевірити (D-10a) | — / Admin all |
| Офер | (info: salary, status) | (info) | Створити чернетку · Відповідь кандидата | Створити · Надіслати · Відповідь · Повернути на попередній | Admin all |
| Випробування | (info) | Завершити достроково (≥30) · Не пройдено | Підтвердити перший день | Завершити · Завершити з винятком · Не пройдено | Admin all |

Disabled examples (tooltip; helper text on mobile):
- «Завершити достроково» — «Дострокове завершення доступне з 30-го дня — з 03.12.2026.»
- «Зберегти результат» (поліграф) — «Спершу завантажте висновок (PDF).»
- «Надіслати офер» (HR) — «Надіслати офер може лише керівник HR.»
- «Видалити» (Recruiter, ≥ Співбесіда) — «Рекрутер може видалити кандидата лише до співбесіди з тімлідом.»
- «Призначити співбесіду» before accept — «Спершу тімлід має прийняти кандидата.»

## Tab «Бонус» (Admin, Head Recruiter in vertical, Recruiter own)
```
Схема: Стандартна 30/70 · Зафіксовано 20.10.2026 · База: Фіксована сума 1 000 $
Множник для термінових ×1,25 · Курс 1 $ = 41,20 ₴
┌────────┬──────────────────┬───────────┬─────────────┬──────────────┬─────────────────┐
│ Транш  │ Кому             │ Сума      │ Статус      │ Умова        │ Дата            │
│ 1 · 30%│ Оксана Кравець   │ 375 $     │[Нараховано] │ Старт ВТ     │ 03.11.2026      │
│ 2 · 70%│ Оксана Кравець   │ 875 $     │[Заплановано]│ Проходження  │ очік. 01.02.2027│
└────────┴──────────────────┴───────────┴─────────────┴──────────────┴─────────────────┘
[Розподіл бонусу] (HRec) [Коригування] (Admin)
```
- Hidden tab (not disabled) for HR, Head HR, TL. Flags: «Власна рекомендація — потребує погодження адміністратора», «Колишній працівник < 12 міс. — бонус не нараховується».

## Mobile 390 — Team Lead, interview today

```
┌──────────────────────────────┐
│ ‹        Кандидат        [⋮] │
│ (photo) Андрій Мельник       │
│         Медіабаєр, Parimatch │
│         (● Активний)         │
│  [in]  [⋯]                   │  contact icon buttons (TL: LinkedIn only)
│ [Інфо][Історія][Резюме][Коментарі]│
│ (✓)─(✓)─(✓)─(🎥)─(📋)         │  compact stepper: current ±2, scrolls
│ Новий … Співбесіда Поліграф  │
│ Вакансія                     │
│ [</>] Медіабаєр — Facebook   │
│ …                            │
├──────────────────────────────┤
│ [   Дії з кандидатом   ▴   ] │  sticky 48 px (A-45) → sheet with allowed actions
├──────────────────────────────┤
│ bottom nav                   │
└──────────────────────────────┘
```

## Interview result sheet (TL, mobile; A-17)
```
┌──────────────────────────────┐
│ ─── handle                   │
│ Результат співбесіди     [×] │
│ Андрій Мельник · 15.11, 14:00│
│ ┌ (✓) Пройдено ─────────────┐│  green-soft option card, radio
│ │ Кандидат перейде на поліграф││
│ └───────────────────────────┘│
│ ┌ (✕) Не пройдено ──────────┐│  red-soft option card, radio
│ │ Кандидата буде передано:   ││  routing preview
│ │ Тарас Коваль · П1          ││
│ └───────────────────────────┘│
│ Відгук *                     │
│ [                          ] │  textarea, counter 0/2000 ⚠ OPEN-C1 (min length)
│ [        Підтвердити       ] │  48 px, disabled until option + feedback
└──────────────────────────────┘
```
- No «Потрібно ще інтерв'ю» option; another meeting = «Перенести» (RESCH-01).

## Mobile — Probation day 18 (TL)
- Sticky helper above the action button: «Дострокове завершення — з 03.12.2026 (30-й день)»; «Дії з кандидатом» sheet lists «Завершити достроково» disabled with the same reason and «Не пройдено» enabled.

## States
- Loading: header (circle 96 + 3 lines), info strip 5 cells, stepper 8 circles, action panel 1 line, feed 6 rows, right column 2 blocks.
- No applications (резерв): stepper replaced by «Кандидат у кадровому резерві» + [Подати на посаду] [Додати до вакансії].
- No next event: right column shows only «Приватні нотатки».
- Feed empty for filter: «Подій такого типу немає».
- CV preview error: «Не вдалося відкрити файл» [Завантажити].
- Purged: «Кандидат #1234 (видалено)», no PII or photo; stepper + feed actor names kept ⚠ OPEN-C2.

## ⚠ OPEN
C1 minimum feedback length for TL interview result · C2 what a purged stub shows (stages/dates only?).
