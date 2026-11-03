import type { LoginHistory, SessionList } from '../../lib/schemas/auth';
import {
  CHROME_WINDOWS_UA,
  IRYNA_IP,
  IVAN_IP,
  OFFICE_IP,
  VASYL_IP,
} from './audit-shot-fixture';
import { SHOT_SIGN_INS } from './shot-timeline';

const CHROME_ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

type HistoryEntry = LoginHistory['items'][number];

const session = (
  id: string,
  startedAt: string,
  lastSeenAt: string,
  userAgent: string,
  current = false,
): SessionList['items'][number] => ({
  id,
  method: 'MAGIC_LINK',
  startedAt,
  lastSeenAt,
  userAgent,
  current,
});

const entry = (
  id: string,
  occurredAt: string,
  action: HistoryEntry['action'],
  ip: string,
  userAgent: string,
  method: string | null = 'MAGIC_LINK',
): HistoryEntry => {
  const denied = action === 'login_failed' || action === 'mfa_challenge_failed';
  return {
    id,
    occurredAt,
    action,
    result: denied ? 'DENIED' : 'SUCCESS',
    method: denied || action === 'logged_out' ? null : method,
    reason: denied ? 'CODE_INVALID' : null,
    ip,
    userAgent,
  };
};

/**
 * «Профіль» sessions and sign-in history per demo user: the newest sign-in is the user's SHOT_SIGN_INS
 * time, the first one follows the seeded invitation, and the IPs are the ones the audit shots use.
 */
export const PROFILE_SHOTS = {
  'admin@demo': {
    sessions: [
      session(
        '10cf3c5d-71e1-4246-9b15-c90647076e8a',
        SHOT_SIGN_INS['admin@demo']!,
        '2026-11-16T07:59:06.000Z',
        CHROME_WINDOWS_UA,
        true,
      ),
    ],
    history: [
      entry(
        '30871',
        SHOT_SIGN_INS['admin@demo']!,
        'login_succeeded',
        IVAN_IP,
        CHROME_WINDOWS_UA,
      ),
      entry(
        '30644',
        '2026-11-15T17:05:48.000Z',
        'logged_out',
        IVAN_IP,
        CHROME_WINDOWS_UA,
      ),
      entry(
        '30502',
        '2026-11-15T07:38:02.000Z',
        'login_succeeded',
        IVAN_IP,
        CHROME_WINDOWS_UA,
      ),
      entry(
        '30217',
        '2026-11-14T10:57:31.000Z',
        'login_succeeded',
        IVAN_IP,
        CHROME_WINDOWS_UA,
      ),
    ],
  },
  'vasyl.tl@demo': {
    sessions: [
      session(
        '83f07c48-15b7-45f9-af34-6ecae30bd29c',
        SHOT_SIGN_INS['vasyl.tl@demo']!,
        '2026-11-16T07:58:47.000Z',
        CHROME_WINDOWS_UA,
        true,
      ),
      session(
        '0dca92af-87f2-43e3-86cc-a6f028e45160',
        '2026-11-13T17:22:36.000Z',
        '2026-11-15T21:37:05.000Z',
        CHROME_ANDROID_UA,
      ),
    ],
    history: [
      entry(
        '30815',
        SHOT_SIGN_INS['vasyl.tl@demo']!,
        'login_succeeded',
        VASYL_IP,
        CHROME_WINDOWS_UA,
      ),
      entry(
        '30133',
        '2026-11-13T17:22:36.000Z',
        'login_succeeded',
        VASYL_IP,
        CHROME_ANDROID_UA,
      ),
      entry(
        '30109',
        '2026-11-13T15:48:10.000Z',
        'logged_out',
        OFFICE_IP,
        CHROME_WINDOWS_UA,
      ),
      entry(
        '29466',
        '2026-11-09T06:44:27.000Z',
        'login_succeeded',
        OFFICE_IP,
        CHROME_WINDOWS_UA,
      ),
      entry(
        '28390',
        '2026-11-02T09:27:44.000Z',
        'login_succeeded',
        OFFICE_IP,
        CHROME_WINDOWS_UA,
        'INVITE',
      ),
    ],
  },
  'head.hr@demo': {
    sessions: [
      session(
        'f9a0f24b-0763-48cd-8042-f6008ea1ec64',
        SHOT_SIGN_INS['head.hr@demo']!,
        '2026-11-16T07:57:41.000Z',
        CHROME_WINDOWS_UA,
        true,
      ),
    ],
    history: [
      entry(
        '30260',
        SHOT_SIGN_INS['head.hr@demo']!,
        'login_succeeded',
        OFFICE_IP,
        CHROME_WINDOWS_UA,
      ),
      entry(
        '30121',
        '2026-11-13T16:12:09.000Z',
        'logged_out',
        OFFICE_IP,
        CHROME_WINDOWS_UA,
      ),
      entry(
        '29618',
        '2026-11-10T07:55:20.000Z',
        'login_succeeded',
        OFFICE_IP,
        CHROME_WINDOWS_UA,
      ),
      entry(
        '28457',
        '2026-11-03T08:16:52.000Z',
        'login_succeeded',
        OFFICE_IP,
        CHROME_WINDOWS_UA,
        'INVITE',
      ),
    ],
  },
  'finance@demo': {
    sessions: [
      session(
        '5fea5626-afd9-4317-bf44-a8cd20ae210b',
        SHOT_SIGN_INS['finance@demo']!,
        '2026-11-16T07:58:22.000Z',
        CHROME_WINDOWS_UA,
        true,
      ),
    ],
    history: [
      entry(
        '30798',
        '2026-11-16T06:31:16.000Z',
        'mfa_challenge_failed',
        IRYNA_IP,
        CHROME_ANDROID_UA,
      ),
      entry(
        '30016',
        SHOT_SIGN_INS['finance@demo']!,
        'login_succeeded',
        IRYNA_IP,
        CHROME_WINDOWS_UA,
      ),
      entry(
        '29802',
        '2026-11-11T08:03:47.000Z',
        'login_succeeded',
        IRYNA_IP,
        CHROME_WINDOWS_UA,
        'INVITE',
      ),
    ],
  },
} satisfies Record<
  string,
  { sessions: SessionList['items']; history: HistoryEntry[] }
>;
export type ProfileShotUser = keyof typeof PROFILE_SHOTS;
