# UX review — T6 slice 12: settings polish

**2026-11-02 · APPROVED · P1–P5.** Блокуючих зауважень немає.

Основа: `docs/ux/wireframes/settings-admin.md` §8, PRD ROLE-05, SHOT-01..03. Перевірено поточний diff поверх `651f949` і свіжі PNG завершального QA-прогону в `screenshots/latest/` (копія галереї: `screenshots/phase-1/index.html`).

| Пункт                    | Результат                                                                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 — меню картки         | Desktop/mobile, світла/темна теми: меню нижче «Усі дії в журналі», праворуч по кнопці «⋯». Ім’я, email, статус і «Входів не було» повністю видно. Перекриття правої частини вкладок відповідає специфікації.                    |
| P2 — порядок кнопок      | Mobile invite: весь footer у кадрі, «Скасувати» над «Надіслати запрошення». Код invite/vertical-name зберігає DOM-порядок і висоту 48 px на телефоні, 40 px на desktop.                                                         |
| P3 — email               | У списку desktop Олена Мельник: `head.recruiter.gambling` / `@demo`, без однолітерного рядка. `EmailText` використано у всіх чотирьох погоджених read-only місцях, повний текст адреси збережено.                               |
| P4 — українські переноси | У mobile12/13 «наступної» та «блокування» переносяться цілими словами. `rg hyphens app components` — без збігів.                                                                                                                |
| P5 — знімки              | Sidebar desktop08 до нижнього краю. Mobile08: усі картки перед нижньою навігацією. Mobile06/07/10/11/12/13: drawer/bottom sheet до нижнього краю, сторонньої смуги під overlay немає. Mobile09 повністю показує вміст і footer. |

## Безпосередньо оглянуті PNG

Імена нижче доповнюються префіксом `NN-admin-` і суфіксом `.png`; `обидві` = `light` та `dark`.

| NN  | Стан                                                                         | Viewport / тема              |
| --- | ---------------------------------------------------------------------------- | ---------------------------- |
| 06  | `audit-detail`                                                               | mobile light                 |
| 06  | `audit-list`, `audit-actors`                                                 | mobile dark                  |
| 07  | `navigation-open`                                                            | mobile dark                  |
| 08  | `users-list`                                                                 | desktop обидві; mobile light |
| 09  | `invite-dialog`                                                              | mobile обидві                |
| 10  | `user-drawer-profile`                                                        | desktop dark; mobile dark    |
| 10  | `user-drawer-history`                                                        | mobile light                 |
| 11  | `user-change-email-menu`                                                     | desktop/mobile обидві        |
| 11  | `user-change-email-dialog`                                                   | mobile light                 |
| 11  | `user-change-email-taken`                                                    | mobile dark                  |
| 12  | `user-roles-dialog`, `user-roles-remove`                                     | mobile обидві                |
| 13  | `user-deactivate-dialog`, `user-deactivate-failed`, `user-reactivate-dialog` | mobile обидві                |
| 14  | `priorities-conflict`                                                        | mobile light                 |

## Перевірка реального розміру телефону

Збільшені знімки показують весь вміст; поведінку на 390×844 підтверджено окремими функціональними assertions **до** `captureScreen`:

- Invite: обидві кнопки повністю доступні після прокрутки, висота ≥48 px, Cancel перед Submit. У завершальному `.cache/polish-qa-mobile.log` відповідний тест green, весь прогін **45/45**.
- Vertical-name: bottom sheet закінчується на y=844; обидві кнопки видимі, ≥48 px і в погодженому порядку. Відповідний тест green у `.cache/polish-qa-desktop.log` (сам тест явно встановлює 390×844).
- Меню: геометричні assertions перевіряють відступ від journal link та вирівнювання правого краю; усі чотири change-email сценарії mobile green. Native-геометрію не підмінено розтягнутим screenshot viewport.

Огляд є візуальним прийманням погодженого слайсу, а не повним аудитом WCAG або завершенням Phase 1. Нових питань власнику чи UX-блокерів для коміту цього слайсу немає.
