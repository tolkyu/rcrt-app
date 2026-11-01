import { describe, expect, it } from 'vitest';
import {
  ALL_VERTICALS,
  resolveVerticalFilter,
  type VerticalOption,
} from '@/lib/vertical-filter';

const verticals: readonly VerticalOption[] = [
  { id: '7d1f0c8e-1111-4c4c-8c8c-000000000001', name: 'Гемблінг' },
  { id: '7d1f0c8e-2222-4c4c-8c8c-000000000002', name: 'Крипто' },
];

describe('resolveVerticalFilter: header vertical filter from the cookie (screens.md §1)', () => {
  it.each<
    [string, string | null | undefined, readonly VerticalOption[], string]
  >([
    [
      'a stored id of one of my verticals',
      verticals[1]!.id,
      verticals,
      verticals[1]!.id,
    ],
    ['no cookie', undefined, verticals, ALL_VERTICALS],
    ['an empty cookie', '', verticals, ALL_VERTICALS],
    ['null', null, verticals, ALL_VERTICALS],
    ['the explicit «all» value', ALL_VERTICALS, verticals, ALL_VERTICALS],
    [
      'a vertical I no longer belong to',
      '7d1f0c8e-3333-4c4c-8c8c-000000000003',
      verticals,
      ALL_VERTICALS,
    ],
    [
      'an id with different case',
      verticals[0]!.id.toUpperCase(),
      verticals,
      ALL_VERTICALS,
    ],
    ['a user without verticals (Finance)', verticals[0]!.id, [], ALL_VERTICALS],
  ])('%s', (_case, stored, options, expected) => {
    expect(resolveVerticalFilter(stored, options)).toBe(expected);
  });
});
