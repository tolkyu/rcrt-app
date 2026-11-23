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
      { file: '26-public-login-sent', heading: 'Вхід — посилання надіслано' },
      {
        file: '26-public-login-google-mismatch',
        heading: 'Вхід — Google-акаунт не збігається із запрошенням',
      },
      {
        file: '26-public-login-google-failed',
        heading: 'Вхід — не вдалося увійти через Google',
      },
      {
        file: '26-public-login-deactivated',
        heading: 'Вхід — обліковий запис деактивовано',
      },
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
          'Запрошення — дійсне: імʼя, пошта, ролі й термін дії (приклад: Марина Савчук, HR-менеджер у двох вертикалях)',
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
    screen: 'Профіль',
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
          'Профіль — Тімлід (Василь Мороз): одна вертикаль, у меню «Вакансії» і «Профіль». Так само бачать Керівник рекрутингу й Рекрутер',
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
      { file: '25-admin-audit-loading', heading: 'Журнал дій — завантаження' },
      {
        file: '25-admin-audit-error',
        heading: 'Журнал дій — помилка з можливістю повторити',
      },
      {
        file: '25-admin-audit-empty',
        heading: 'Журнал дій — записів не знайдено',
      },
      {
        file: '25-admin-audit-period-invalid',
        heading: 'Журнал дій — період довший за рік',
      },
      {
        file: '25-admin-audit-json',
        heading: 'Журнал дій — деталі у форматі JSON',
      },
      {
        file: '25-admin-audit-not-found',
        heading: 'Журнал дій — запис недоступний або відсутній',
      },
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
        variants: ['tablet-light', 'tablet-dark'],
      },
      {
        file: '07-admin-navigation-direct',
        heading: 'Навігація — прямі посилання на телефоні',
        variants: ['mobile-light', 'mobile-dark'],
      },
    ],
  },
  {
    screen: 'Користувачі та ролі',
    role: 'Адміністратор',
    roles: ['Адміністратор'],
    states: [
      { file: '08-admin-users-list', heading: 'Користувачі та ролі — список' },
      {
        file: '23-admin-users-loading',
        heading: 'Користувачі та ролі — завантаження',
      },
      {
        file: '23-admin-users-error',
        heading: 'Користувачі та ролі — помилка з можливістю повторити',
      },
      {
        file: '23-admin-users-empty',
        heading: 'Користувачі та ролі — нікого не знайдено',
      },
      {
        file: '08-admin-users-filters',
        heading: 'Користувачі та ролі — мобільні фільтри',
        variants: ['mobile-light', 'mobile-dark'],
      },
      { file: '09-admin-invite-dialog', heading: 'Запросити користувача' },
      {
        file: '24-admin-user-self',
        heading: 'Картка адміністратора — власну 2FA і доступ захищено',
      },
      {
        file: '24-admin-user-not-found',
        heading: 'Картка користувача — недоступний або відсутній користувач',
      },
      {
        file: '24-admin-reset-mfa-dialog',
        heading: 'Скинути 2FA — підтвердження з обовʼязковою причиною',
      },
      {
        file: '24-admin-reset-mfa-incomplete',
        heading: 'Скинути 2FA — частково виконано, можна повторити',
      },
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

const VAC = 'phase-2';
const LIGHT = ['desktop-light'];
const BOTH = ['desktop-light', 'mobile-light'];
/** Phase-2 «Вакансії» (V1): the shots are taken by tests/e2e/vacancies-screens.spec.ts. */
const groups2 = [
  ...[
    ['admin', 'Адміністратор'],
    ['head-recruiter', 'Керівник рекрутингу'],
    ['recruiter', 'Рекрутер'],
  ].map(([role, label]) => ({
    screen: 'Власні чернетки вакансій',
    role: label,
    roles: [label],
    states: [
      ['draft-list', 'Список власних чернеток'],
      ['draft-menu', 'Меню чернетки'],
      ['draft-card', 'Картка чернетки'],
      ['edit-loaded', 'Редагування чернетки'],
      ['edit-stale', 'Чернетка змінилася — введені значення збережено'],
    ].map(([state, title]) => ({
      file: `41-${role}-vacancy-form-${state}`,
      heading: `${title} (${label})`,
      dir: VAC,
    })),
  })),
  {
    screen: 'Скасування й видалення чернетки',
    role: 'Рекрутер',
    roles: ['Рекрутер'],
    states: [
      ['cancel-empty', 'Скасування — причина обов’язкова'],
      ['cancel-filled', 'Скасування — багаторядкова причина'],
      ['cancel-max-reason', 'Скасування — причина на межі 500 символів'],
      ['cancel-stale', 'Скасування — дані вже змінилися'],
      ['cancel-long-title', 'Скасування — назва на межі 200 символів'],
      [
        'cancel-long-title-320',
        'Скасування — назва на межі 200 символів, екран 320 px',
      ],
      ['cancel-pending', 'Скасування — очікування відповіді'],
      ['delete-draft', 'Видалення чернетки'],
      ['delete-cancelled', 'Видалення скасованої чернетки'],
      ['cancelled-card', 'Картка скасованої чернетки'],
    ].map(([state, title]) => ({
      file: `41-recruiter-vacancy-form-${state}`,
      heading: title,
      dir: VAC,
      ...(state.endsWith('-320')
        ? { variants: ['mobile-light', 'mobile-dark'] }
        : {}),
    })),
  },
  ...[
    ['admin', 'Адміністратор'],
    ['head-recruiter', 'Керівник рекрутингу'],
    ['recruiter', 'Рекрутер'],
  ].map(([role, label]) => ({
    screen: 'Створення вакансії',
    role: label,
    roles: [label],
    states: [
      ['empty', 'Порожня форма'],
      ['draft-errors', 'Мінімальні поля чернетки — помилки'],
      ['position-picker', 'Вибір посади'],
      ['filled', 'Заповнена форма'],
      ['salary-errors', 'Помилки зарплатної вилки'],
      ['rate-limited', 'Обмеження частоти — значення збережено'],
      ['publish-errors', 'Публікація — зведення помилок'],
    ].map(([state, title]) => ({
      file: `40-${role}-vacancy-form-${state}`,
      heading: `${title} (${label})`,
      dir: 'phase-2',
    })),
  })),
  {
    screen: 'Чернетки та форми — нові стани (Рекрутер)',
    role: 'Рекрутер',
    roles: ['Рекрутер'],
    states: [
      [
        '41',
        'incomplete-draft-menu',
        'Чернетка без посади — «Опублікувати» недоступне, причина в меню',
        BOTH,
      ],
      [
        '41',
        'incomplete-draft-card',
        'Чернетка без посади — причина біля кнопки «Опублікувати» (підказка на компʼютері, текст на телефоні)',
        BOTH,
      ],
      [
        '41',
        'drafts-empty',
        'Чернетки 0 — порожній список власних чернеток',
        BOTH,
      ],
      ['41', 'edit-loading', 'Редагування — завантаження форми', LIGHT],
      [
        '41',
        'edit-not-draft',
        'Редагування — вакансію вже опубліковано, форми немає',
        LIGHT,
      ],
      [
        '41',
        'publish-refused',
        'Редагування — публікацію відхилено: посада неактивна, поле позначено',
        BOTH,
      ],
      [
        '41',
        'toast-published',
        'Сповіщення — вакансію опубліковано, дія «Відкрити»',
        BOTH,
      ],
      [
        '40',
        'position-empty',
        'Створення — у вертикалі немає активних посад',
        LIGHT,
      ],
      [
        '40',
        'draft-limit',
        'Створення — ліміт чернеток: «Зберегти чернетку» недоступна, причина в підказці (компʼютер) або під кнопкою (телефон)',
        BOTH,
      ],
      [
        '40',
        'pending-create',
        'Створення — очікування відповіді сервера',
        LIGHT,
      ],
      ['40', 'loading', 'Створення — завантаження форми', LIGHT],
      [
        '40',
        'leave-guard',
        'Створення — вихід із формою без збереження: діалог і шторка',
        ['desktop-light', 'desktop-dark', 'mobile-light', 'mobile-dark'],
      ],
    ].map(([prefix, state, heading, variants]) => ({
      file: `${prefix}-recruiter-vacancy-form-${state}`,
      heading,
      dir: VAC,
      variants,
    })),
  },
  {
    screen: 'Створення вакансії — зміна вертикалі',
    role: 'Адміністратор',
    roles: ['Адміністратор'],
    states: [
      {
        file: '40-admin-vacancy-form-vertical-changed',
        heading:
          'Зміна вертикалі — посаду й тімліда скинуто, про це сказано під полем',
        dir: VAC,
        variants: LIGHT,
      },
    ],
  },
  {
    screen: 'Вакансії — порожній список без права створювати',
    role: 'Тімлід, Керівник HR, HR-менеджер',
    roles: ['Тімлід', 'Керівник HR', 'HR-менеджер'],
    states: [
      {
        file: '32-team-lead-vacancies-empty',
        heading:
          'Вакансії — вакансій поки немає: без кнопки створення (так само Керівник HR і HR-менеджер)',
        dir: VAC,
        variants: LIGHT,
      },
    ],
  },
  {
    screen: 'Нова вакансія без доступу',
    role: 'HR-менеджер, Керівник HR, Тімлід, Фінансист',
    roles: ['HR-менеджер', 'Керівник HR', 'Тімлід', 'Фінансист'],
    states: [
      {
        file: '40-hr-vacancy-form-denied',
        heading:
          'Нова вакансія — «Сторінку не знайдено» (справжній HTTP 404): так само Керівник HR, Тімлід і Фінансист',
        dir: VAC,
        variants: LIGHT,
      },
    ],
  },
  {
    screen: 'Вакансії — список',
    role: 'Адміністратор, Керівник рекрутингу, Рекрутер, Тімлід, Керівник HR',
    roles: [
      'Адміністратор',
      'Керівник рекрутингу',
      'Рекрутер',
      'Тімлід',
      'Керівник HR',
    ],
    states: [
      {
        file: '30-admin-vacancies-list',
        label: 'адміністратор',
        dir: VAC,
        heading:
          'Вакансії — Адміністратор бачить усі 12 вакансій обох вертикалей; праворуч огляд вибраної вакансії (на телефоні — картки)',
      },
      {
        file: '30-head-recruiter-vacancies-list',
        label: 'керівник рекрутингу',
        dir: VAC,
        heading:
          'Вакансії — Керівник рекрутингу бачить лише вакансії Гемблінгу (9 з 12)',
      },
      {
        file: '30-recruiter-vacancies-list',
        label: 'рекрутер',
        dir: VAC,
        heading:
          'Вакансії — Рекрутер (Марія Шевченко): призначені вакансії та вільні відкриті у своїй вертикалі',
      },
      {
        file: '30-team-lead-vacancies-list',
        label: 'тімлід',
        dir: VAC,
        heading:
          'Вакансії — Тімлід (Василь Мороз): лише власні вакансії, зокрема з дуже довгою назвою',
      },
      {
        file: '30-head-hr-vacancies-list',
        label: 'керівник HR',
        dir: VAC,
        heading:
          'Вакансії — Керівник HR бачить усі вакансії двох вертикалей. Так само бачить HR-менеджер',
      },
    ],
  },
  {
    screen: 'Вакансії — поділитися посиланням',
    role: 'Адміністратор',
    roles: ['Адміністратор'],
    states: [
      {
        file: '47-admin-vacancy-share-clipboard-blocked',
        dir: VAC,
        variants: LIGHT,
        heading:
          'Буфер обміну заблоковано — повне посилання виділено в полі, кнопка «Закрити»',
      },
    ],
  },
  {
    screen: 'Вакансії — картка',
    role: 'Адміністратор, Тімлід, Рекрутер, Керівник рекрутингу',
    roles: ['Адміністратор', 'Тімлід', 'Рекрутер', 'Керівник рекрутингу'],
    states: [
      {
        file: '31-admin-vacancy-detail',
        label: 'термінова',
        dir: VAC,
        heading: 'Картка вакансії — термінова: команда, умови, дати',
      },
      {
        file: '31-admin-vacancy-detail-urgent-on-hold',
        label: 'термінова, призупинена',
        dir: VAC,
        heading:
          'Картка вакансії — термінова на паузі: червоний акцент разом із бейджем статусу',
      },
      {
        file: '31-admin-vacancy-detail-urgent-cancelled',
        label: 'термінова, скасована',
        dir: VAC,
        heading:
          'Картка вакансії — термінова, але скасована: нейтральна позначка без червоного',
      },
      {
        file: '31-admin-vacancy-detail-urgent-filled',
        label: 'термінова, заповнена',
        dir: VAC,
        heading:
          'Картка вакансії — термінова, але заповнена: нейтральна позначка без червоного',
      },
      {
        file: '31-team-lead-vacancy-detail-long-title',
        label: 'довга назва',
        dir: VAC,
        heading:
          'Картка вакансії — дуже довга назва переноситься без горизонтальної прокрутки',
      },
      {
        file: '31-recruiter-vacancy-detail-no-team-lead',
        label: 'без тімліда',
        dir: VAC,
        heading:
          'Картка вакансії — ініціатива рекрутера, тімліда ще не призначено',
      },
      {
        file: '32-head-recruiter-vacancy-not-found',
        label: 'недоступна',
        dir: VAC,
        heading:
          'Картка вакансії — вакансія іншої вертикалі або видалена: «Сторінку не знайдено» (справжній HTTP 404)',
      },
    ],
  },
  {
    screen: 'Вакансії — терміновість',
    role: 'Адміністратор, Керівник рекрутингу, Тімлід',
    roles: ['Адміністратор', 'Керівник рекрутингу', 'Тімлід'],
    states: [
      {
        file: '48-admin-vacancy-urgency-open',
        dir: VAC,
        variants: ['desktop-light', 'desktop-dark'],
        heading:
          'Термінова відкрита вакансія — червона шапка й перемикач «Звичайна / Термінова». Так само бачить Керівник рекрутингу',
      },
      {
        file: '48-head-recruiter-vacancy-urgency-filled',
        dir: VAC,
        variants: LIGHT,
        label: 'заповнена',
        heading:
          'Термінова, але заповнена — нейтральна шапка й примітка про закриття, перемикача немає (Керівник рекрутингу; так само бачить Адміністратор)',
      },
      {
        file: '48-head-recruiter-vacancy-urgency-switching',
        dir: VAC,
        variants: ['mobile-light'],
        heading:
          'Телефон: звичайну вакансію перемикають на термінову — шапка червоніє одразу, ще до відповіді сервера (Керівник рекрутингу)',
      },
      {
        file: '48-team-lead-vacancy-urgency-open',
        dir: VAC,
        variants: ['mobile-light'],
        heading:
          'Телефон, Тімлід: термінова відкрита вакансія — червона шапка, перемикача терміновості немає',
      },
    ],
  },
  {
    screen: 'Вакансії — команда: рекрутери й тімлід',
    role: 'Керівник рекрутингу, Рекрутер',
    roles: ['Керівник рекрутингу', 'Рекрутер'],
    states: [
      {
        file: '49-head-recruiter-vacancy-team-unassigned',
        dir: VAC,
        variants: ['desktop-light', 'desktop-dark'],
        heading:
          'Вакансія з ініціативи рекрутера: тімліда й рекрутерів ще немає — кнопки «Призначити тімліда» та «Призначити рекрутера» (Керівник рекрутингу; так само Адміністратор)',
      },
      {
        file: '49-head-recruiter-vacancy-team-assign-dialog',
        dir: VAC,
        variants: ['desktop-light', 'desktop-dark'],
        heading:
          '«Призначити рекрутера» — один уже призначений, один вибраний, кількість у кнопці',
      },
      {
        file: '49-head-recruiter-vacancy-team-lead-dialog',
        dir: VAC,
        variants: LIGHT,
        heading:
          '«Призначити тімліда» — попередження, що тімліда призначають лише раз, вибрано одного',
      },
      {
        file: '49-head-recruiter-vacancy-team-remove-confirm',
        dir: VAC,
        variants: LIGHT,
        heading:
          '«Прибрати рекрутера з вакансії?» — останній рекрутер: вакансія стане вільною',
      },
      {
        file: '49-recruiter-vacancy-team-claim-confirm',
        dir: VAC,
        variants: LIGHT,
        label: 'Рекрутер',
        heading:
          'Рекрутер: вільна вакансія — кнопка «Взяти вакансію» у блоці «Команда» і підтвердження',
      },
      {
        file: '49-recruiter-vacancy-team-claim-list',
        dir: VAC,
        variants: ['mobile-light'],
        heading:
          'Телефон, Рекрутер: у списку вільна вакансія з кнопкою «Взяти вакансію» на всю ширину й шторка підтвердження',
      },
    ],
  },
  {
    screen: 'Вакансії — статуси: призупинити, скасувати, відкрити знову',
    role: 'Керівник рекрутингу, Тімлід',
    roles: ['Керівник рекрутингу', 'Тімлід'],
    states: [
      {
        file: '50-head-recruiter-vacancy-status-on-hold',
        dir: VAC,
        variants: LIGHT,
        heading:
          'Призупинена вакансія без рекрутера — примітка про паузу, кнопка «Відновити» (Керівник рекрутингу)',
      },
      {
        file: '50-team-lead-vacancy-status-menu',
        dir: VAC,
        variants: ['mobile-light'],
        heading:
          'Телефон, Тімлід: власна відкрита вакансія — «Призупинити» й меню «⋯» з пунктом «Скасувати вакансію…»',
      },
      {
        file: '50-team-lead-vacancy-status-cancel-sheet',
        dir: VAC,
        variants: ['mobile-light'],
        heading:
          'Телефон, Тімлід: «Скасувати вакансію?» — причина введена, лічильник символів',
      },
      {
        file: '50-head-recruiter-vacancy-status-cancel-dialog',
        dir: VAC,
        variants: ['desktop-light', 'desktop-dark'],
        heading:
          '«Скасувати вакансію?» — причина введена, кнопка скасування активна (Керівник рекрутингу)',
      },
      {
        file: '50-head-recruiter-vacancy-status-cancelled',
        dir: VAC,
        variants: LIGHT,
        label: 'скасована',
        heading:
          'Скасована вакансія — повідомлення про скасування, причина, жодних дій; кнопки «Клонувати» ще немає (функцію не створено)',
      },
      {
        file: '50-head-recruiter-vacancy-status-reopen-sheet',
        dir: VAC,
        variants: ['mobile-light'],
        heading:
          'Телефон: заповнена вакансія — «Відкрити знову» і шторка з кількістю місць 2 → 3 (Керівник рекрутингу)',
      },
      {
        file: '50-head-recruiter-vacancy-status-reopen-dialog',
        dir: VAC,
        variants: LIGHT,
        heading:
          '«Відкрити вакансію знову?» — кількість місць за замовчуванням (Керівник рекрутингу)',
      },
    ],
  },
  {
    screen: 'Вакансії — пошук і фільтри',
    role: 'Керівник рекрутингу, Адміністратор',
    roles: ['Керівник рекрутингу', 'Адміністратор'],
    states: [
      {
        file: '32-admin-vacancies-header-vertical-crypto',
        label: 'вертикаль у шапці',
        dir: VAC,
        variants: ['desktop-light', 'desktop-dark'],
        heading:
          'Вакансії — вертикаль «Крипто» вибрана в шапці: список і фільтр «Вертикаль» звужені до трьох вакансій (на телефоні перемикача в шапці немає)',
      },
      {
        file: '32-head-recruiter-vacancies-filtered',
        label: 'пошук',
        dir: VAC,
        heading:
          'Вакансії — пошук «tiktok» знайшов три вакансії; «Скинути фільтри» доступне',
      },
      {
        file: '32-admin-vacancies-status-chips',
        label: 'фільтр статусу',
        dir: VAC,
        heading:
          'Вакансії — фільтр «Статус» чипами: вибрано «Відкриті», «Чернетки» бачить автор чернеток',
      },
      {
        file: '32-admin-vacancies-filtered-empty',
        label: 'нічого не знайдено',
        dir: VAC,
        heading:
          'Вакансії — нічого не знайдено за фільтрами і працююче «Скинути фільтри»',
      },
    ],
  },
  {
    screen: 'Вакансії — стани',
    role: 'Адміністратор',
    roles: ['Адміністратор'],
    states: [
      {
        file: '32-admin-vacancies-refreshing',
        label: 'оновлення',
        dir: VAC,
        heading:
          'Вакансії — оновлення списку: попередній список приглушено, поруч повідомлення «Оновлюємо список…»',
      },
      {
        file: '32-admin-vacancies-error',
        label: 'помилка',
        dir: VAC,
        heading: 'Вакансії — помилка завантаження з можливістю повторити',
      },
      {
        file: '32-admin-vacancies-empty',
        label: 'порожньо',
        dir: VAC,
        heading:
          'Вакансії — вакансій поки немає: Адміністратор, з кнопкою «Створити вакансію»',
      },
      {
        file: '32-admin-vacancies-preview-selected',
        label: 'вибрана вакансія',
        dir: VAC,
        variants: ['desktop-light', 'desktop-dark'],
        heading:
          'Вакансії — огляд іде за вибраним рядком (приклад: вакансія з довгою назвою)',
      },
      {
        file: '32-admin-vacancies-preview-urgent-open',
        label: 'огляд, термінова відкрита',
        dir: VAC,
        variants: ['desktop-light', 'desktop-dark'],
        heading: 'Вакансії — огляд термінової відкритої вакансії (червоний)',
      },
      {
        file: '32-admin-vacancies-preview-urgent-on-hold',
        label: 'огляд, термінова призупинена',
        dir: VAC,
        variants: ['desktop-light', 'desktop-dark'],
        heading: 'Вакансії — огляд термінової призупиненої вакансії (червоний)',
      },
      {
        file: '32-admin-vacancies-preview-urgent-cancelled',
        label: 'огляд, термінова скасована',
        dir: VAC,
        variants: ['desktop-light', 'desktop-dark'],
        heading:
          'Вакансії — огляд термінової скасованої вакансії (без червоного)',
      },
      {
        file: '32-admin-vacancies-preview-urgent-filled',
        label: 'огляд, термінова заповнена',
        dir: VAC,
        variants: ['desktop-light', 'desktop-dark'],
        heading:
          'Вакансії — огляд термінової заповненої вакансії (без червоного)',
      },
      {
        file: '32-admin-vacancies-preview-error',
        label: 'помилка огляду',
        dir: VAC,
        variants: ['desktop-light', 'desktop-dark'],
        heading: 'Вакансії — помилка лише в огляді, список працює',
      },
    ],
  },
  {
    screen: 'Вакансії без доступу',
    role: 'Фінансист',
    roles: ['Фінансист'],
    states: [
      {
        file: '30-finance-vacancies-denied',
        label: 'фінансист',
        dir: VAC,
        heading:
          'Вакансії — «Сторінку не знайдено» в застосунку для Фінансиста (справжній HTTP 404)',
      },
    ],
  },
];

const POSITION_ROLES = {
  admin: 'Адміністратор',
  'head-recruiter': 'Керівник рекрутингу',
};
/** `33-<role>-positions-<state>`: the shots are taken by tests/e2e/positions-screens.spec.ts. */
const positionState = (role, state, heading) => ({
  file: `33-${role}-positions-${state}`,
  label: POSITION_ROLES[role],
  dir: VAC,
  heading: `${heading} (${POSITION_ROLES[role]})`,
});
const bothRoles = (state, heading) =>
  Object.keys(POSITION_ROLES).map((role) =>
    positionState(role, state, heading),
  );
const POSITION_ACCESS = 'Адміністратор, Керівник рекрутингу';

/** «Довідник посад» (V2a T3, D76): Admin and Head Recruiter; data is a fixed Ukrainian catalog served to the page, not the shared database. */
groups2.push(
  {
    screen: 'Довідник посад — список',
    role: POSITION_ACCESS,
    roles: Object.values(POSITION_ROLES),
    states: [
      positionState(
        'admin',
        'list',
        'Довідник посад — посади згруповано за вертикалями, довга назва переноситься, праворуч дії; на телефоні — картки',
      ),
      positionState(
        'head-recruiter',
        'list',
        'Довідник посад — одна вертикаль: плоский список без фільтра вертикалі',
      ),
      positionState(
        'admin',
        'list-vertical',
        'Довідник посад — вибрано одну вертикаль: підзаголовок називає її, груп немає',
      ),
      ...bothRoles(
        'list-inactive',
        'Довідник посад — «Показати неактивні»: неактивна посада з дією «Активувати»',
      ),
    ],
  },
  {
    screen: 'Довідник посад — стани списку',
    role: POSITION_ACCESS,
    roles: Object.values(POSITION_ROLES),
    states: [
      ...bothRoles(
        'loading',
        'Довідник посад — завантаження: заголовок і фільтри на місці, у списку скелет',
      ),
      ...bothRoles(
        'empty',
        'Довідник посад — посад ще немає, є кнопка «Додати посаду»',
      ),
      positionState(
        'admin',
        'empty-group',
        'Довідник посад — вертикаль без посад усередині згрупованого списку',
      ),
      ...bothRoles(
        'all-inactive',
        'Довідник посад — усі посади неактивні, пропонується показати їх',
      ),
      ...bothRoles(
        'error',
        'Довідник посад — помилка завантаження з можливістю повторити',
      ),
    ],
  },
  {
    screen: 'Довідник посад — нова посада',
    role: POSITION_ACCESS,
    roles: Object.values(POSITION_ROLES),
    states: [
      ...bothRoles(
        'create',
        'Нова посада — порожня форма (з вибором вертикалі лише для кількох вертикалей; на телефоні — нижня панель)',
      ),
      positionState(
        'admin',
        'create-invalid-vertical',
        'Нова посада — не вибрано вертикаль і занадто коротка назва',
      ),
      ...bothRoles(
        'create-invalid-length',
        'Нова посада — назва довша за 80 символів',
      ),
      ...bothRoles(
        'create-duplicate',
        'Нова посада — посада з такою назвою вже є',
      ),
      ...bothRoles(
        'create-duplicate-inactive',
        'Нова посада — така назва є в неактивної посади, підказано активувати її',
      ),
      ...bothRoles(
        'long-name',
        'Нова посада — назва з 80 символів переноситься без горизонтальної прокрутки',
      ),
      positionState(
        'admin',
        'created-toast',
        'Довідник посад — посаду створено: сповіщення і новий рядок із нулем відкритих вакансій',
      ),
    ],
  },
  {
    screen: 'Довідник посад — перейменування і деактивація',
    role: POSITION_ACCESS,
    roles: Object.values(POSITION_ROLES),
    states: [
      ...bothRoles(
        'rename',
        'Перейменування — поточна назва, підказка «Назва не змінилася»',
      ),
      ...bothRoles(
        'rename-stale',
        'Перейменування — посаду щойно змінили, дані оновлено, можна повторити',
      ),
      ...bothRoles(
        'deactivate',
        'Деактивація — підтвердження для посади без відкритих вакансій',
      ),
      ...bothRoles(
        'deactivate-open',
        'Деактивація — попередження про дві відкриті вакансії (вони не блокують дію)',
      ),
    ],
  },
  {
    screen: 'Довідник посад — вхід і доступ',
    role: `${POSITION_ACCESS}, Рекрутер, Фінансист`,
    roles: [...Object.values(POSITION_ROLES), 'Рекрутер', 'Фінансист'],
    states: [
      ...bothRoles(
        'entry',
        'Вакансії — кнопка «Довідник посад» у заголовку є лише тим, хто керує довідником',
      ),
      {
        file: '33-recruiter-positions-no-entry',
        label: 'рекрутер',
        dir: VAC,
        heading: 'Вакансії — Рекрутер не бачить кнопки «Довідник посад»',
      },
      {
        file: '33-recruiter-positions-denied',
        label: 'рекрутер',
        dir: VAC,
        heading:
          'Довідник посад — «Сторінку не знайдено» в застосунку для Рекрутера (справжній HTTP 404; так само Тімлід, HR-менеджер, Керівник HR)',
      },
      {
        file: '33-finance-positions-denied',
        label: 'фінансист',
        dir: VAC,
        heading:
          'Довідник посад — «Сторінку не знайдено» в застосунку для Фінансиста (справжній HTTP 404)',
      },
      positionState(
        'admin',
        'mfa-redirect',
        'Довідник посад — Адміністратор без коду 2FA потрапляє на сторінку підтвердження зі шляхом назад',
      ),
      positionState(
        'admin',
        'mfa-alert',
        'Довідник посад — код 2FA втрачено під час сеансу: повідомлення з кнопкою «Підтвердити вхід», дані не змінено',
      ),
    ],
  },
);

const DIALOG_DESKTOP = ['desktop-light', 'desktop-dark'];
const dialogState = (state, heading, variants) => ({
  file: `34-admin-ui-dialogs-${state}`,
  label: 'адміністратор',
  dir: VAC,
  heading,
  ...(variants ? { variants } : {}),
});

/** Dev gallery `/dev/ui` (UI foundation F8): the shots are taken by tests/dev-ui/dialog-screens.spec.ts. */
groups2.push(
  {
    screen: 'Каркас інтерфейсу — діалоги',
    role: 'Адміністратор (галерея розробника)',
    roles: ['Адміністратор'],
    states: [
      dialogState(
        'dialog-sm',
        'Діалог малий (28 rem): шапка з іконкою й підзаголовком, дії праворуч',
        DIALOG_DESKTOP,
      ),
      dialogState(
        'dialog-md',
        'Діалог середній (36 rem); на телефоні — нижня шторка з діями в стовпчик, головна дія внизу',
      ),
      dialogState('dialog-lg', 'Діалог великий (48 rem)', DIALOG_DESKTOP),
    ],
  },
  {
    screen: 'Каркас інтерфейсу — підтвердження',
    role: 'Адміністратор (галерея розробника)',
    roles: ['Адміністратор'],
    states: [
      dialogState(
        'confirm-neutral',
        'Підтвердження — нейтральна дія: фокус на «Скасувати»',
      ),
      dialogState(
        'confirm-destructive',
        'Підтвердження — небезпечна дія з переліком наслідків: кнопка червона',
      ),
      dialogState(
        'confirm-reason-empty',
        'Підтвердження з причиною — кнопка недоступна, поки в полі немає тексту; на телефоні причину видно під кнопкою',
      ),
      dialogState(
        'confirm-reason-filled',
        'Підтвердження з причиною — текст введено, кнопка активна, лічильник символів',
      ),
      dialogState(
        'confirm-pending',
        'Підтвердження — запит виконується: індикатор у кнопці, ширина кнопок не змінюється',
      ),
      dialogState(
        'confirm-conflict',
        'Підтвердження — помилка 409 показана в самому діалозі, причину збережено',
      ),
      dialogState(
        'confirm-worst',
        'Підтвердження — довга назва в лапках і причина з 500 символів переносяться без горизонтальної прокрутки',
      ),
      dialogState(
        'confirm-long-labels',
        'Підтвердження — довгі підписи кнопок (31 і 58 символів) переносяться, дії лишаються в діалозі',
      ),
    ],
  },
  {
    screen: 'Каркас інтерфейсу — шари й шторка',
    role: 'Адміністратор (галерея розробника)',
    roles: ['Адміністратор'],
    states: [
      dialogState(
        'layers-select-open',
        'Випадний список відкривається над діалогом і не обрізається ним',
      ),
      dialogState(
        'sheet-400',
        'Бокова шторка 400 px; на телефоні займає всю ширину',
      ),
    ],
  },
);

groups2.push({
  screen: 'Каркас інтерфейсу — фільтри',
  role: 'Адміністратор (галерея розробника)',
  roles: ['Адміністратор'],
  states: [
    {
      file: '35-admin-ui-filter-chips-states',
      label: 'адміністратор',
      dir: VAC,
      heading:
        'Фільтри статусів — лічильники, вибраний останній статус, недоступні та порожні стани; на телефоні рядок прокручується',
    },
    {
      file: '36-admin-ui-filter-bar-idle',
      label: 'панель фільтрів, спокій',
      dir: VAC,
      heading: 'Панель фільтрів — елементи керування й результати без затримки',
    },
    {
      file: '36-admin-ui-filter-bar-busy',
      label: 'панель фільтрів, оновлення',
      dir: VAC,
      heading:
        'Панель фільтрів — результати тьмяніють лише після 150 мс, елементи керування залишаються доступними',
    },
  ],
});

groups2.push({
  screen: 'Каркас інтерфейсу — сторінка',
  role: 'Адміністратор (галерея розробника)',
  roles: ['Адміністратор'],
  states: [
    {
      file: '37-admin-ui-page-frame-header',
      label: 'шапка з дією',
      dir: VAC,
      heading:
        'Шапка сторінки — дії в порядку [другорядна, основна]; на телефоні основна дія в нижній панелі',
    },
    {
      file: '37-admin-ui-page-frame-row-menu',
      label: 'меню рядка',
      dir: VAC,
      heading:
        'Меню дій рядка — безпечні дії, недоступна з причиною, руйнівні після роздільника',
    },
    {
      file: '37-admin-ui-page-frame-form',
      label: 'сторінка форми',
      dir: VAC,
      heading:
        'Сторінка форми — посилання назад, заголовок, нижня панель «Скасувати / Зберегти чернетку / Створити вакансію»',
    },
    {
      file: '37-admin-ui-page-frame-leave-dialog',
      label: 'вихід без збереження',
      dir: VAC,
      heading:
        'Незбережені зміни — підтвердження перед виходом посиланням, кнопкою «Назад» або закриттям вкладки',
    },
    {
      file: '38-admin-ui-page-frame-skeletons',
      label: 'скелети рядка й форми',
      dir: VAC,
      heading:
        'Скелети — рядок списку й форма мають ті самі рамки, що й завантажений вигляд (внизу пари: скелет і готовий вміст)',
    },
    {
      file: '38-admin-ui-page-frame-preview-header',
      label: 'шапка перегляду',
      dir: VAC,
      heading:
        'Шапка перегляду вакансії — дії в порядку [другорядна, основна, меню], назва до трьох рядків, довге слово й розмітка як текст',
    },
    {
      file: '38-admin-ui-page-frame-empty',
      label: 'порожній стан',
      dir: VAC,
      heading:
        'Порожній стан — з кнопкою створення лише коли є право, без кнопки інакше',
    },
  ],
});

groups2.push(
  ...[
    {
      screen: 'Картка вакансії: опис і вимоги',
      role: 'Рекрутер, Тімлід, Керівник рекрутингу, Адміністратор, HR',
      roles: [
        'Рекрутер',
        'Тімлід',
        'Керівник рекрутингу',
        'Адміністратор',
        'HR',
      ],
      states: [
        {
          file: '51-recruiter-vacancy-content-card-editable',
          label: 'Рекрутер',
          dir: VAC,
          heading: 'Можна редагувати: є кнопка «Редагувати опис і вимоги»',
        },
        {
          file: '51-team-lead-vacancy-content-card-editable',
          label: 'Тімлід',
          dir: VAC,
          heading: 'Можна редагувати: тімлід своєї вакансії',
        },
        {
          file: '51-head-recruiter-vacancy-content-card-editable',
          label: 'Керівник рекрутингу',
          dir: VAC,
          heading: 'Можна редагувати: керівник рекрутингу',
        },
        {
          file: '51-admin-vacancy-content-card-editable',
          label: 'Адміністратор',
          dir: VAC,
          heading: 'Можна редагувати: адміністратор',
        },
        {
          file: '51-hr-vacancy-content-card-readonly',
          label: 'HR',
          dir: VAC,
          heading: 'Лише перегляд: без кнопки редагування',
        },
        {
          file: '51-recruiter-vacancy-content-card-empty',
          label: 'Рекрутер',
          dir: VAC,
          heading: 'Опис і вимоги ще не додано',
        },
        {
          file: '51-recruiter-vacancy-content-card-loading',
          label: 'Рекрутер',
          dir: VAC,
          heading: 'Завантаження блока',
        },
        {
          file: '51-recruiter-vacancy-content-card-error',
          label: 'Рекрутер',
          dir: VAC,
          heading: 'Помилка завантаження блока з повтором',
        },
        {
          file: '51-recruiter-vacancy-content-card-filled',
          label: 'Рекрутер',
          dir: VAC,
          heading: 'Заповнена вакансія: без кнопки редагування',
        },
      ],
    },
    {
      screen: 'Редагування опису і вимог',
      role: 'Рекрутер, Тімлід, Керівник рекрутингу, Адміністратор, HR',
      roles: [
        'Рекрутер',
        'Тімлід',
        'Керівник рекрутингу',
        'Адміністратор',
        'HR',
      ],
      states: [
        {
          file: '52-recruiter-vacancy-content-edit-loaded',
          label: 'Рекрутер',
          dir: VAC,
          heading: 'Форма редагування',
        },
        {
          file: '52-team-lead-vacancy-content-edit-loaded',
          label: 'Тімлід',
          dir: VAC,
          heading: 'Форма редагування: тімлід',
        },
        {
          file: '52-head-recruiter-vacancy-content-edit-loaded',
          label: 'Керівник рекрутингу',
          dir: VAC,
          heading: 'Форма редагування: керівник рекрутингу',
        },
        {
          file: '52-admin-vacancy-content-edit-loaded',
          label: 'Адміністратор',
          dir: VAC,
          heading: 'Форма редагування: адміністратор',
        },
        {
          file: '52-hr-vacancy-content-edit-readonly',
          label: 'HR',
          dir: VAC,
          heading: 'Немає права редагувати: лише текст',
        },
        {
          file: '52-recruiter-vacancy-content-edit-loading',
          label: 'Рекрутер',
          dir: VAC,
          heading: 'Завантаження форми',
        },
        {
          file: '52-recruiter-vacancy-content-edit-cleared',
          label: 'Рекрутер',
          dir: VAC,
          heading: 'Поле позначено до очищення',
        },
        {
          file: '52-recruiter-vacancy-content-edit-saving',
          label: 'Рекрутер',
          dir: VAC,
          heading: 'Збереження',
        },
        {
          file: '52-recruiter-vacancy-content-edit-saved',
          label: 'Рекрутер',
          dir: VAC,
          heading: 'Зміни збережено',
        },
        {
          file: '52-recruiter-vacancy-content-edit-validation',
          label: 'Рекрутер',
          dir: VAC,
          heading: 'Помилка перевірки поля',
        },
        {
          file: '52-recruiter-vacancy-content-edit-stale',
          label: 'Рекрутер',
          dir: VAC,
          heading: 'Конфлікт версій: дані вже змінив інший користувач',
        },
        {
          file: '52-recruiter-vacancy-content-edit-stale-dialog',
          label: 'Рекрутер',
          dir: VAC,
          heading: 'Підтвердження завантаження актуальної версії',
        },
        {
          file: '52-recruiter-vacancy-content-edit-closed-while-editing',
          label: 'Рекрутер',
          dir: VAC,
          heading: 'Вакансію закрили під час редагування',
        },
        {
          file: '52-recruiter-vacancy-content-edit-permission-lost',
          label: 'Рекрутер',
          dir: VAC,
          heading: 'Право редагування змінилося',
        },
        {
          file: '52-recruiter-vacancy-content-edit-save-failed',
          label: 'Рекрутер',
          dir: VAC,
          heading: 'Не вдалося зберегти',
        },
        {
          file: '52-recruiter-vacancy-content-edit-chunk-failed',
          label: 'Рекрутер',
          dir: VAC,
          heading: 'Редактор не завантажився: повтор у кожному полі',
        },
        {
          file: '52-recruiter-vacancy-content-edit-leave-guard',
          label: 'Рекрутер',
          dir: VAC,
          heading: 'Вихід із незбереженими змінами',
        },
        {
          file: '52-recruiter-vacancy-content-edit-filled',
          label: 'Рекрутер',
          dir: VAC,
          heading: 'Заповнена вакансія: редагування закрито',
        },
        {
          file: '52-recruiter-vacancy-content-edit-cancelled',
          label: 'Рекрутер',
          dir: VAC,
          heading: 'Скасована вакансія: редагування закрито',
        },
        {
          file: '52-recruiter-vacancy-content-edit-unavailable',
          label: 'Рекрутер',
          dir: VAC,
          heading: 'Вакансія недоступна',
        },
        {
          file: '52-recruiter-vacancy-content-edit-read-error',
          label: 'Рекрутер',
          dir: VAC,
          heading: 'Помилка завантаження з повтором',
        },
      ],
    },
  ],
);

mkdirSync('screenshots/latest', { recursive: true });
const listed = {
  'phase-1': new Set(),
  'phase-2': new Set(),
  foundation: new Set(),
};
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
    if (dir !== 'foundation')
      copyFileSync(source, `screenshots/latest/${name}`);
    const href = linkOut && dir === 'foundation' ? `../${dir}/${name}` : name;
    const text = caption(label, variant);
    return `<figure><a href="${href}"><img src="${href}" alt="${heading} — ${text.toLocaleLowerCase('uk')}" loading="lazy"></a><figcaption>${text}</figcaption></figure>`;
  });

