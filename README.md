# HRIS — Recruiting

Внутрішня система рекрутингу. Вимоги — `docs/PRD.md`, правила розробки — `CLAUDE.md`, стан робіт — `docs/PROGRESS.md`.

## Поточний стан

Фаза 1, фундамент: Next.js, перевірка середовища, next-intl, CSP/CSRF, CI, unit/E2E та скріншоти. Авторизація, бізнес-екрани, міграції й seed ще попереду. `/` повертає українську 404; `/api/health` перевіряє лише роботу HTTP-сервера.

Підсумок для наступної сесії Claude Code: [docs/CLAUDE_HANDOFF.md](docs/CLAUDE_HANDOFF.md).

## Локальний запуск

Потрібні Node.js **24.18.0**, pnpm **11.3.0**, Docker Desktop для баз даних.

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm env:init
corepack pnpm dev
```

Відкрити `http://localhost:3000/api/health`. `env:init` створює `.env`, а при повторному запуску додає відсутні значення з `.env.example`, зберігаючи наявні. Секрети не комітити. Якщо Corepack недоступний, встановити pnpm 11.3.0 та виконувати команди через `pnpm`.

`pnpm setup` поки завершується з поясненням відсутніх файлів T2 до запуску бази. Повний сценарій install → Supabase → migrate → seed запрацює після реалізації міграцій і seed.

## Бази даних

- `pnpm db:start` / `pnpm db:stop` — локальний Supabase; PostgreSQL 17 (рішення власника, Q-142), API `55321`, DB `55322`, Studio `55323`, пошта `55324`.
- `pnpm test:db:up` / `pnpm test:db:down` — окремий PostgreSQL 17.11 (Debian), `127.0.0.1:55332`, лише тестові дані у `tmpfs`. Зупинка видаляє ці тимчасові дані.
- `pnpm db:migrate` застосовує міграції Drizzle; `pnpm db:seed` завантажує демо-дані лише в локальну базу без реальних користувачів. Postman використовується для тестування API.

## Перевірки

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm perf:check
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:screens
```

Браузерні перевірки потребують попередньої `pnpm build` (або `pnpm perf:check`). Галерея фундаменту: [screenshots/foundation/index.html](screenshots/foundation/index.html). Повна рольова галерея фази 1 з'явиться після T4–T7.

CI виконує наявні перевірки, Gitleaks і публікує браузерні звіти та скріншоти. Інтеграційні тести, Newman і Lighthouse підключаються з відповідними можливостями фази 1; їхній поточний статус наведено в handoff.
