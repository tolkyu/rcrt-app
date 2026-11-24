# HRIS — Recruiting

Внутрішня система рекрутингу. Вимоги — `docs/PRD.md`, правила розробки — `CLAUDE.md`, стан робіт — `docs/PROGRESS.md`.

## Поточний стан

Фаза 1: фундамент, міграції/seed, серверна авторизація та екрани входу, запрошення, 2FA й профілю. Авторизація використовує Supabase JWT/JWKS та поточні ролі в базі. `/` направляє на вхід або профіль; `/api/health` перевіряє лише роботу HTTP-сервера. Повна перевірка автентифікації та налаштування адміністратора ще в роботі.

Підсумок для наступної сесії Claude Code: [docs/CLAUDE_HANDOFF.md](docs/CLAUDE_HANDOFF.md).

## Локальний запуск

Потрібні Node.js **24.18.0**, pnpm **11.3.0**, Docker Desktop для баз даних.

```sh
corepack pnpm setup
corepack pnpm dev
```

Відкрити `http://localhost:3000/api/health`. `env:init` створює `.env`, а при повторному запуску додає відсутні значення з `.env.example`, зберігаючи наявні. Секрети не комітити. Якщо Corepack недоступний, встановити pnpm 11.3.0 та виконувати команди через `pnpm`.

`pnpm setup` виконує install → Supabase → migrate → локальна runtime-роль → seed. Потім заповніть локальні `SUPABASE_PUBLISHABLE_KEY` та `SUPABASE_SECRET_KEY` у `.env` з `pnpm db:status` і виконайте `pnpm db:seed:auth`: команда прив’язує тільки локальні демоакаунти. `env:init` генерує локальні секрети лімітів і демо-TOTP. У режимі розробки доступний `/dev-login`; у production-збірці цих маршрутів немає. Локальні листи залишаються в Mailpit (`http://localhost:55324`); Google приховано, доки провайдер не налаштований.

## Бази даних

- `pnpm db:start` / `pnpm db:stop` — локальний Supabase; PostgreSQL 17 (рішення власника, Q-142), API `55321`, DB `55322`, Studio `55323`, пошта `55324`.
- `pnpm test:db:up` / `pnpm test:db:down` — окремий PostgreSQL 17.11 (Debian), `127.0.0.1:55332`, лише тестові дані у `tmpfs`. Зупинка видаляє ці тимчасові дані.
- `pnpm db:migrate` застосовує міграції Drizzle; `pnpm db:seed` завантажує демо-дані лише в локальну базу без реальних користувачів. Postman використовується для тестування API.

## Перевірки

```sh
pnpm lint
pnpm typecheck
pnpm test:db:up
pnpm test
pnpm perf:check
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:screens
```

Браузерні перевірки потребують попередньої `pnpm build` (або `pnpm perf:check`). Галерея фундаменту: [screenshots/foundation/index.html](screenshots/foundation/index.html). Повна рольова галерея фази 1 з'явиться після T4–T7.

CI виконує unit/інтеграційні перевірки на PostgreSQL 17, збірку, JS-бюджет, браузерні тести, Gitleaks і публікує звіти та скріншоти. OpenAPI/Postman генеруються командами `api:openapi` / `api:postman`; Newman і Lighthouse залишаються в плані фази 1.
