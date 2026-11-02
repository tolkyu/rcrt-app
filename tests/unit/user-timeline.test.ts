import { describe, expect, it } from 'vitest';
import type { UserEventRow } from '@/server/repositories/user';
import { userEventView } from '@/server/services/user-timeline';

const VERTICAL = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';

const row = (overrides: Partial<UserEventRow>): UserEventRow => ({
  id: 7n,
  occurredAt: new Date('2026-11-16T08:00:00.000Z'),
  type: 'user.activated',
  actorKind: 'SYSTEM',
  actorId: null,
  actorName: null,
  actorActive: null,
  payload: { v: 1 },
  verticalNames: {},
  ...overrides,
});

describe('User timeline view [HIST-03, STORY-ROLE-05-4 AC2]', () => {
  it('maps the envelope and leaves summaries empty for events without roles or fields', () => {
    expect(userEventView(row({}))).toEqual({
      id: '7',
      type: 'user.activated',
      occurredAt: '2026-11-16T08:00:00.000Z',
      actorKind: 'SYSTEM',
      actor: null,
      roles: null,
      fields: null,
    });
  });

  it('names the actor when one exists', () => {
    expect(
      userEventView(
        row({
          actorKind: 'USER',
          actorId: ACTOR,
          actorName: 'Анна Дорошенко',
          actorActive: false,
        }),
      ).actor,
    ).toEqual({ id: ACTOR, fullName: 'Анна Дорошенко', isActive: false });
  });

  it.each([
    [
      'user.invited',
      {
        inviteId: ACTOR,
        roles: [
          { role: 'RECRUITER', verticalId: VERTICAL },
          { role: 'ADMIN', verticalId: null },
        ],
      },
    ],
    [
      'user.reinvited',
      {
        inviteId: ACTOR,
        roles: [
          { role: 'RECRUITER', verticalId: VERTICAL },
          { role: 'ADMIN', verticalId: null },
        ],
      },
    ],
    [
      'user.reactivated',
      {
        restoredRoles: [
          { role: 'RECRUITER', verticalId: VERTICAL },
          { role: 'ADMIN', verticalId: null },
        ],
      },
    ],
  ])('lists the roles of %s with vertical names', (type, payload) => {
    expect(
      userEventView(
        row({
          type,
          payload: { v: 1, ...payload },
          verticalNames: { [VERTICAL]: 'Гемблінг' },
        }),
      ).roles,
    ).toEqual([
      { role: 'RECRUITER', vertical: { id: VERTICAL, name: 'Гемблінг' } },
      { role: 'ADMIN', vertical: null },
    ]);
  });

  it.each(['user.role_assigned', 'user.role_removed'])(
    'shows the single role of %s; an unresolved vertical keeps its id',
    (type) => {
      expect(
        userEventView(
          row({
            type,
            payload: { v: 1, role: 'TEAM_LEAD', verticalId: VERTICAL },
          }),
        ).roles,
      ).toEqual([
        { role: 'TEAM_LEAD', vertical: { id: VERTICAL, name: null } },
      ]);
    },
  );

  it('names changed profile fields but never their values', () => {
    const view = userEventView(
      row({
        type: 'user.profile_updated',
        payload: { v: 1, fields: ['fullName'] },
      }),
    );
    expect(view.fields).toEqual(['fullName']);
    expect(view.roles).toBeNull();
  });

  it.each([
    ['user.role_assigned', { role: 'ADMIN', verticalId: null, note: 'текст' }],
    ['user.invited', { roles: [{ role: 'ADMIN', verticalId: null }] }],
    ['user.reinvited', { inviteId: ACTOR, roles: [] }],
    ['user.profile_updated', { fields: ['phone'] }],
    ['user.reactivated', { restoredRoles: 'ADMIN' }],
  ])('drops a %s payload that fails the write allowlist', (type, payload) => {
    const view = userEventView(row({ type, payload: { v: 1, ...payload } }));
    expect(view.roles).toBeNull();
    expect(view.fields).toBeNull();
  });
});
