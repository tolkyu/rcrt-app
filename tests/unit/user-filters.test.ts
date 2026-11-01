import { describe, expect, it } from 'vitest';
import {
  parseDrawerUser,
  parseUserSearch,
  userSearchParams,
} from '@/lib/user-filters';

const ID = '37211bf7-c7ef-4099-aa9d-d4fd3da8eb9d';
const VERTICAL = '11111111-1111-4111-8111-111111111111';

describe('User drawer URL state [STORY-ROLE-05-4, wireframe settings-admin §0]', () => {
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
