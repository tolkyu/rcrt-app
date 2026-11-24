import { describe, expect, it } from 'vitest';
import { positionNameProblem } from '@/lib/position-name';
import { hasOnlyReasonChars } from '@/lib/reason-text';
import { positionNameSchema } from '@/lib/schemas/position';
import { cancelVacancySchema } from '@/lib/schemas/vacancy-cancel';
import { hasOnlyVisibleChars, hasVisibleChar } from '@/lib/visible-text';

const FILLERS = [0x2800, 0x115f, 0x1160, 0x3164, 0xffa0];
const BLANK_ALONE = [
  0x034f, 0x17b4, 0x17b5, 0x180b, 0x180c, 0x180d, 0x180f, 0xfe00, 0xfe0e,
  0xfe0f, 0xfffc,
];
const ch = (code: number) => String.fromCodePoint(code);
const hex = (code: number) => `U+${code.toString(16).toUpperCase()}`;

describe('hasVisibleChar: something renders [SEC-L1]', () => {
  it.each([
    ['a letter', 'а', true],
    ['an emoji', ch(0x1f680), true],
    ['an emoji with a variation selector', `❤${ch(0xfe0f)}`, true],
    ['spaces, zero-width and a filler', ` ${ch(0x200b)}${ch(0x2800)} `, false],
    ['empty', '', false],
  ])('%s', (_name, value, expected) => {
    expect(hasVisibleChar(value)).toBe(expected);
  });

  it.each([...FILLERS, ...BLANK_ALONE])('%s alone is not visible', (code) => {
    expect(hasVisibleChar(ch(code)), hex(code)).toBe(false);
  });
});

describe('hasOnlyVisibleChars: fillers never, blank-alone marks only when nothing else shows [SEC-L1]', () => {
  it.each(FILLERS)('refuses the filler %s even inside text', (code) => {
    expect(hasOnlyVisibleChars(`Лід${ch(code)}`), hex(code)).toBe(false);
  });

  it.each(BLANK_ALONE)('refuses %s when it is all there is', (code) => {
    expect(hasOnlyVisibleChars(ch(code)), hex(code)).toBe(false);
    expect(hasOnlyVisibleChars(`${ch(code)}${ch(code)} `), hex(code)).toBe(
      false,
    );
  });

  it.each(BLANK_ALONE)('keeps %s inside visible text', (code) => {
    expect(hasOnlyVisibleChars(`Лід${ch(code)}`), hex(code)).toBe(true);
  });

  it('keeps emoji with a variation selector valid', () => {
    expect(hasOnlyVisibleChars(`❤${ch(0xfe0f)} ✔${ch(0xfe0f)}`)).toBe(true);
    expect(hasOnlyVisibleChars(`👍${ch(0xfe0f)}`)).toBe(true);
  });

  it('leaves whitespace-only and empty values to the length rules', () => {
    expect(hasOnlyVisibleChars('')).toBe(true);
    expect(hasOnlyVisibleChars('   ')).toBe(true);
  });
});

describe('every field that shares the rule refuses a value of blank marks only [SEC-L1]', () => {
  it.each(BLANK_ALONE)('%s', (code) => {
    const blank = `${ch(code)}${ch(code)}${ch(code)}`;
    expect(positionNameProblem(blank), hex(code)).toBe('invalid');
    expect(positionNameSchema.safeParse(blank).success, hex(code)).toBe(false);
    expect(hasOnlyReasonChars(blank), hex(code)).toBe(false);
    expect(
      cancelVacancySchema.safeParse({ reason: blank }).success,
      hex(code),
    ).toBe(false);
  });

  it('and still accepts emoji with a variation selector', () => {
    const name = `Менеджер ❤${ch(0xfe0f)}`;
    expect(positionNameProblem(name)).toBeNull();
    expect(positionNameSchema.safeParse(name).success).toBe(true);
    expect(
      cancelVacancySchema.safeParse({
        reason: `Дякую ${ch(0x1f44d)}${ch(0xfe0f)}`,
      }).success,
    ).toBe(true);
  });
});
