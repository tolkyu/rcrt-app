# Wireframe — Вакансії (list + preview panel) [VAC-01..04, BONUS-16, D1, D19]

Reference: `reference/03-vacancies.webp`. Adoption: A-13, A-14, A-15, A-21, A-30, A-31, A-32.

Current first read increment: [`../phase-2-vacancies.md`](../phase-2-vacancies.md). The full target below includes later vacancy/candidate/bonus features; render their controls only with working data and actions.

## Desktop 1440 — Head Recruiter, light

```
┌ shell ───────────────────────────────────────────────────────────────────────────────────────────────┐
│ Вакансії                                                                       [+ Створити вакансію] │
│ Усі відкриті та закриті вакансії вашої команди                                                       │
│ [Вертикаль ▾] [Статус ▾] [Тімлід ▾] [Рекрутер ▾] [📅 Період] [Пріоритет ▾]                            │
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
│ │                                                                  ││ Пріоритет  Термінова   ││
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
