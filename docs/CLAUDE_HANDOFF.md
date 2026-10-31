> **Застаріло (31.10.2026, 14:00):** T1 і більшу частину T2 закомічено (`c34712a`), рев'ю пройдено, виправлення в роботі. Актуальний стан — `docs/PROGRESS.md`.

# Підсумок для Claude Code — 31.10.2026

## Звідки продовжувати

Гілка `phase-1`. Фаза 0 завершена; власник уже дав «go phase 1» (див. журнал рішень у `PROGRESS.md`). Фаза 1 триває. Наступне основне завдання — **T2: схема Drizzle, міграції, grants/triggers і локальний seed**, потім T3 → T4. Перед зміною версії основної БД потрібне рішення Q-142.

Спочатку прочитай `CLAUDE.md`, `docs/PRD.md`, `docs/PROGRESS.md`, цей файл, `docs/stories/phase-1.md`, `docs/erd.md`, ADR-001/002/003/005 та `docs/security/threat-model.md`. Поведінку продукту й рішення власника Codex не змінював.

## Що було на початку цієї сесії

- Єдиний коміт: `1a67030` — документація фази 0.
- Незакомічені зміни Claude: `CLAUDE.md`, PRD, OPEN_QUESTIONS, PROGRESS, історії фази 1.
- Початок T1: `package.json`, lockfile, workspace, `tsconfig.json`, PostCSS, один CSS-import, Supabase config. Сторінок, серверного коду, тестів, міграцій та CI не було.
- Локальний Supabase `hris-recruiting` уже працював на PostgreSQL 17; наявні контейнери й дані збережено.
- Комітів, push, публікацій або платних сервісів у цій сесії не створено. Зміни попереднього автора збережено.

## Що додав Codex

| Частина              | Реалізація                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bootstrap            | `next.config.ts`, `app/layout.tsx`, українська 404, `GET /api/health`, `.node-version`, ESLint/Prettier                                                            |
| Середовище           | `.env.example`, `lib/env.ts`, `instrumentation.ts`: перевірка при старті, помилки містять лише назви змінних                                                       |
| Локальні інструменти | `scripts/env-init.mjs` зберігає наявні значення й додає відсутні; `scripts/setup.ts` перевіряє loopback/APP_ENV/NODE_ENV і наявність файлів T2 перед запуском БД   |
| i18n                 | `messages/uk.json`, next-intl request config, типізація ключів; `uk`, Europe/Kyiv                                                                                  |
| HTTP-захист          | `middleware.ts`, `server/security/http.ts`: свіжий nonce CSP, no-store, Origin + `X-CSRF-Protection: 1` для небезпечних методів `/api/v1`, базові security headers |
| Supabase             | `auto_expose_new_tables=false`; signup/anonymous/password login не додавались; попередні налаштування Google/TOTP збережені                                        |
| Тести                | Vitest: 36 unit-тести середовища, local DB guard, CSRF, CSP; Playwright: 8 E2E + 4 screenshot-сценарії                                                             |
| Скриншоти            | `screenshots/foundation/index.html` + 4 PNG: публічна 404 × desktop/mobile × light/dark; фіксований час, анімації вимкнені                                         |
| Швидкодія            | `scripts/client-size-config.mjs`: size-limit gzip ≤180 kB для manifest page entry + батьківських layout/template, без подвійного підрахунку чанків                 |
| Інфраструктура       | `docker-compose.test.yml`: ізольований PostgreSQL 16.13 на 55332, loopback і tmpfs; `vercel.json`: fra1                                                            |
| CI                   | `.github/workflows/ci.yml`: lint, typecheck, unit, build/size, Chromium E2E/screens, артефакти; Gitleaks history scan без мережі й tracked `.env` guard            |

`/` зараз повертає 404 до реалізації входу/рольового landing у T4/T5. Макетів вакансій, кандидатів або фіктивного входу немає. `/api/health` — **liveness**, без перевірки доступності БД та без ключів/версій у відповіді.

## Перевірено локально