const tableOfContents = (list) =>
  list
    .map(
      (group) =>
        `<li><a href="#${anchor(group.states[0].file)}">${group.screen}</a> (${group.role}): ${group.states.map((state) => state.heading).join('; ')}</li>`,
    )
    .join('\n');
const sectionsOf = (list) =>
  list.map(
    (group) =>
      `<section><p class="screen">${group.screen} · ${group.role}</p>\n${group.states
        .map(
          (state) =>
            `<h2 id="${anchor(state.file)}">${state.heading}</h2><div class="grid">${figures(state, true).join('\n')}</div>`,
        )
        .join('\n')}</section>`,
  );
const rolesOf = (list) => [...new Set(list.flatMap((group) => group.roles))];

const intro = `<p>Ролі: ${rolesOf(groups).join(', ')}; також сторінки без входу. Теми: світла й темна. Екрани: компʼютер 1440×900 і телефон 390×844; навігація — планшет 900×900 і телефон.</p>
<p>Ролі з доступом до вакансій після входу бачать «Вакансії» і «Профіль» (сторінку вакансій показано в <a href="../phase-2/index.html">галереї фази 2</a>); Фінансист — лише «Профіль». Ролі з однаковим виглядом показано одним знімком, підпис називає, хто ще бачить так само.</p>
<p>Дані — демо-дані: ті самі люди, що й у демо-версії. Щоб знімки не змінювалися, час входів, сесії, дати в історії картки й дати створення вертикалей зафіксовано; журнал дій показує підготовлені записи з цими людьми. QR-код і ключ 2FA — зразки, справжній пристрій не створюється. Вертикаль «Дейтинг», порожній список вертикалей і дійсне запрошення — лише приклади станів. Сторінку 404 узято з <a href="../foundation/index.html">галереї фундаменту</a>.</p>
<nav aria-label="Розділи"><ul>
${tableOfContents(groups)}
</ul></nav>`;
const intro2 = `<p>Ролі: ${rolesOf(groups2).join(', ')}. Теми: світла й темна. Екрани: компʼютер 1440×900 і телефон 390×844 (картки замість таблиці, без бічного огляду).</p>
<p>Фаза 2: перегляд вакансій — список, пошук за назвою чи номером (V-0001), фільтри за вертикаллю й статусом, огляд і картка; «Довідник посад» для Адміністратора і Керівника рекрутингу; створення вакансій та власні чернетки з редагуванням, публікацією, скасуванням і видаленням; терміновість, команда вакансії (призначити або взяти рекрутера, призначити тімліда), призупинення, скасування з причиною й повторне відкриття. Кандидати й бонуси з’являться на наступних етапах. Ролі з однаковим виглядом показано одним знімком.</p>
<p>Дані — демо-дані з 12 доступних вакансій і однієї видаленої (її не бачить ніхто). Стани завантаження, помилки й порожнього списку відтворено підміною відповіді сервера; довідник посад показано на підготовленому українському наборі посад (є посада з двома відкритими вакансіями, з довгою назвою, неактивні в обох вертикалях). Ранніші екрани — у <a href="../phase-1/index.html">галереї фази 1</a>.</p>
<nav aria-label="Розділи"><ul>
${tableOfContents(groups2)}
</ul></nav>`;
const sections = sectionsOf(groups);
const sections2 = sectionsOf(groups2);
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
const gallery = html('Hiring — фаза 1', [intro, ...sections].join('\n'));
const gallery2 = html('Hiring — фаза 2', [intro2, ...sections2].join('\n'));
writeFileSync('screenshots/phase-1/index.html', gallery);
mkdirSync('screenshots/phase-2', { recursive: true });
writeFileSync('screenshots/phase-2/index.html', gallery2);
writeFileSync('screenshots/latest/index.html', gallery2);

const notFound = groups[0].states.find((state) => state.dir === 'foundation');
writeFileSync(
  'screenshots/foundation/index.html',
  html(
    'Hiring — фундамент',
    `<p>Публічна сторінка 404 («Сторінку не знайдено»): світла й темна теми, компʼютер 1440×900 і телефон 390×844. Решта екранів — у <a href="../phase-1/index.html">галереї фази 1</a>.</p>
<section><h2>${notFound.heading}</h2><div class="grid">${figures(notFound, false).join('\n')}</div></section>`,
  ),
);
