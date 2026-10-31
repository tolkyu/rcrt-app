# Wireframe — Кандидати (Канбан / Таблиця + drawer) [UI-01, UI-02, CAND-01, CAND-04, D20, D52]

Reference: `reference/05-candidates-kanban.webp`. Adoption: A-04, A-08, A-11, A-12, A-22, A-23, A-25, A-27, A-37.

## Desktop 1440 — Head Recruiter, light, drawer open

```
┌ shell ───────────────────────────────────────────────────────────────────────────────────────────────┐
│ Кандидати                                                              [+ Додати кандидата] [⋯]      │
│ Керуйте воронкою найму та відстежуйте всіх кандидатів у команді                                      │
│ [▦ Канбан | ☰ Таблиця]                                                                               │
│ [Етап ▾][Вакансія ▾][Посада ▾][Вертикаль ▾][Відповідальний ▾][Джерело ▾][Теги ▾]  Резерв [◯—]         │
│ ┌● Новий 6──────┐┌▶ В роботі 8───┐┌👥 У тімліда 4──┐┌🎥 Співбесіда 6┐ → ┌ drawer 400 ─────────────────┐│
│ │┌────────────┐ ││┌────────────┐ ││┌────────────┐ ││┌────────────┐ │   │ [‹]                     [×] ││
│ ││(ph) Андрій ⋯│ │││(ph) Олександр⋯│││(ph) Тарас  ⋯│││(ph) Софія  ⋯│ │   │ (photo 64) Софія Іваненко   ││
│ ││Мельник     │ │││Бойко       │ │││Шевченко    │ │││Іваненко    │ │   │ Frontend Developer          ││
│ ││Frontend Dev│ │││Frontend Dev│ │││Backend Dev │ │││Frontend Dev│ │   │ [Інформація][Історія][Файли]││
│ ││Медіабаєр·ВП│ │││…           │ │││…           │ │││…           │ │   │ Контакти (role-gated, A-37) ││
│ ││in LinkedIn │ │││Work.ua     │ │││in LinkedIn │ │││Рекомендація│ │   │ ✉ sofia.ivanenko@gmail.com  ││
│ ││◷ Сьогодні, 11:20 (ОК)│ │││…│ │││…│ │││…│ │   │ ☎ +380 67 123 45 67         ││
│ │└────────────┘ ││└────────────┘ ││└────────────┘ ││└────────────┘ │   │ 📍 Київ, Україна            ││
│ │ … cards       ││ …             ││ …             ││ …             │   │ in LinkedIn-профіль ↗       ││
│ │+ Додати кандидата│              ││               ││               │   │ Поточна вакансія            ││
│ └───────────────┘└───────────────┘└───────────────┘└───────────────┘   │ ┌ Frontend Developer › ┐   ││
│   … then Поліграф · Офер · Випробування · Найнято in the same row  →    │ └──────────────────────┘   ││
│                                                                         │ Етап у воронці              ││
│                                                                         │ [🎥 Співбесіда        ▾]     ││ = MoveToMenu
│                                                                         │ Відповідальний рекрутер     ││
│                                                                         │ (ОК) Оксана Кравець         ││
│                                                                         │ Тімлід (ВП) Василь Петренко ││
│                                                                         │ Наступна подія              ││
│                                                                         │ ┌📅 Співбесіда з тімлідом ⋯┐ ││
│                                                                         │ │ Сьогодні, 14:30–15:30    │ ││
│                                                                         │ │ Google Meet              │ ││
│                                                                         │ └──────────────────────────┘ ││
│                                                                         │ Теги (React)(TypeScript)[+ Додати тег]││
│                                                                         │ [Перейти до профілю] [Редагувати]││
│                                                                         └─────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Board:** one horizontal row, 8 columns (Новий → Найнято), w 272, horizontal scroll with shadow edges (A-27). Columns are role-scoped as in S-03 (HR/HHR: Поліграф · Офер · Випробування · Найнято; TL: from У тімліда). The terminal «Найнято» column is limited to the last 30 days by default (column header link «Показати всі» → table filtered by stage), so it doesn't grow without limit.
- **Card:** per `dashboard.md` anatomy (A-23). Source shown as a label; «Рекомендація» is a source value (A-11). No years of experience (A-22), no «Онлайн» (A-08).
- **Drawer:** opens on card click, stays while the board scrolls; ‹ › at top go to previous/next card in the column; Esc closes. Tabs: Інформація · Історія · Файли (no «Оцінки», A-12). «Етап у воронці» is a MoveToMenu trigger showing only allowed targets; picking one opens the RequiredDataDialog (never a silent change). TL drawer: no email/phone, LinkedIn visible (D20, D48).
- **Резерв switch:** = filter «Лише резерв» (S-07). Pool candidates have no stage, so turning it on switches the view to Таблиця with a hint «Кандидати в резерві не мають етапу».
- **Table view:** columns per `screens.md` S-07 (virtualized), same filters, same drawer.

## Mobile 390
```
┌──────────────────────────────┐
│ Кандидати                    │
│ [▦ Канбан | ☰ Таблиця]        │
│ [🔍 Пошук кандидатів…]   [⚙] │
│ ● Новий                   6 ›│  stage list, stage-tinted rows
│ ▶ В роботі                8 ›│
│ 👥 У тімліда              4 ›│
│ 🎥 Співбесіда             6 ›│
│ 📋 Поліграф               3 ›│
│ 📄 Офер                   2 ›│
│ 📊 Випробування           4 ›│
│ ✓ Найнято                12 ›│
├──────────────────────────────┤
│ bottom nav (Кандидати active)│
└──────────────────────────────┘
```
Tap stage → card list of that stage; card tap → S-09; card ⋯ → «Перемістити до…» (no DnD on touch).

## States
- Loading: columns with 3 skeleton cards each; drawer skeleton (avatar + 6 lines).
- Empty board: «Кандидатів ще немає» + «Додати кандидата» (roles that can create).
- Empty column: dashed drop zone «Немає кандидатів».
- Filtered empty: «Нічого не знайдено за фільтрами» [Скинути фільтри].
- Drawer error: SectionError inside drawer; board unaffected.
