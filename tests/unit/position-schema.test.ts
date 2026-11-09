import { describe, expect, it } from 'vitest';
import {
  createPositionSchema,
  patchPositionSchema,
  positionIdParamsSchema,
  positionListQuerySchema,
  positionNameSchema,
} from '@/lib/schemas/position';

/** Code points are spelled as numbers so no tool can turn invisible characters into literals. */
const char = (...codes: number[]) => String.fromCharCode(...codes);
const verticalId = '0b8f1d2e-7c43-4a5b-9d10-5f6a7b8c9d0e';

describe('position schemas [ADR-013, D76]', () => {
  it('trims the name and enforces 2..80 characters', () => {
    expect(positionNameSchema.parse('  Медіабаєр — Facebook  ')).toBe(
      'Медіабаєр — Facebook',
    );
    expect(positionNameSchema.safeParse('').success).toBe(false);
    expect(positionNameSchema.safeParse('   ').success).toBe(false);
    expect(positionNameSchema.safeParse('Т').success).toBe(false);
    expect(positionNameSchema.safeParse(' Т ').success).toBe(false);
    expect(positionNameSchema.safeParse('Тр').success).toBe(true);
    expect(positionNameSchema.safeParse('Т'.repeat(80)).success).toBe(true);
    expect(positionNameSchema.safeParse('Т'.repeat(81)).success).toBe(false);
  });

  it.each([
    ['NUL', 0x0000],
    ['tab', 0x0009],
    ['line feed', 0x000a],
    ['escape', 0x001b],
    ['DEL', 0x007f],
    ['zero-width space', 0x200b],
    ['zero-width joiner', 0x200d],
    ['byte order mark', 0xfeff],
    ['bidi override', 0x202e],
    ['bidi isolate', 0x2066],
    ['line separator', 0x2028],
    ['paragraph separator', 0x2029],
    ['private-use code point', 0xe000],
    ['lone high surrogate', 0xd800],
    ['lone low surrogate', 0xdc00],
  ])('rejects a %s inside the name', (_label, code) => {
    const result = positionNameSchema.safeParse(`Назва${char(code)}інша`);
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.message).toBe(
      'invalid_chars',
    );
  });

  it('keeps the Ukrainian apostrophe and paired surrogates valid', () => {
    const apostrophe = `П${char(0x02bc)}ятниця`;
    const rocket = `Менеджер ${String.fromCodePoint(0x1f680)}`;
    expect(positionNameSchema.parse(apostrophe)).toBe(apostrophe);
    expect(positionNameSchema.parse(rocket)).toBe(rocket);
  });

  it('stores NFC: a decomposed «й» and «ї» equal the composed forms', () => {
    const decomposed = `Рекрутери: ${char(0x0438, 0x0306)} ${char(0x0456, 0x0308)}`;
    const parsed = positionNameSchema.parse(decomposed);
    expect(parsed).toBe(`Рекрутери: ${char(0x0439)} ${char(0x0457)}`);
    expect(parsed).toBe(parsed.normalize('NFC'));
  });

  it('collapses runs of spaces, no-break and ideographic spaces to one space and measures length afterwards', () => {
    const noBreak = char(0x00a0);
    expect(
      positionNameSchema.parse(`Медіа  ${noBreak} баєр${char(0x3000)}Facebook`),
    ).toBe('Медіа баєр Facebook');
    expect(positionNameSchema.safeParse(noBreak.repeat(2)).success).toBe(false);
    expect(positionNameSchema.safeParse(`Т${' '.repeat(30)}`).success).toBe(
      false,
    );
    const spaced = (left: number) =>
      `${'Т'.repeat(left)}${' '.repeat(30)}${'Т'.repeat(40)}`;
    expect(positionNameSchema.safeParse(spaced(40)).success).toBe(false);
    expect(positionNameSchema.safeParse(spaced(39)).success).toBe(true);
  });

  it('creates with a strict {verticalId, name} body and lower-cases the vertical', () => {
    expect(
      createPositionSchema.parse({
        verticalId: verticalId.toUpperCase(),
        name: ' Крео-дизайнер ',
      }),
    ).toEqual({ verticalId, name: 'Крео-дизайнер' });
    expect(
      createPositionSchema.safeParse({
        verticalId,
        name: 'Тест',
        isActive: true,
      }).success,
    ).toBe(false);
    expect(createPositionSchema.safeParse({ name: 'Тест' }).success).toBe(
      false,
    );
    expect(
      createPositionSchema.safeParse({ verticalId: 'x', name: 'Тест' }).success,
    ).toBe(false);
  });

  it('patches with a version and at least one of name or isActive', () => {
    expect(
      patchPositionSchema.parse({ expectedVersion: 3, isActive: false }),
    ).toEqual({ expectedVersion: 3, isActive: false });
    expect(
      patchPositionSchema.parse({ expectedVersion: 1, name: ' Нова ' }),
    ).toEqual({ expectedVersion: 1, name: 'Нова' });
    expect(patchPositionSchema.safeParse({ expectedVersion: 1 }).success).toBe(
      false,
    );
    expect(patchPositionSchema.safeParse({ name: 'Нова' }).success).toBe(false);
    expect(
      patchPositionSchema.safeParse({ expectedVersion: 0, name: 'Нова' })
        .success,
    ).toBe(false);
    expect(
      patchPositionSchema.safeParse({
        expectedVersion: 1,
        name: 'Нова',
        verticalId,
      }).success,
    ).toBe(false);
  });

  it('defaults the list to active and accepts only known statuses', () => {
    expect(positionListQuerySchema.parse({})).toEqual({ status: 'active' });
    expect(
      positionListQuerySchema.parse({
        status: 'all',
        verticalId: verticalId.toUpperCase(),
      }),
    ).toEqual({ status: 'all', verticalId });
    expect(
      positionListQuerySchema.safeParse({ status: 'inactive' }).success,
    ).toBe(false);
    expect(positionListQuerySchema.safeParse({ verticalId: 'x' }).success).toBe(
      false,
    );
  });

  it('rejects a malformed position id', () => {
    expect(positionIdParamsSchema.safeParse({ positionId: 'x' }).success).toBe(
      false,
    );
    expect(
      positionIdParamsSchema.parse({ positionId: verticalId }).positionId,
    ).toBe(verticalId);
  });
});
