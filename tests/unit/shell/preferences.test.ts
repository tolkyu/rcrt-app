import { describe, expect, it } from 'vitest';
import { preferenceCookie, PREFERENCE_COOKIES } from '@/lib/preference-cookie';
import {
  FULL_NAME_MAX,
  fullNameIssue,
  normalizeFullName,
} from '@/lib/profile-name';
import { updateMeSchema } from '@/lib/schemas/profile';
import { parseTheme, themeClassName, THEMES } from '@/lib/theme';

describe('Theme preference: cookie value → <html> class without a flash [UI-02, A-34]', () => {
  it.each<[string | null | undefined, (typeof THEMES)[number]]>([
    ['light', 'light'],
    ['dark', 'dark'],
    ['system', 'system'],
    [undefined, 'system'],
    [null, 'system'],
    ['', 'system'],
    ['DARK', 'system'],
    ['dark; Path=/', 'system'],
  ])('parseTheme(%s) → %s', (value, theme) => {
    expect(parseTheme(value)).toBe(theme);
  });

  it('system leaves the class empty so the OS colour scheme applies', () => {
    expect(THEMES.map(themeClassName)).toEqual(['light', 'dark', undefined]);
  });

  it('writes a one-year, Lax, root-path cookie; Secure only over https', () => {
    expect(preferenceCookie(PREFERENCE_COOKIES.theme, 'dark', false)).toBe(
      'theme=dark; Path=/; Max-Age=31536000; SameSite=Lax',
    );
    expect(preferenceCookie(PREFERENCE_COOKIES.vertical, 'a b;c', true)).toBe(
      'vertical=a%20b%3Bc; Path=/; Max-Age=31536000; SameSite=Lax; Secure',
    );
  });
});

describe('Display name rules shared by the form and PATCH /me [ROLE-05-6]', () => {
  it.each([
    ['  Марія   Шевченко  ', 'Марія Шевченко'],
    ['Марія\tШевченко\n', 'Марія Шевченко'],
    ['   ', ''],
  ])('normalizes %j → %j', (input, output) => {
    expect(normalizeFullName(input)).toBe(output);
  });

  it.each<[string, 'too_small' | 'too_big' | null]>([
    ['', 'too_small'],
    ['М', null],
    ['я'.repeat(FULL_NAME_MAX), null],
    ['я'.repeat(FULL_NAME_MAX + 1), 'too_big'],
  ])('fullNameIssue(%j) → %s', (value, issue) => {
    expect(fullNameIssue(value)).toBe(issue);
  });

  it('the API schema normalizes, enforces 1..120 after collapsing and rejects unknown keys', () => {
    expect(
      updateMeSchema.parse({
        fullName: `  ${'я'.repeat(60)}   ${'я'.repeat(59)} `,
      }),
    ).toEqual({ fullName: `${'я'.repeat(60)} ${'я'.repeat(59)}` });
    const issues = (input: unknown) =>
      updateMeSchema.safeParse(input).error?.issues.map((issue) => issue.code);
    expect(issues({ fullName: ' \t ' })).toEqual(['too_small']);
    expect(issues({ fullName: 'я'.repeat(121) })).toEqual(['too_big']);
    expect(issues({ fullName: 'Марія', email: 'x@demo' })).toEqual([
      'unrecognized_keys',
    ]);
    expect(issues({})).toEqual(['invalid_type']);
  });
});
