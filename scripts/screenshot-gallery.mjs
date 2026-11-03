import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';

const VIEWPORTS = {
  desktop: 'компʼютер',
  tablet: 'планшет',
  mobile: 'телефон',
};
const THEMES = { light: 'світла', dark: 'темна' };
const STANDARD = [
  'desktop-light',
  'desktop-dark',
  'mobile-light',
  'mobile-dark',
];
const STYLE =
  'body{margin:32px;background:#f8fafc;color:#0f172a;font:16px/1.5 system-ui}section{margin:40px 0}.screen{margin:0;font-size:14px;font-weight:600;color:#475569}h2{margin:16px 0 8px;font-size:20px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}figure{margin:0}img{width:100%;border:1px solid #94a3b8;border-radius:12px}figcaption{padding:8px 0}nav ul{columns:2 320px;padding-left:20px}a{color:#4338ca}';

const capitalize = (text) => text[0].toLocaleUpperCase('uk') + text.slice(1);
/** «Історія · телефон · темна»; a screen with one state is captioned by viewport and theme only (SHOT-GAL-01). */
const caption = (label, variant) => {
  const [viewport, theme] = variant.split('-');
  return capitalize(
    [label, VIEWPORTS[viewport], THEMES[theme]].filter(Boolean).join(' · '),
  );
};
const html = (title, body) => `<!doctype html>
<html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${STYLE}</style>
<h1>${title}</h1>
${body}</html>\n`;

