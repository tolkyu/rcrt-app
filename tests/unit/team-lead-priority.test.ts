import { describe, expect, it } from 'vitest';
import { updateTeamLeadPrioritiesSchema } from '../../lib/schemas/team-lead-priority';
import {
  changedRows,
  moveBlocks,
  movePriority,
  parsePriorityDraft,
  sortByPriority,
  tiedUsers,
} from '../../lib/team-lead-priority-draft';

const userId = 'ab111111-1111-4111-8111-111111111111';
const change = (priority: unknown, version: unknown = null) => ({
  userId,
  priority,
  version,
});

const items = [
  { userId: 'a', fullName: 'Ярина', priority: 4, version: 1 },
  { userId: 'b', fullName: 'Андрій', priority: 4, version: 1 },
  { userId: 'c', fullName: 'Борис', priority: null, version: null },
  { userId: 'd', fullName: 'Аліна', priority: null, version: null },
];
const ids = (rows: readonly { userId: string }[]) =>
  rows.map((row) => row.userId);

describe('Priority drafts: parse, sort, ties, diff [D5, D47, STORY-ROLE-01-3]', () => {
  it.each([
    ['', null],
    ['  ', null],
    ['0', 0],
    ['99', 99],
    [' 4 ', 4],
    ['07', 7],
    ['-1', undefined],
    ['100', undefined],
    ['1.5', undefined],
    ['1e1', undefined],
    ['+1', undefined],
    ['п', undefined],
  ] as const)(
    'parses %j as %s without coercing invalid input',
    (text, result) => {
      expect(parsePriorityDraft(text)).toBe(result);
    },
  );

  it('sorts prioritised ascending with ties by Ukrainian name, then unprioritised alphabetically, without mutating', () => {
    expect(ids(sortByPriority(items, new Map()))).toEqual(['b', 'a', 'd', 'c']);
    expect(ids(items)).toEqual(['a', 'b', 'c', 'd']);
    expect(ids(sortByPriority(items, new Map([['a', 0]])))).toEqual([
      'a',
      'b',
      'd',
      'c',
    ]);
    expect(ids(sortByPriority(items, new Map([['b', null]])))).toEqual([
      'a',
      'd',
      'b',
      'c',
    ]);
  });

  it('marks only rows sharing a value as tied', () => {
    expect([...tiedUsers(items, new Map())].sort()).toEqual(['a', 'b']);
    expect(tiedUsers(items, new Map([['a', 0]])).size).toBe(0);
  });

  it('lists changed rows in display order, a cleared priority included', () => {
    expect(ids(changedRows(items, new Map([['a', 4]])))).toEqual([]);
    expect(
      ids(
        changedRows(
          items,
          new Map<string, number | null>([
            ['c', 0],
            ['a', null],
          ]),
        ),
      ),
    ).toEqual(['c', 'a']);
  });
});

describe('Priority arrows renumber the prioritised group [wireframe P1.1 #6]', () => {
  it('up swaps within the group and renumbers 0..n-1, breaking a typed tie', () => {
    const original = new Map<string, number | null>();
    const moved = movePriority(items, original, 'a', -1);
    expect([...moved]).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
    expect(original.size).toBe(0);
  });

  it('up on an unprioritised row appends it to the end of the group; down never clears', () => {
    expect([...movePriority(items, new Map(), 'c', -1)]).toEqual([
      ['b', 0],
      ['a', 1],
      ['c', 2],
    ]);
    expect([...movePriority(items, new Map(), 'c', 1)]).toEqual([]);
    expect([...movePriority(items, new Map(), 'a', 1)]).toEqual([]);
    expect([...movePriority(items, new Map(), 'b', -1)]).toEqual([]);
  });

  it('down swaps with the next prioritised row', () => {
    expect([...movePriority(items, new Map([['a', 0]]), 'a', 1)]).toEqual([
      ['a', 1],
      ['b', 0],
    ]);
  });

  it('explains disabled arrows: top, last prioritised, unprioritised', () => {
    expect(moveBlocks(items, new Map(), 'b')).toEqual({
      up: 'top',
      down: null,
    });
    expect(moveBlocks(items, new Map(), 'a')).toEqual({
      up: null,
      down: 'lastSet',
    });
    expect(moveBlocks(items, new Map(), 'c')).toEqual({
      up: null,
      down: 'notSetNoOrder',
    });
  });

  it('stops renumbering beyond 100 prioritised rows, the 0–99 range', () => {
    const many = Array.from({ length: 101 }, (_, index) => ({
      userId: `u${index}`,
      fullName: `Тімлід ${index}`,
      priority: index < 100 ? index % 100 : null,
    }));
    expect(moveBlocks(many, new Map(), 'u100')).toEqual({
      up: 'tooMany',
      down: 'tooMany',
    });
    expect(movePriority(many, new Map(), 'u100', -1).size).toBe(0);
    expect(moveBlocks(many, new Map(), 'u5').up).toBeNull();
  });
});

describe('Priority batch input [STORY-ROLE-01-3, D5, D47]', () => {
  it.each([0, 1, 99, null])('accepts %s as priority', (priority) => {
    expect(
      updateTeamLeadPrioritiesSchema.safeParse({ changes: [change(priority)] })
        .success,
    ).toBe(true);
  });
  it.each([-1, 100, 0.5, '2', '', undefined])(
    'rejects invalid priority %s',
    (priority) => {
      expect(
        updateTeamLeadPrioritiesSchema.safeParse({
          changes: [change(priority)],
        }).success,
      ).toBe(false);
    },
  );
  it.each([0, -1, 1.5, '1'])('rejects invalid version %s', (version) => {
    expect(
      updateTeamLeadPrioritiesSchema.safeParse({
        changes: [change(0, version)],
      }).success,
    ).toBe(false);
  });
  it('rejects duplicate user IDs including mixed UUID casing', () => {
    expect(
      updateTeamLeadPrioritiesSchema.safeParse({
        changes: [change(0), { ...change(1), userId: userId.toUpperCase() }],
      }).success,
    ).toBe(false);
  });
  it('rejects empty batches and extra client-controlled fields', () => {
    expect(
      updateTeamLeadPrioritiesSchema.safeParse({ changes: [] }).success,
    ).toBe(false);
    expect(
      updateTeamLeadPrioritiesSchema.safeParse({
        changes: [change(0)],
        actorId: userId,
      }).success,
    ).toBe(false);
    expect(
      updateTeamLeadPrioritiesSchema.safeParse({
        changes: [{ ...change(0), verticalId: userId }],
      }).success,
    ).toBe(false);
  });
});
