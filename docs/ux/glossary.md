# UX glossary (uk) — single source of terms

> Every UI string in `messages/uk.json` must use these terms. Code/enums stay English.
> Style: short, neutral, impersonal where gender is unknown («Співбесіду не пройдено», not «Не пройшов»). Sentence case. Polite «ви» in lower case. Typographic quotes «…». Apostrophe = `ʼ` (U+02BC) in words like «зʼявиться», «обовʼязковий» (never ASCII `'` — breaks search normalisation and looks wrong in Inter).
> Status: ⚠ OPEN items are listed at the end.

## 1. Domain objects

| English / enum                    | UI term (uk)                        | Usage note                                                                                   |
| --------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------- |
| Vertical                          | Вертикаль                           | Plural «Вертикалі». Filter label «Вертикаль».                                                |
| Full name                         | Імʼя та прізвище                    | Labels and search; do not use «ПІБ» when no patronymic is collected.                         |
| Position (catalog item)           | Посада                              | Catalog = «Довідник посад». Submit target: «Подати на посаду».                               |
| Vacancy                           | Вакансія                            | «Нова вакансія», «Запит на вакансію» (TL-created).                                           |
| Recruiter-initiated vacancy       | Вакансія від рекрутера              | Badge on vacancy without TL.                                                                 |
| Candidate                         | Кандидат                            | Person-level card.                                                                           |
| Application (candidate × vacancy) | Кандидатура                         | «Активні кандидатури», «Кандидатуру закрито». Never «заявка» (clashes with vacancy request). |
| Talent pool                       | Кадровий резерв                     | Candidates without active application.                                                       |
| Routing group                     | Група розподілу                     | Admin/settings only.                                                                         |
| Routing (auto)                    | Автоматичний розподіл               | Timeline: «Передано від Василя → Тарасу».                                                    |
| Sourcer                           | Сорсер                              | Tooltip: «Рекрутер, який першим привів кандидата».                                           |
| Owner (application)               | Відповідальний рекрутер             | Short label «Відповідальний».                                                                |
| Timeline (events)                 | Історія                             | Tab/section title. Stepper has no title.                                                     |
| Event                             | Подія                               | Feed filter «Тип події».                                                                     |
| Comment / mention                 | Коментар / згадка                   | «Згадати колегу через @».                                                                    |
| CV                                | Резюме                              | «Завантажити резюме», «Версія 2».                                                            |
| Consent to data processing        | Згода на обробку персональних даних | Short «Згода на обробку даних».                                                              |
| Duplicate                         | Можливий дублікат                   | Hidden-match copy: «Цей кандидат уже є в системі. Зверніться до керівника рекрутингу.»       |
| Merge                             | Обʼєднати                           | «Обʼєднати картки».                                                                          |
| Source channel                    | Джерело                             | Values: LinkedIn, Djinni, Telegram, «Рекомендація», «Інше».                                  |
| Former employee                   | Колишній працівник                  | Checkbox.                                                                                    |
| Self-referral                     | Власна рекомендація                 | Flag on bonus.                                                                               |
| Source = TELEGRAM_BOT             | З бота                              | Badge text exactly «З бота».                                                                 |
| Meet link                         | Посилання Google Meet               | Placeholder `https://meet.google.com/abc-defg-hij`.                                          |
| Notification                      | Сповіщення                          | Bell tooltip «Сповіщення».                                                                   |
| My tasks                          | Мої задачі                          | Dashboard block.                                                                             |
| Saved filter                      | Збережений фільтр                   | «Зберегти фільтр».                                                                           |
| Calendar                          | Календар                            | —                                                                                            |
| Statistics                        | Статистика                          | —                                                                                            |
| Archive                           | Архів                               | —                                                                                            |
| Settings                          | Налаштування                        | —                                                                                            |
| Audit log                         | Журнал дій                          | Admin.                                                                                       |

## 2. Roles

| Enum             | UI term             | Short (chips/avatars) |
| ---------------- | ------------------- | --------------------- |
| `ADMIN`          | Адміністратор       | Адмін                 |
| `HEAD_RECRUITER` | Керівник рекрутингу | Кер. рекрутингу       |
| `RECRUITER`      | Рекрутер            | Рекрутер              |
| `HEAD_HR`        | Керівник HR         | Кер. HR               |
| `HR`             | HR-менеджер         | HR                    |
| `TEAM_LEAD`      | Тімлід              | ТЛ                    |
| `FINANCE`        | Фінансист           | Фінансист             |

