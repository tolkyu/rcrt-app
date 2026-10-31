# Wireframe — Налаштування › Пріоритети тімлідів (Admin) [ROUTE-01, ROUTE-02, ROUTE-07, ROUTE-09, D5]

## Desktop 1440

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
│  поліграфа   │ │ ⠿  [ — ]  (ІЛ) Ігор Литвин        1 відкрита вакансія  ⚠ OPEN-P1                 ││
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

## Interaction
- **Drag to reorder** (`⠿` handle) renumbers 0..n sequentially. **Number field** allows ties (e.g. two TLs = 0); tie rows show «Рівний пріоритет — спершу найстаріша вакансія».
- Keyboard: handle focus + `Alt+↑/↓`, or `[↑][↓]` buttons; live region «Тараса Коваля переміщено на позицію 1».
- Changes are batched; «Зберегти» opens confirm: «Нові пріоритети застосуються до наступних розподілів. Кандидати, які вже в роботі, не переміщуються.» ⚠ OPEN-P2.
- «Як це працює зараз» preview uses the server routing function on current open vacancies (skips Призупинені / Заповнені / Скасовані) — Admin sees the effect before saving (preview updates with unsaved order).
- Per-vacancy override: combobox of open vacancies in this vertical → integer; same field also on vacancy edit form (Admin only). Row shows both values; effective one bold.
- Vertical with auto-routing off: banner «Автоматичний розподіл вимкнено — рекрутер обирає наступного тімліда вручну. Пріоритети використовуються лише для сортування.» ⚠ OPEN-P3.
- Every save → Журнал дій + Історія affected vacancies ⚠ OPEN-P4.

## Mobile
Admin settings are desktop-first; at 390 px the list becomes cards with `[↑][↓]` buttons (no drag), override table becomes stacked cards.

## States
- Loading: tabs + 4 skeleton rows + preview block.
- No TLs in vertical: «У цій вертикалі ще немає тімлідів. Призначте роль у «Користувачі та ролі».» [Перейти].
- Save error: inline banner, order kept as edited, [Спробувати ще раз].
- Concurrent edit (409): «Пріоритети щойно змінив інший адміністратор.» [Оновити].

## ⚠ OPEN
P1 TL without priority — default value (last? excluded from routing?) · P2 effect of priority change on in-flight applications (ROUTE-10 "mid-flow priority change" — expected behaviour) · P3 meaning of priorities when auto-routing is off (ordering of manual choice list?) · P4 is a priority change a vacancy timeline event.
