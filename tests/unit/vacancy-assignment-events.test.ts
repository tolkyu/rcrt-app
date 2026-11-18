import { describe, expect, it } from 'vitest';
import { EVENT_PAYLOADS } from '@/server/events';

const id = '5b8f0d6e-3c1a-4d57-9a2e-7f1c2b3d4e5f';
const other = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

describe('V3 vacancy event payloads [D130]', () => {
  const assigned = EVENT_PAYLOADS['vacancy.recruiter_assigned'];

  it.each([
    ['the creation payload and old rows', { userId: id }],
    ['a self claim', { userId: id, by: id, method: 'SELF' }],
    ['a manager assignment', { userId: id, by: other, method: 'MANAGER' }],
  ])('recruiter_assigned accepts %s', (_name, payload) => {
    expect(assigned.safeParse(payload).success).toBe(true);
  });

  it.each([
    ['an unknown method', { userId: id, by: id, method: 'AUTO' }],
    ['an unknown key', { userId: id, name: 'Імʼя' }],
    ['no user', { by: id }],
  ])('recruiter_assigned rejects %s', (_name, payload) => {
    expect(assigned.safeParse(payload).success).toBe(false);
  });

  it('recruiter_unassigned needs user and actor, nothing else', () => {
    const schema = EVENT_PAYLOADS['vacancy.recruiter_unassigned'];
    expect(schema.safeParse({ userId: id, by: other }).success).toBe(true);
    expect(schema.safeParse({ userId: id }).success).toBe(false);
    expect(schema.safeParse({ userId: id, by: other, x: 1 }).success).toBe(
      false,
    );
  });

  it('team_lead_assigned needs lead and actor, nothing else', () => {
    const schema = EVENT_PAYLOADS['vacancy.team_lead_assigned'];
    expect(schema.safeParse({ teamLeadId: id, by: other }).success).toBe(true);
    expect(schema.safeParse({ teamLeadId: id }).success).toBe(false);
    expect(schema.safeParse({ teamLeadId: id, by: other, x: 1 }).success).toBe(
      false,
    );
  });
});