| Перевірка                        | Результат                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile` | Пройшла, lockfile збережений                                                                                                         |
| `pnpm lint` / `pnpm typecheck`   | Пройшли                                                                                                                              |
| `pnpm test`                      | 36/36                                                                                                                                |
| `pnpm perf:check`                | Production build + size-limit пройшли; 102.67 kB gzip на поточних сторінках                                                          |
| `pnpm test:e2e`                  | 8/8, production server, desktop/mobile; HTML-injected inline script блокується CSP                                                   |
| `pnpm test:screens`              | 4/4; HTML-галерея створена; desktop-light/mobile-dark переглянуті візуально                                                          |
| `env:init`                       | Повторний запуск не змінює вже заповнений `.env`                                                                                     |
| Setup preflight                  | Очікуваний exit 1 з назвами відсутніх `drizzle.config.ts`, `server/db/seed/index.ts`; БД не змінюється                               |
| PostgreSQL test container        | Створений, healthy; `SHOW server_version` → 16.13; зупинений і прибраний після перевірки                                             |
| Gitleaks                         | Локальний snapshot tracked + untracked source без `.env`, caches та node_modules: знахідок немає; сканер без мережі, mount read-only |

GitHub Actions ще не запускався на віддаленому репозиторії. Інтеграційні тести, Newman, Lighthouse, k6 та повна рольова матриця скриншотів ще не реалізовані й не позначені виконаними.

## Важлива розбіжність — Q-142

PRD/ADR-001 вказують PostgreSQL **16**. Supabase CLI **2.122.0** при `major_version=16` завершується: `Invalid db.major_version: 16.` Наявний локальний Supabase використовує **17.11.0.006**. Спробу конфігурації 16 скасовано після перевірки; контейнер не перезапускався.

Залишено попередню локальну конфігурацію 17, а для тестів додано окремий PostgreSQL 16.13. Це технічна розбіжність, а не погоджена зміна стеку. Перед затвердженням БД отримай рішення власника й онови ADR/PRD; не скидай наявні Docker volumes. Рекомендація для обговорення — погодити підтримувану Supabase версію й вирівняти тести після рішення.

## Наступні кроки

1. **T2:** реалізуй тільки таблиці фази 1 за ERD: users/roles/verticals/invites/priorities, audit/events/PII, infrastructure tables відповідно до ADR. Додай Drizzle config, нову міграцію, least-privilege grants і allowed/denied DB-перевірки. Перевір міграцію на порожній та повторно відкритій БД.
2. Seed: `server/db/seed/index.ts` та perf seed; кожен entry point викликає `assertLocalDatabase` **до** підключення/записів. Ідемпотентність; `@demo` лише локально; runtime — `app_rw`, міграції — окреме privileged підключення. Узгодь змінні в `.env.example` із реальною реалізацією.
3. Заверши `pnpm setup` і `test:integration`; додай відповідні CI jobs та migration gate. Окремий Postgres не замінює тестування Supabase Auth/Storage.
4. **T3:** request context, authz/scoped queries, API wrapper + Zod, audit/events, DB-backed rate limiter, OpenAPI/Postman/Newman. Інтеграційні API-клієнти мають передавати `Origin: APP_URL`, `Content-Type: application/json` і `X-CSRF-Protection: 1` на POST/PUT/PATCH/DELETE. API-код `CSRF_FORBIDDEN` уже використаний. Повтори transport/CSRF checks у `defineRoute` відповідно до ADR-006; authz виконуй у серверному ядрі, як в ADR-002.
5. **T4:** invite-only auth, verified JWT, TOTP Admin/Finance, recovery codes, session revocation і dev-login тільки в development. Додай auth/storage secrets validation на цьому етапі; розшир CSP connect-src лише потрібними Supabase-origin. Нині зовнішні підключення в браузері заблоковані.
6. **T5–T9:** Inter через next/font, повні токени/теми/компоненти, рольова навігація/settings, усі стани, повна галерея `screenshots/phase-1`, PII-safe observability, Lighthouse/k6 та перевірки безпеки/рев'ю. Поточний Arial — системний fallback для 404, повна дизайн-система не реалізована.

T1 залишається **in progress**: rate limiting, auth-aware contracts, observability, інтеграційні/API/perf gates залежать від наступних завдань. Стек, продуктову поведінку й Telegram не змінювати без відповідних рішень власника.

## Запуск на цій Windows-машині

`pnpm` відсутній у PATH, працює Corepack. Локальний кеш створено всередині ігнорованої `.cache`:

```powershell
$env:COREPACK_HOME = 'D:\recruiting-app\.cache\corepack'
corepack pnpm env:init
corepack pnpm dev
```

У sandbox native SWC/tsx, Docker pipe і користувацький кеш Chromium потребували дозволеного запуску поза sandbox; це обмеження середовища виконання, а не причина послаблювати права доступу у проєкті. Не друкуй вміст `.env` або JSON `supabase status`: вони можуть містити ключі.

Довідка реалізації: [Next.js 15 CSP](https://nextjs.org/docs/15/app/guides/content-security-policy), [Supabase CLI config](https://supabase.com/docs/guides/local-development/cli/config), [офіційний Gitleaks](https://github.com/gitleaks/gitleaks).
