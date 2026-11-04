import { describe, expect, it } from 'vitest';
import {
  parseDrawerUser,
  parseUserSearch,
  userSearchParams,
  userSearchSource,
  userFilterValues,
} from '@/lib/user-filters';

const ID = '37211bf7-c7ef-4099-aa9d-d4fd3da8eb9d';
const VERTICAL = '11111111-1111-4111-8111-111111111111';

describe('User drawer URL state [STORY-ROLE-05-4, wireframe settings-admin §0]', () => {
  it('canonicalizes repeated filters without losing values or accepting unknown choices', () => {
    const source = userSearchSource(
      new URLSearchParams(
        `q=Мороз&status=DEACTIVATED&status=ACTIVE&status=ACTIVE&status=bogus&role=TEAM_LEAD&role=RECRUITER&vertical=${VERTICAL.toUpperCase()}&vertical=GLOBAL&user=${ID}`,
      ),
    );
    const search = parseUserSearch(source);
    expect(search).toEqual({
      q: 'Мороз',
      status: ['ACTIVE', 'DEACTIVATED'],
      role: ['RECRUITER', 'TEAM_LEAD'],
      vertical: [VERTICAL, 'GLOBAL'],
    });
    expect(userFilterValues(search)).toEqual(search);
    const params = userSearchParams(search, ID);
    expect(params.getAll('status')).toEqual(['ACTIVE', 'DEACTIVATED']);
    expect(parseUserSearch(userSearchSource(params))).toEqual(search);
    expect(parseDrawerUser(userSearchSource(params))).toBe(ID);
  });

  it('bounds malformed and overlong groups to the existing API contract', () => {
    const vertical = Array.from(
      { length: 12 },
      (_, index) =>
        `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
    );
    expect(parseUserSearch({ vertical }).vertical).toHaveLength(10);
    expect(
      parseUserSearch({
        status: ['unknown'],
        role: [],
        vertical: ['not-a-uuid'],
      }),
    ).toEqual({
      q: undefined,
      status: undefined,
      role: undefined,
      vertical: undefined,
    });
  });
  it('reads a valid user id and lower-cases an upper-case one', () => {
    expect(parseDrawerUser({ user: ID })).toBe(ID);
    expect(parseDrawerUser({ user: ID.toUpperCase() })).toBe(ID);
  });

  it.each([
    ['missing', {}],
    ['empty', { user: '' }],
    ['malformed', { user: 'not-a-uuid' }],
    ['repeated', { user: [ID, ID] }],
    ['with trailing text', { user: `${ID}x` }],
  ])('ignores a %s user parameter', (_name, source) => {
    expect(parseDrawerUser(source)).toBeUndefined();
  });

  it('keeps the drawer out of the list filters that feed the API', () => {
    expect(parseUserSearch({ user: ID, status: 'ACTIVE' })).toEqual({
      q: undefined,
      status: 'ACTIVE',
      role: undefined,
      vertical: undefined,
    });
  });

  it('writes the user after the filters and omits it when absent', () => {
    const search = {
      q: 'Мороз',
      status: 'ACTIVE',
      vertical: VERTICAL,
    } as const;
    expect(userSearchParams(search, ID).toString()).toBe(
      new URLSearchParams({ ...search, user: ID }).toString(),
    );
    expect(userSearchParams(search).has('user')).toBe(false);
    expect(userSearchParams({}, ID).toString()).toBe(`user=${ID}`);
  });

  it('round-trips filters and the open user through the URL', () => {
    const search = {
      q: 'Мороз',
      status: 'INVITED',
      role: 'TEAM_LEAD',
      vertical: 'GLOBAL',
    } as const;
    const source = Object.fromEntries(userSearchParams(search, ID));
    expect(parseUserSearch(source)).toEqual(search);
    expect(parseDrawerUser(source)).toBe(ID);
  });
});
