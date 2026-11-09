import { describe, expect, it } from 'vitest';
import {
  findNameConflict,
  groupPositions,
  mergePosition,
  parsePositionsSearch,
  positionsSearch,
  resolvePositionsVertical,
} from '@/lib/position-list';
import type { Position } from '@/lib/schemas/position';

const GAMBLING = '11111111-1111-4111-8111-111111111111';
const CRYPTO = '22222222-2222-4222-8222-222222222222';
const managed = [
  { id: GAMBLING, name: 'Гемблінг' },
  { id: CRYPTO, name: 'Крипто' },
];

let counter = 0;
const position = (overrides: Partial<Position> = {}): Position => {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    verticalId: GAMBLING,
    name: `Посада ${counter}`,
    isActive: true,
    version: 1,
    createdAt: '2026-10-15T09:00:00.000Z',
    openVacanciesCount: 0,
    ...overrides,
  };
};

describe('positions URL state [VAC-01, D83]', () => {
  it('reads vertical and inactive, ignoring anything else', () => {
    expect(
      parsePositionsSearch(
        new URLSearchParams(`vertical=${CRYPTO}&inactive=1`),
      ),
    ).toEqual({ vertical: CRYPTO, inactive: true });
    expect(
      parsePositionsSearch(new URLSearchParams('vertical=all&inactive=0')),
    ).toEqual({ vertical: 'all', inactive: false });
    expect(
      parsePositionsSearch(
        new URLSearchParams('vertical=<script>&inactive=yes'),
      ),
    ).toEqual({ vertical: undefined, inactive: false });
  });

  it('writes only what differs from the defaults', () => {
    expect(positionsSearch({ vertical: undefined, inactive: false })).toBe('');
    expect(positionsSearch({ vertical: 'all', inactive: true })).toBe(
      'vertical=all&inactive=1',
    );
  });

  it('prefers the URL, then the header value, each only if managed, else every vertical', () => {
    expect(resolvePositionsVertical(CRYPTO, GAMBLING, managed)).toBe(CRYPTO);
    expect(resolvePositionsVertical('all', GAMBLING, managed)).toBe('all');
    expect(resolvePositionsVertical(undefined, GAMBLING, managed)).toBe(
      GAMBLING,
    );
    expect(resolvePositionsVertical(undefined, 'all', managed)).toBe('all');
    expect(resolvePositionsVertical(undefined, CRYPTO, [managed[0]!])).toBe(
      GAMBLING,
    );
    const foreign = '33333333-3333-4333-8333-333333333333';
    expect(resolvePositionsVertical(foreign, GAMBLING, managed)).toBe('all');
    expect(resolvePositionsVertical(undefined, foreign, managed)).toBe('all');
  });

  it('pins a user who manages one vertical to it', () => {
    expect(resolvePositionsVertical('all', 'all', [managed[0]!])).toBe(
      GAMBLING,
    );
  });
});

describe('cached list updates keep the open-vacancy count [ADR-013 addendum]', () => {
  it('keeps the cached count when a write response carries null', () => {
    const cached = position({ name: 'Медіабаєр', openVacanciesCount: 2 });
    const merged = mergePosition([cached], {
      ...cached,
      isActive: false,
      version: 2,
      openVacanciesCount: null,
    });
    expect(merged).toEqual([
      { ...cached, isActive: false, version: 2, openVacanciesCount: 2 },
    ]);
  });

  it('starts a created position at zero and sorts by Ukrainian collation', () => {
    const first = position({ name: 'Ґрунтознавець' });
    const second = position({ name: 'Фахівець' });
    const created = position({ name: 'Гравець', openVacanciesCount: null });
    expect(
      mergePosition([second, first], created).map((item) => [
        item.name,
        item.openVacanciesCount,
      ]),
    ).toEqual([
      ['Гравець', 0],
      ['Ґрунтознавець', 0],
      ['Фахівець', 0],
    ]);
  });
});

describe('name conflicts use the server key [SEC-POS-01]', () => {
  const stored = position({ name: 'Афілейт Лід', isActive: false });

  it('matches case, spacing and apostrophe variants in the same vertical', () => {
    expect(findNameConflict([stored], GAMBLING, ' АФІЛЕЙТ   лід ')).toBe(
      stored,
    );
  });

  it('ignores another vertical and the row being renamed', () => {
    expect(findNameConflict([stored], CRYPTO, 'Афілейт Лід')).toBeUndefined();
    expect(
      findNameConflict([stored], GAMBLING, 'АФІЛЕЙТ ЛІД', stored.id),
    ).toBeUndefined();
  });
});

describe('grouping [wireframe §1.1]', () => {
  const active = position({ name: 'Б активна' });
  const inactive = position({ name: 'А неактивна', isActive: false });
  const cryptoOnlyInactive = position({
    verticalId: CRYPTO,
    name: 'Трейдер',
    isActive: false,
  });
  const items = [active, inactive, cryptoOnlyInactive];

  it('lists every managed vertical, hides inactive rows by default, sorted by name', () => {
    const groups = groupPositions(items, managed, 'all', false);
    expect(groups.map((group) => group.vertical.name)).toEqual([
      'Гемблінг',
      'Крипто',
    ]);
    expect(groups[0]!.items).toEqual([active]);
    expect(groups[0]!.total).toBe(2);
    expect(groups[1]!.items).toEqual([]);
    expect(groups[1]!.total).toBe(1);
    expect(
      groups.map((group) => [group.activeCount, group.inactiveCount]),
    ).toEqual([
      [1, 1],
      [0, 1],
    ]);
    expect(
      groupPositions(items, managed, 'all', true).map((group) => [
        group.activeCount,
        group.inactiveCount,
      ]),
    ).toEqual([
      [1, 1],
      [0, 1],
    ]);
    expect(groupPositions(items, managed, 'all', true)[0]!.items).toEqual([
      inactive,
      active,
    ]);
  });

  it('narrows to one vertical and keeps an empty vertical visible', () => {
    expect(groupPositions(items, managed, CRYPTO, true)).toHaveLength(1);
    const empty = groupPositions([], managed, 'all', true);
    expect(empty.map((group) => group.total)).toEqual([0, 0]);
  });
});