Role@vertical rendering: «Керівник рекрутингу · Гемблінг».

## 3. Pipeline stages (application)

| Enum                | Chip (short)  | Full / stepper label                  | Note                                                                                 |
| ------------------- | ------------- | ------------------------------------- | ------------------------------------------------------------------------------------ |
| `NEW`               | Новий         | Створено                              | Stepper step 1 «Створено».                                                           |
| `IN_WORK`           | В роботі      | В роботі (скринінг)                   | —                                                                                    |
| `SUBMITTED_TO_TL`   | У тімліда     | Передано тімліду                      | Sub-state after accept: «Прийнято тімлідом». Shown inside stepper step «Співбесіда». |
| `TL_INTERVIEW`      | Співбесіда    | Співбесіда з тімлідом                 | —                                                                                    |
| `POLYGRAPH`         | Поліграф      | Поліграф                              | —                                                                                    |
| `OFFER`             | Офер          | Офер                                  | —                                                                                    |
| `PROBATION`         | Випробування  | Випробувальний термін                 | Chip with days: «Випробування · 47 дн.».                                             |
| `PROBATION_PASSED`  | Найнято       | Випробувальний термін пройдено        | Stepper last step «Пройдено».                                                        |
| `REJECTED`          | Відмова       | Відмова                               | Always with reason.                                                                  |
| `REJECTED` (routed) | Передано далі | Відмова · передано наступному тімліду | Old application chip.                                                                |
| `WITHDRAWN`         | Самовідвід    | Кандидат відкликав кандидатуру        | —                                                                                    |
| `PROBATION_FAILED`  | Не пройшов ВТ | Випробувальний термін не пройдено     | Only place «ВТ» abbreviation allowed (chip width); tooltip gives full text.          |

Stepper labels: the mockup stepper uses the **chip labels** (Новий · В роботі · У тімліда · Співбесіда · Поліграф · Офер · Випробування · Найнято), 8 steps. That is ⏳ A-18. If the owner keeps HIST-02 literally, use 7 steps with «Створено» first and «Пройдено» last as in the column above.

Stage-action verbs: «Взяти в роботу», «Передати тімліду», «Призначити співбесіду», «Перемістити до…», «Повернути на попередній етап», «Примусово перемістити» (Admin, PIPE-02).

## 4. Vacancy statuses & priority

