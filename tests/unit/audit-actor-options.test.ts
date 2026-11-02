import { describe, expect, it } from 'vitest';
import { auditActorOptions, moveActiveOption } from '@/lib/audit-actor-options';
import {
  auditActorQuerySchema,
  auditQuerySchema,
  type AuditActor,
} from '@/lib/schemas/audit';

const users: AuditActor[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    fullName: 'Анна Дорошенко',
    isActive: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    fullName: 'Ігор Литвин',
    isActive: false,
  },
];

describe('«Хто» picker options [STORY-AUD-2, wireframe settings-admin §3.1]', () => {
  it('leads with «Система» when there is no search, then users in server order', () => {
    expect(
      auditActorOptions(undefined, users, 'Система').map(
        (option) => option.value,
      ),
    ).toEqual(['system', users[0]!.id, users[1]!.id]);
    expect(auditActorOptions(undefined, [], 'Система')).toEqual([
      { value: 'system', actor: null },
    ]);
  });

  it('keeps «Система» only while its label matches the search, case-insensitively', () => {
    expect(auditActorOptions('СИСТ', [], 'Система')).toEqual([
      { value: 'system', actor: null },
    ]);
    expect(auditActorOptions('анна', [users[0]!], 'Система')).toEqual([
      { value: users[0]!.id, actor: users[0] },
    ]);
    expect(auditActorOptions('немає', [], 'Система')).toEqual([]);
  });

  it('moves the active option with arrow keys and clamps at both ends', () => {
    expect(moveActiveOption(0, 'ArrowDown', 3)).toBe(1);
    expect(moveActiveOption(2, 'ArrowDown', 3)).toBe(2);
    expect(moveActiveOption(0, 'ArrowUp', 3)).toBe(0);
    expect(moveActiveOption(-1, 'ArrowDown', 3)).toBe(0);
    expect(moveActiveOption(0, 'ArrowDown', 0)).toBe(-1);
  });
});

describe('Audit actor API contract [STORY-AUD-2, FND-4]', () => {
  it('accepts a user id or `system` as the journal actor filter', () => {
    expect(auditQuerySchema.parse({ actorId: 'system' }).actorId).toBe(
      'system',
    );
    expect(auditQuerySchema.parse({ actorId: users[0]!.id }).actorId).toBe(
      users[0]!.id,
    );
    expect(auditQuerySchema.safeParse({ actorId: 'admin' }).success).toBe(
      false,
    );
  });

  it('trims the lookup search, needs 2+ characters, defaults to 20 rows and rejects unknown params', () => {
    expect(auditActorQuerySchema.parse({ q: '  ан ' })).toEqual({
      q: 'ан',
      limit: 20,
    });
    expect(auditActorQuerySchema.safeParse({ q: ' а ' }).success).toBe(false);
    expect(auditActorQuerySchema.safeParse({ cursor: 'abc' }).success).toBe(
      false,
    );
    expect(auditActorQuerySchema.safeParse({ email: 'x' }).success).toBe(false);
  });
});
