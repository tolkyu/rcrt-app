import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';

const variants = [
  'desktop-light',
  'desktop-dark',
  'mobile-light',
  'mobile-dark',
];
const cards = variants.map((variant) => {
  const file = `01-public-not-found-${variant}.png`;
  if (!existsSync(`screenshots/foundation/${file}`))
    throw new Error(`Missing screenshot: ${file}`);
  return `<figure><a href="${file}"><img src="${file}" alt="404 — ${variant}" loading="lazy"></a><figcaption>${variant}</figcaption></figure>`;
});

writeFileSync(
  'screenshots/foundation/index.html',
  `<!doctype html>
<html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>HRIS — перевірка фундаменту</title>
<style>body{margin:32px;background:#f8fafc;color:#0f172a;font:16px/1.5 system-ui}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}figure{margin:0}img{width:100%;border:1px solid #94a3b8}figcaption{padding:8px 0}</style>
<h1>HRIS — перевірка фундаменту</h1>
<p>Публічна сторінка 404. Бізнес-екрани та повна рольова галерея фази 1 ще не реалізовані.</p>
<main>${cards.join('\n')}</main></html>\n`,
);

const screens = [
  ['01-public-login', 'Вхід'],
  ['02-public-confirm', 'Підтвердження входу'],
  ['03-public-confirm-invalid', 'Недійсне посилання'],
  ['04-public-invite-invalid', 'Недійсне запрошення'],
  ['05-public-session-expired', 'Завершена сесія'],
  ['06-admin-audit-list', 'Журнал дій — Адміністратор'],
  ['06-admin-audit-detail', 'Журнал дій — деталі запису'],
  [
    '07-admin-navigation-open',
    'Навігація — Адміністратор',
    ['tablet-light', 'tablet-dark', 'mobile-light', 'mobile-dark'],
  ],
  ['08-admin-users-list', 'Користувачі та ролі — Адміністратор'],
  ['09-admin-invite-dialog', 'Запросити користувача — Адміністратор'],
  [
    '10-admin-user-drawer',
    'Картка користувача — Адміністратор',
    ['profile', 'history'].flatMap((tab) =>
      variants.map((variant) => `${tab}-${variant}`),
    ),
  ],
];
mkdirSync('screenshots/latest', { recursive: true });
const sections = screens.map(([id, title, screenVariants = variants]) => {
  const items = screenVariants.map((variant) => {
    const file = `${id}-${variant}.png`;
    const source = `screenshots/phase-1/${file}`;
    if (!existsSync(source)) throw new Error(`Missing screenshot: ${source}`);
    copyFileSync(source, `screenshots/latest/${file}`);
    return `<figure><a href="${file}"><img src="${file}" alt="${title} — ${variant}" loading="lazy"></a><figcaption>${variant}</figcaption></figure>`;
  });
  return `<section><h2>${title}</h2><div class="grid">${items.join('\n')}</div></section>`;
});
const gallery = `<!doctype html>
<html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hiring — фаза 1</title>
<style>body{margin:32px;background:#f8fafc;color:#0f172a;font:16px/1.5 system-ui}section{margin:32px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}figure{margin:0}img{width:100%;border:1px solid #94a3b8;border-radius:12px}figcaption{padding:8px 0}</style>
<h1>Hiring — фаза 1</h1>
<p>Вхід і журнал дій: світла й темна теми, комп’ютер 1440×900 та телефон 390×844. Навігація: планшет 900×900 та телефон 390×844. Для скриншотів журналу використано фіксовані тестові записи; перевірки реальних змін і доступу виконуються окремо. Повна галерея фази 1 ще в роботі.</p>
${sections.join('\n')}</html>\n`;
writeFileSync('screenshots/phase-1/index.html', gallery);
writeFileSync('screenshots/latest/index.html', gallery);