| Enum                                 | UI term                                                                                                                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DRAFT`                              | Чернетка                                                                                                                                                                    |
| `OPEN`                               | Відкрита                                                                                                                                                                    |
| `ON_HOLD`                            | Призупинена                                                                                                                                                                 |
| `FILLED`                             | Заповнена                                                                                                                                                                   |
| `CANCELLED`                          | Скасована                                                                                                                                                                   |
| Vacancy urgency (field, D94)         | Терміновість вакансії; filter «Терміновість» (never bare «Пріоритет»)                                                                                                       |
| Priority `URGENT` styling (D97, D99) | Red highlight (`--destructive-subtle` bg, `--error-text`) + text «Термінова» in `DRAFT`/`OPEN`/`ON_HOLD`; in `FILLED`/`CANCELLED` the text stays in a neutral badge, no red |
| Priority `NORMAL`                    | Звичайна                                                                                                                                                                    |
| Priority `URGENT`                    | Термінова                                                                                                                                                                   |
| TL priority (int)                    | Пріоритет тімліда; badge «П0», «П1»… tooltip «Пріоритет 0 — найвищий»                                                                                                       |
| Per-vacancy priority override        | Пріоритет тімліда для цієї вакансії (Admin only, D94)                                                                                                                       |
| Days open                            | Відкрита N дн.                                                                                                                                                              |
| Headcount                            | Кількість місць; progress «1 з 2 найнято»                                                                                                                                   |
| Work format remote/office/hybrid     | Віддалено / Офіс / Гібрид                                                                                                                                                   |
| Seniority                            | Рівень: Junior / Middle / Senior / Lead (kept in English — industry norm)                                                                                                   |

## 5. Interviews, reschedule, polygraph, offer, probation

| Term                                        | UI term                                                   |
| ------------------------------------------- | --------------------------------------------------------- |
| Screening call                              | Скринінг-дзвінок                                          |
| TL interview                                | Співбесіда з тімлідом                                     |
| Accept / Decline (TL)                       | Прийняти / Відхилити                                      |
| Interview result Pass / Reject              | Пройдено / Не пройдено                                    |
| Feedback                                    | Відгук                                                    |
| Reschedule request                          | Запит на перенесення                                      |
| Alternative slot                            | Варіант часу                                              |
| Reschedule pending                          | Очікує перенесення                                        |
| Confirm slot                                | Підтвердити час                                           |
| Counter-proposal                            | Запропонувати інший час                                   |
| Candidate no-show / TL no-show              | Кандидат не зʼявився / Тімлід не зʼявився                 |
| Polygraph session                           | Поліграф (сесія)                                          |
| Place / Room                                | Місце / Кімната                                           |
| Polygraph result PDF                        | Висновок поліграфа (PDF)                                  |
| Pass / Fail (polygraph)                     | Пройдено / Не пройдено                                    |
| Assign HR                                   | Призначити HR-менеджера                                   |
| Offer                                       | Офер                                                      |
| Offer draft / Send                          | Чернетка оферу / Надіслати офер                           |
| Offer letter                                | Лист-офер                                                 |
| Gross / Net                                 | Брутто / Нетто («до сплати податків» / «на руки» in hint) |
| Pay period month / year / hour              | на місяць / на рік / на годину                            |
| Offer outcome Accepted / Declined / Expired | Прийнято / Відхилено / Термін дії минув                   |
| Offer version                               | Версія оферу                                              |
| Email delivery status                       | Статус доставки: Надіслано / Доставлено / Не доставлено   |
| Probation                                   | Випробувальний термін                                     |
| First day happened                          | Перший робочий день відбувся                              |
| Days left                                   | Залишилось N дн.                                          |
| Day X of Y                                  | День X з Y                                                |
| Early pass                                  | Завершити достроково                                      |
| Pass probation (at/after end)               | Підтвердити проходження                                   |
| Probation failed                            | Випробувальний термін не пройдено                         |
| Override (Head HR/Admin)                    | Завершити з винятком (коментар обовʼязковий)              |

## 6. Rejection reasons (§6.4)

| Enum                          | UI term                              |
| ----------------------------- | ------------------------------------ |
| `TL_DECLINED_PROFILE`         | Профіль не підійшов тімліду          |
| `TL_INTERVIEW_FAILED`         | Співбесіду з тімлідом не пройдено    |
| `POLYGRAPH_FAILED`            | Поліграф не пройдено                 |
| `OFFER_DECLINED_BY_CANDIDATE` | Кандидат відхилив офер               |
| `SALARY_MISMATCH`             | Невідповідність зарплатних очікувань |
| `CANDIDATE_UNRESPONSIVE`      | Кандидат не виходить на звʼязок      |
| `DUPLICATE`                   | Дублікат                             |
| `OTHER`                       | Інше (коментар обовʼязковий)         |

## 7. Bonuses

| Enum                                  | UI term                                     | Note                                           |
| ------------------------------------- | ------------------------------------------- | ---------------------------------------------- |
| Bonus scheme                          | Схема бонусів                               | —                                              |
| Preset Standard 30/70                 | Стандартна 30/70                            | —                                              |
| Preset Full after probation           | 100% після випробувального                  | —                                              |
| `FIXED`                               | Фіксована сума                              | —                                              |
| `PERCENT_OF_MONTHLY_SALARY`           | % від місячної зарплати                     | —                                              |
| `PERCENT_OF_ANNUAL_SALARY`            | % від річної зарплати                       | —                                              |
| Tranche                               | Транш                                       | «Транш 1 · 30%»                                |
| Trigger `PROBATION_STARTED`           | Початок випробувального терміну             | —                                              |
| Trigger `PROBATION_PASSED`            | Проходження випробувального терміну         | —                                              |
| Trigger `DAYS_AFTER_START(n)`         | Через N дн. після виходу                    | —                                              |
| Clawback `NONE`                       | Без повернення                              | —                                              |
| Clawback `FULL_IF_LEFT_WITHIN_N_DAYS` | Повне повернення, якщо пішов протягом N дн. | —                                              |
| Clawback `PRORATED`                   | Пропорційне повернення                      | —                                              |
| Urgent multiplier                     | Множник для термінових                      | «×1,25» (comma decimal)                        |
| Min days for tranche 1                | Мінімум днів для траншу 1                   | —                                              |
| Snapshot                              | Зафіксовано при прийнятті оферу             | Tooltip on amount.                             |
| `PLANNED`                             | Заплановано                                 | —                                              |
| `ELIGIBLE`                            | Нараховано                                  | Tooltip «Умову виконано, очікує затвердження». |
| `APPROVED`                            | Затверджено                                 | —                                              |
| `PAID`                                | Виплачено                                   | With period «Виплачено · листопад 2026».       |
| `CANCELLED`                           | Скасовано                                   | —                                              |
| `ON_HOLD`                             | Призупинено                                 | Tooltip «Спірне нарахування».                  |
| `CLAWBACK_PENDING`                    | Очікує повернення                           | —                                              |
| `CLAWED_BACK`                         | Повернено                                   | —                                              |
| Manual adjustment                     | Коригування                                 | «+2 000 ₴ · Коригування: причина».             |
| Manual split                          | Розподіл бонусу                             | «50/50».                                       |
| Payout report                         | Звіт про виплати                            | —                                              |
| Payout period                         | Період виплати                              | «Листопад 2026» (stored `2026-11`).            |
| Mark as paid                          | Позначити виплаченим                        | Bulk: «Позначити виплаченими (N)».             |
| My bonuses                            | Мої бонуси                                  | —                                              |
| Expected date                         | Очікувана дата                              | —                                              |

## 8. Archive & destructive actions

| Term                         | UI term            | Consequence copy (dialog body)                                                                                                                                                         |
| ---------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Archive tab Rejected         | Відмови            | —                                                                                                                                                                                      |
| Archive tab Deleted          | Видалені           | —                                                                                                                                                                                      |
| Archive tab Closed vacancies | Закриті вакансії   | —                                                                                                                                                                                      |
| Reject                       | Відмовити          | «Кандидатуру буде завершено зі статусом «Відмова» і перенесено в Архів → Відмови. Звідти її можна повернути в роботу.»                                                                 |
| Withdraw                     | Самовідвід         | «Кандидатуру буде завершено. Картка кандидата залишиться в Архіві → Відмови.»                                                                                                          |
| Delete (soft)                | Видалити           | «Картку буде приховано з усіх списків і перенесено в Архів → Видалені. Відновити її може адміністратор або керівник рекрутингу.»                                                       |
| Delete reason                | Причина видалення  | Required.                                                                                                                                                                              |
| Restore                      | Відновити          | «Картка повернеться в списки з усією історією.»                                                                                                                                        |
| Purge (GDPR)                 | Видалити назавжди  | «Персональні дані та файли буде знищено безповоротно. Для статистики залишиться анонімний запис «Кандидат #1234 (видалено)». Цю дію неможливо скасувати.» Type-to-confirm: «ВИДАЛИТИ». |
| Reactivate                   | Повернути в роботу | «Буде створено нову кандидатуру; попередня історія збережеться.»                                                                                                                       |
| Clone vacancy                | Клонувати          | «Створити нову вакансію з тими самими полями.»                                                                                                                                         |
| Deactivate user              | Деактивувати       | «Користувач не зможе увійти. Історія залишиться.»                                                                                                                                      |

## 9. Common buttons & system copy

| Intent                            | UI                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Save / Cancel / Close             | Зберегти / Скасувати / Закрити                                                                                     |
| Create                            | Створити                                                                                                           |
| Edit                              | Редагувати                                                                                                         |
| Confirm                           | Підтвердити                                                                                                        |
| Retry                             | Спробувати ще раз                                                                                                  |
| Export CSV / XLSX                 | Експорт CSV / Експорт XLSX                                                                                         |
| Search placeholder                | Пошук кандидатів і вакансій… (Ctrl K)                                                                              |
| Read-only badge                   | Лише перегляд                                                                                                      |
| Loading error                     | Не вдалося завантажити дані.                                                                                       |
| Not found / no access (404)       | Сторінку не знайдено або доступ обмежено.                                                                          |
| Save failed (optimistic rollback) | Зміну не збережено — повернули як було.                                                                            |
| Conflict (409)                    | Етап уже змінився. Оновили картку.                                                                                 |
| Offline                           | Немає зʼєднання. Зміни буде відправлено після відновлення. ⚠ OPEN (offline queue not in PRD — v1 shows error only) |
| Days                              | «дн.» short; full plural via ICU: 1 день / 2 дні / 5 днів                                                          |

## 10. Formatting (uk-UA, Europe/Kyiv)

| Kind               | Format                                                                      | Example                      |
| ------------------ | --------------------------------------------------------------------------- | ---------------------------- |
| Date               | dd.MM.yyyy                                                                  | 14.11.2026                   |
| Date short (cards) | d MMM                                                                       | 14 лист.                     |
| Date + time        | dd.MM.yyyy, HH:mm                                                           | 14.11.2026, 15:30            |
| Relative           | «2 год тому», «вчора», «щойно»                                              | —                            |
| Money              | thin space thousands, symbol after                                          | 45 000 ₴ · 1 500 $ · 1 200 € |
| Percent            | 30 % (NBSP)                                                                 | —                            |
| Decimal            | comma                                                                       | ×1,25                        |
| Plurals            | ICU `{count, plural, one {# день} few {# дні} many {# днів} other {# дня}}` | —                            |

## 11. Terms from the designer mockups (`design-adoption.md`)

| Term                              | UI (uk)                            | Note                                                  |
| --------------------------------- | ---------------------------------- | ----------------------------------------------------- |
| Brand                             | Hiring                             | Logo «H» + wordmark; never «HRIS» in UI (A-01)        |
| Screening (short, calendar/chips) | Скринінг                           | Full form stays «Скринінг-дзвінок»                    |
| Join Meet                         | Приєднатися                        | Button on interview events (A-44)                     |
| Scheduler of an event             | Організатор                        | Participant badge                                     |
| Next event                        | Наступна подія                     | Candidate card right column                           |
| Interaction history (feed title)  | Історія взаємодій                  | Tab name stays «Історія»                              |
| Private notes                     | Приватні нотатки                   | Caption «Бачите лише ви»; button «+ Нотатка» (A-03)   |
| Share link                        | Поділитися                         | Toast «Посилання скопійовано» (A-05)                  |
| Candidate photo                   | Фото                               | Optional; fallback initials (A-04)                    |
| Person status                     | Активний / Резерв                  | «Активний» = ≥ 1 active application (A-36)            |
| Candidate actions sheet (mobile)  | Дії з кандидатом                   | A-45                                                  |
| Stage in drawer                   | Етап у воронці                     | Trigger of «Перемістити до…»                          |
| Add task (manual, Phase 5)        | Додати задачу                      | Tabs «Усі · Сьогодні · Прострочені · Без дати» (A-02) |
| Saved filters                     | Збережені фільтри                  | Button «Зберегти»                                     |
| View toggle                       | Канбан / Таблиця · Картки / Канбан | —                                                     |
| KPI: hires (probation started)    | Вийшли на роботу                   | ⏳ A-38; «Найнято» = probation passed only            |
| KPI: time-to-fill                 | Середній час найму                 | STAT-03                                               |
| KPI: conversion                   | Конверсія                          | «+3 в.п.» for percentage points                       |
| Recruiter reward                  | Винагорода рекрутеру               | Admin action «Змінити винагороду» (BONUS-16)          |
| Data freshness                    | Оновлено о 06:00                   | —                                                     |
| Reset filters                     | Скинути фільтри                    | —                                                     |
| Show weekends                     | Показати вихідні                   | Calendar                                              |

**Mockup wording that loses to the glossary:** «Відхилити» (interview result) → «Не пройдено» · «Пройти далі» → «Пройдено» · «Перевести на етап» → «Перемістити до…» · «Активна» (vacancy) → «Відкрита» · «Нові», «У роботі» → «Новий», «В роботі» · «Інтерв'ю» → «Співбесіда» · «Технічна співбесіда» → «Співбесіда з тімлідом» · «Дублювати» → «Клонувати» · «Архівувати» → no such action · «Пріоритет: Високий» → «Термінова» · «Оцінка тімліда» → «Рішення тімліда» · «Фідбек» → «Відгук» · «Усі позиції» → «Усі посади» · «Remote» / «Відділено» → «Віддалено» · «$ 2 000» → «2 000 $». Full table: `design-adoption.md` §3.

## ⚠ OPEN

- G-1 Offline behaviour of optimistic moves (queue vs. fail fast) not specified; design assumes fail fast + rollback toast.