/** Screen → states; `file` is the name stem without `-<viewport>-<theme>.png`. */
const groups = [
  {
    screen: 'Вхід і публічні сторінки',
    role: 'без входу',
    roles: [],
    states: [
      { file: '01-public-login', heading: 'Вхід — форма входу' },
      {
        file: '22-public-login-google',
        heading:
          'Вхід — з кнопкою «Увійти через Google» (коли вхід через Google увімкнено)',
      },
      {
        file: '02-public-confirm',
        heading: 'Вхід — підтвердження за посиланням',
      },
      {
        file: '03-public-confirm-invalid',
        heading: 'Вхід — недійсне посилання',
      },
      {
        file: '21-public-invite-valid',
        heading:
          'Запрошення — дійсне: імʼя, пошта й ролі (приклад: Оксана Олійник, HR-менеджер у двох вертикалях)',
      },
      {
        file: '22-public-invite-google',
        heading: 'Запрошення — з кнопкою «Прийняти через Google»',
      },
      {
        file: '04-public-invite-invalid',
        heading: 'Запрошення — недійсне посилання',
      },
      { file: '05-public-session-expired', heading: 'Сесію завершено' },
      {
        file: '01-public-not-found',
        heading: 'Сторінку не знайдено (404)',
        dir: 'foundation',
      },
    ],
  },
  {
    screen: 'Двофакторна автентифікація (2FA)',
    role: 'Тімлід, Адміністратор',
    roles: ['Тімлід', 'Адміністратор'],
    states: [
      {
        file: '19-team-lead-mfa-setup-optional',
        label: 'за бажанням',
        heading: '2FA — налаштування за бажанням (Тімлід: QR-код і ключ)',
      },
      {
        file: '19-admin-mfa-setup-backup',
        label: 'резервний пристрій',
        heading: '2FA — додати резервний пристрій (Адміністратор)',
      },
      {
        file: '20-admin-mfa-verify-form',
        label: 'код',
        heading: '2FA — підтвердження входу кодом (Адміністратор)',
      },
      {
        file: '20-admin-mfa-verify-wrong-code',
        label: 'невірний код',
        heading: '2FA — невірний код',
      },
    ],
  },
  {
    screen: 'Профіль — перший екран після входу',
    role: 'усі ролі',
    roles: [
      'Керівник рекрутингу',
      'Рекрутер',
      'Тімлід',
      'Керівник HR',
      'HR-менеджер',
      'Фінансист',
      'Адміністратор',
    ],
    states: [
      {
        file: '15-team-lead-profile',
        label: 'тімлід',
        heading:
          'Профіль — Тімлід (Василь Мороз): одна вертикаль, у меню лише «Профіль». Так само бачать Керівник рекрутингу й Рекрутер',
      },
      {
        file: '15-head-hr-profile',
        label: 'керівник HR',
        heading:
          'Профіль — Керівник HR (Наталія Кравченко): дві вертикалі й перемикач «Усі мої вертикалі». Так само бачить HR-менеджер',
      },
      {
        file: '15-finance-profile',
        label: 'фінансист',
        heading:
          'Профіль — Фінансист (Ірина Романенко): без вертикалей, вхід підтверджено кодом 2FA',
      },
      {
        file: '18-admin-profile',
        label: 'адміністратор',
        heading:
          'Профіль — Адміністратор (Іван Коваленко): у меню ще «Налаштування»',
      },
    ],
  },
  {
    screen: 'Налаштування без доступу',
    role: 'усі ролі, крім Адміністратора',
    roles: ['Керівник рекрутингу'],
    states: [
      {
        file: '16-head-recruiter-settings-denied',
        heading:
          'Налаштування — «Сторінку не знайдено» в застосунку (приклад: Керівник рекрутингу; так само для всіх ролей, крім Адміністратора)',
      },
    ],
  },
  {
    screen: 'Журнал дій',
    role: 'Адміністратор',
    roles: ['Адміністратор'],
    states: [
      {
        file: '06-admin-audit-list',
        label: 'список',
        heading: 'Журнал дій — усі записи за останні 7 днів',
      },
      {
        file: '06-admin-audit-detail',
        label: 'деталі',
        heading: 'Журнал дій — деталі успішного запису',
      },
      {
        file: '06-admin-audit-detail-denied',
        label: 'відмова',
        heading: 'Журнал дій — деталі відмови з причиною',
      },
      {
        file: '06-admin-audit-actors',
        label: 'хто',
        heading: 'Журнал дій — пошук автора («Хто»)',
      },
      {
        file: '06-admin-audit-multi',
        label: 'кілька дій',
        heading: 'Журнал дій — вибрано кілька дій',
      },
      {
        file: '06-admin-audit-actions',
        label: 'вибір дій',
        heading: 'Журнал дій — згрупований вибір дій',
      },
      {
        file: '06-admin-audit-security',
        label: 'безпека',
        heading: 'Журнал дій — входи та безпека',
      },
      {
        file: '06-admin-audit-newer',
        label: 'новіші',
        heading: 'Журнал дій — «Показати новіші» після старіших записів',
      },
    ],
  },
  {
    screen: 'Навігація',
    role: 'Адміністратор',
    roles: ['Адміністратор'],
    states: [
      {
        file: '07-admin-navigation-open',
        heading: 'Навігація — відкрите меню',
        variants: [
          'tablet-light',
          'tablet-dark',
          'mobile-light',
          'mobile-dark',
        ],
      },
    ],
  },
  {
    screen: 'Користувачі та ролі',
    role: 'Адміністратор',
    roles: ['Адміністратор'],
    states: [
      { file: '08-admin-users-list', heading: 'Користувачі та ролі — список' },
      { file: '09-admin-invite-dialog', heading: 'Запросити користувача' },
      {
        file: '10-admin-user-drawer-profile',
        label: 'профіль',
        heading: 'Картка користувача — профіль і ролі',
      },
      {
        file: '10-admin-user-drawer-history',
        label: 'історія',
        heading: 'Картка користувача — історія',
      },
      {
        file: '11-admin-user-invite-actions',
        label: 'дії',
        heading: 'Прострочене запрошення — дії',
      },
      {
        file: '11-admin-user-invite-revoke',
        label: 'відкликання',
        heading: 'Прострочене запрошення — підтвердження відкликання',
      },
      {
        file: '11-admin-user-change-email-menu',
        label: 'меню',
        heading: 'Змінити email — меню «⋯»',
      },
      {
        file: '11-admin-user-change-email-dialog',
        label: 'діалог',
        heading: 'Змінити email — діалог',
      },
      {
        file: '11-admin-user-change-email-taken',
        label: 'зайнята адреса',
        heading: 'Змінити email — адреса вже зайнята',
      },
      {
        file: '12-admin-user-roles-dialog',
        label: 'матриця',
        heading: 'Змінити ролі — матриця доступу',
      },
      {
        file: '12-admin-user-roles-remove',
        label: 'зняття',
        heading: 'Змінити ролі — підтвердження зняття',
      },
      {
        file: '13-admin-user-deactivate-dialog',
        label: 'причина',
        heading: 'Деактивувати — підтвердження з причиною',
      },
      {
        file: '13-admin-user-deactivate-failed',
        label: 'незавершено',
        heading: 'Деактивувати — блокування входу не завершено',
      },
      {
        file: '13-admin-user-reactivate-card',
        label: 'картка',
        heading: 'Активувати знову — картка деактивованого користувача',
      },
      {
        file: '13-admin-user-reactivate-dialog',
        label: 'ролі',
        heading: 'Активувати знову — вибір попередніх ролей',
      },
    ],
  },
  {
    screen: 'Вертикалі',
    role: 'Адміністратор',
    roles: ['Адміністратор'],
    states: [
      {
        file: '17-admin-verticals-list',
        label: 'список',
        heading: 'Вертикалі — список (Гемблінг, Крипто)',
      },
      {
        file: '17-admin-verticals-create',
        label: 'нова',
        heading: 'Вертикалі — нова вертикаль',
      },
      {
        file: '17-admin-verticals-duplicate',
        label: 'назва зайнята',
        heading: 'Вертикалі — вертикаль з такою назвою вже існує',
      },
      {
        file: '17-admin-verticals-rename',
        label: 'перейменування',
        heading: 'Вертикалі — перейменування: назва ще не змінилася',
      },
      {
        file: '17-admin-verticals-empty',
        label: 'порожньо',
        heading: 'Вертикалі — порожній стан (приклад: вертикалей ще немає)',
      },
    ],
  },
  {
    screen: 'Пріоритети тімлідів',
    role: 'Адміністратор',
    roles: ['Адміністратор'],
    states: [
      {
        file: '14-admin-priorities-list',
        label: 'список',
        heading:
          'Пріоритети тімлідів — Гемблінг (Василь Мороз П0, Тарас Лисенко П1)',
      },
      {
        file: '14-admin-priorities-edited',
        label: 'рівні пріоритети',
        heading: 'Пріоритети тімлідів — рівні пріоритети та незбережена зміна',
      },
      {
        file: '14-admin-priorities-unset',
        label: 'без пріоритету',
        heading: 'Пріоритети тімлідів — група «Без пріоритету»',
      },
      {
        file: '14-admin-priorities-conflict',
        label: 'конфлікт',
        heading: 'Пріоритети тімлідів — зміни іншого адміністратора',
      },
      {
        file: '14-admin-priorities-empty',
        label: 'порожньо',
        heading:
          'Пріоритети тімлідів — вертикаль без тімлідів (приклад: «Дейтинг»)',
      },
    ],
  },
];

