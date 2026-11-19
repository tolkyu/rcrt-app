import { AUDIT_SECURITY_PREFIXES } from '../../lib/audit-constants';
import type { AuditPage, AuditRecord } from '../../lib/schemas/audit';

type AuditRow = AuditPage['items'][number];

/** Seeded names (CLAUDE.md §8) with mock ids for the audit screenshots; Kyiv is UTC+2 in November (UX-G-10). */
export const SHOT_PEOPLE = {
  ivan: {
    id: 'c8468dbd-f881-4223-a351-e78dcb6729b8',
    fullName: 'Іван Коваленко',
    isActive: true,
  },
  olena: {
    id: '9cb44db5-f8a0-4429-af66-f518146fe302',
    fullName: 'Олена Мельник',
    isActive: true,
  },
  sofiia: {
    id: 'dccd9b35-ce34-4076-af6d-8f7a28859960',
    fullName: 'Софія Ткаченко',
    isActive: true,
  },
  andrii: {
    id: '24f488ae-66e7-4a03-8498-82cab1a6743e',
    fullName: 'Андрій Бондар',
    isActive: true,
  },
  vasyl: {
    id: '38e9235f-95c2-47ee-a347-1b2198fb45fd',
    fullName: 'Василь Мороз',
    isActive: true,
  },
  iryna: {
    id: 'f50180d5-e585-4f6f-b4c9-7a92e7ca893c',
    fullName: 'Ірина Романенко',
    isActive: true,
  },
  nataliia: {
    id: 'ff8fa649-87d5-4eb0-bd47-bb91b1c577fa',
    fullName: 'Наталія Кравченко',
    isActive: true,
  },
  yuliia: {
    id: '4c2b75b2-41ab-495e-824e-3119ec0e2927',
    fullName: 'Юлія Петренко',
    isActive: false,
  },
};
type ShotPerson = (typeof SHOT_PEOPLE)[keyof typeof SHOT_PEOPLE];
const { ivan, olena, sofiia, andrii, vasyl, iryna, nataliia, yuliia } =
  SHOT_PEOPLE;

const user = ({ id, fullName }: ShotPerson) => ({
  type: 'user',
  id,
  label: fullName,
});
const GAMBLING = {
  type: 'vertical',
  id: '7561accd-18af-4440-beb4-3dcac1168be7',
  label: 'Гемблінг',
};
const CRYPTO = {
  type: 'vertical',
  id: '4bb6cdac-f89d-46ea-9a6b-e6019637cc9e',
  label: 'Крипто',
};
export const IVAN_IP = '91.203.4.17';
export const OFFICE_IP = '185.12.40.3';
export const IRYNA_IP = '176.36.221.9';
export const VASYL_IP = '46.211.88.102';

type ShotEvent = Omit<AuditRow, 'id' | 'actorKind'>;
const event = (
  at: string,
  actor: ShotPerson | null,
  action: string,
  entity: AuditRow['entity'],
  ip: string | null,
  result: AuditRow['result'] = 'SUCCESS',
): ShotEvent => ({
  occurredAt: new Date(at).toISOString(),
  actor,
  action,
  entity,
  ip,
  result,
});

/** Newest first, as `/audit` answers; ids descend with time. */
export const SHOT_ROWS: AuditRow[] = [
  event(
    '2026-11-16T07:58:15Z',
    null,
    'auth.session_revoked',
    user(yuliia),
    null,
  ),
  event(
    '2026-11-16T07:58:14Z',
    ivan,
    'user.deactivated',
    user(yuliia),
    IVAN_IP,
  ),
  event(
    '2026-11-16T07:49:02Z',
    ivan,
    'user.roles_changed',
    user(nataliia),
    IVAN_IP,
  ),
  event(
    '2026-11-16T07:44:31Z',
    ivan,
    'vertical.tl_priority_changed',
    GAMBLING,
    IVAN_IP,
  ),
  event(
    '2026-11-16T07:41:23Z',
    ivan,
    'auth.login_succeeded',
    user(ivan),
    IVAN_IP,
  ),
  event(
    '2026-11-16T07:26:39Z',
    sofiia,
    'auth.login_succeeded',
    user(sofiia),
    OFFICE_IP,
  ),
  event(
    '2026-11-16T07:17:52Z',
    null,
    'auth.login_failed',
    null,
    '194.44.115.20',
    'DENIED',
  ),
  event(
    '2026-11-16T07:12:57Z',
    olena,
    'auth.login_succeeded',
    user(olena),
    OFFICE_IP,
  ),
  event(
    '2026-11-16T06:52:08Z',
    vasyl,
    'auth.login_succeeded',
    user(vasyl),
    VASYL_IP,
  ),
  event(
    '2026-11-16T06:31:16Z',
    iryna,
    'auth.mfa_challenge_failed',
    user(iryna),
    IRYNA_IP,
    'DENIED',
  ),
  event(
    '2026-11-15T19:12:40Z',
    andrii,
    'auth.logged_out',
    user(andrii),
    OFFICE_IP,
  ),
  event('2026-11-14T11:03:26Z', ivan, 'vertical.renamed', CRYPTO, IVAN_IP),
  event(
    '2026-11-13T09:20:09Z',
    olena,
    'user.profile_updated',
    user(olena),
    OFFICE_IP,
  ),
  event(
    '2026-11-12T12:20:05Z',
    iryna,
    'auth.login_succeeded',
    user(iryna),
    IRYNA_IP,
  ),
  event(
    '2026-11-11T08:05:33Z',
    iryna,
    'user.mfa_enrolled',
    user(iryna),
    IRYNA_IP,
  ),
].map((row, index) => ({
  ...row,
  id: String(31_015 - index),
  actorKind: row.actor ? 'USER' : 'SYSTEM',
}));

export const CHROME_WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const record = (action: string, requestId: string): AuditRecord => {
  const row = SHOT_ROWS.find((item) => item.action === action)!;
  const renamed = action === 'vertical.renamed';
  return {
    ...row,
    before: renamed ? { name: 'Криптовалюти' } : null,
    after: renamed ? { name: 'Крипто' } : null,
    details: row.result === 'DENIED' ? { reason: 'CODE_INVALID' } : null,
    userAgent: CHROME_WINDOWS_UA,
    requestId,
    detailLabels: {},
  };
};
export const SHOT_RENAME = record(
  'vertical.renamed',
  '37c19ec0-188c-42a2-9679-f5ef382b9b28',
);
export const SHOT_DENIED = record(
  'auth.mfa_challenge_failed',
  '800a2f06-9624-4b78-88b2-76c2a52cb1d6',
);
export const isSecurityAction = (action: string) =>
  AUDIT_SECURITY_PREFIXES.some((prefix) => action.startsWith(prefix));
