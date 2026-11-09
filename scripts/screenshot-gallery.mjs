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
/** Phase-2 «Вакансії» (V1): the shots are taken by tests/e2e/vacancies-screens.spec.ts. */
const groups2 = [
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
        heading: 'Вакансії — вакансій поки немає (без кнопки створення)',
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
<p>Це перший етап фази 2: перегляд вакансій — список, пошук за назвою чи номером (V-0001), фільтри за вертикаллю й статусом, огляд і картка — та «Довідник посад» для Адміністратора і Керівника рекрутингу (додати, перейменувати, деактивувати й повернути посаду). Створення вакансій, кандидати й бонуси з’являться разом із реальними діями. Ролі з однаковим виглядом показано одним знімком.</p>
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