mkdirSync('screenshots/latest', { recursive: true });
const listed = { 'phase-1': new Set(), foundation: new Set() };
const anchor = (file) => `s-${file}`;
/** Phase-1 shots are copied to latest/; shots of another folder are linked with `../<dir>/` when `linkOut`. */
const figures = (
  { file, label, heading, dir = 'phase-1', variants = STANDARD },
  linkOut,
) =>
  variants.map((variant) => {
    const name = `${file}-${variant}.png`;
    const source = `screenshots/${dir}/${name}`;
    if (!existsSync(source)) throw new Error(`Missing screenshot: ${source}`);
    listed[dir].add(name);
    if (dir === 'phase-1') copyFileSync(source, `screenshots/latest/${name}`);
    const href = linkOut && dir !== 'phase-1' ? `../${dir}/${name}` : name;
    const text = caption(label, variant);
    return `<figure><a href="${href}"><img src="${href}" alt="${heading} — ${text.toLocaleLowerCase('uk')}" loading="lazy"></a><figcaption>${text}</figcaption></figure>`;
  });

const roles = [...new Set(groups.flatMap((group) => group.roles))];
const contents = groups
  .map(
    (group) =>
      `<li><a href="#${anchor(group.states[0].file)}">${group.screen}</a> (${group.role}): ${group.states.map((state) => state.heading).join('; ')}</li>`,
  )
  .join('\n');
const intro = `<p>Ролі: ${roles.join(', ')}; також сторінки без входу. Теми: світла й темна. Екрани: компʼютер 1440×900 і телефон 390×844; навігація — планшет 900×900 і телефон.</p>
<p>У фазі 1 усі ролі, крім Адміністратора, після входу бачать лише «Профіль». Ролі з однаковим виглядом показано одним знімком, підпис називає, хто ще бачить так само.</p>
<p>Дані — демо-дані: ті самі люди, що й у демо-версії. Щоб знімки не змінювалися, час входів, сесії, дати в історії картки й дати створення вертикалей зафіксовано; журнал дій показує підготовлені записи з цими людьми. QR-код і ключ 2FA — зразки, справжній пристрій не створюється. Вертикаль «Дейтинг», порожній список вертикалей і дійсне запрошення — лише приклади станів. Сторінку 404 узято з <a href="../foundation/index.html">галереї фундаменту</a>.</p>
<nav aria-label="Розділи"><ul>
${contents}
</ul></nav>`;
const sections = groups.map(
  (group) =>
    `<section><p class="screen">${group.screen} · ${group.role}</p>\n${group.states
      .map(
        (state) =>
          `<h2 id="${anchor(state.file)}">${state.heading}</h2><div class="grid">${figures(state, true).join('\n')}</div>`,
      )
      .join('\n')}</section>`,
);
/** SHOT-GAL-01: every PNG on disk is in the gallery, and every gallery entry is on disk. */
for (const [dir, names] of Object.entries(listed)) {
  const unlisted = readdirSync(`screenshots/${dir}`).filter(
    (name) => name.endsWith('.png') && !names.has(name),
  );
  if (unlisted.length)
    throw new Error(
      `Screenshots missing from the gallery: ${unlisted.map((name) => `screenshots/${dir}/${name}`).join(', ')}`,
    );
}
const gallery = html('Hiring — фаза 1', `${intro}\n${sections.join('\n')}`);
writeFileSync('screenshots/phase-1/index.html', gallery);
writeFileSync('screenshots/latest/index.html', gallery);

const notFound = groups[0].states.find((state) => state.dir === 'foundation');
writeFileSync(
  'screenshots/foundation/index.html',
  html(
    'Hiring — фундамент',
    `<p>Публічна сторінка 404 («Сторінку не знайдено»): світла й темна теми, компʼютер 1440×900 і телефон 390×844. Решта екранів — у <a href="../phase-1/index.html">галереї фази 1</a>.</p>
<section><h2>${notFound.heading}</h2><div class="grid">${figures(notFound, false).join('\n')}</div></section>`,
  ),
);
