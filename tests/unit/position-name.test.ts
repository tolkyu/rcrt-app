import { describe, expect, it } from 'vitest';
import {
  normalizePositionName,
  positionNameKey,
  positionNameProblem,
} from '@/lib/position-name';
import { positionNameSchema } from '@/lib/schemas/position';

const char = (...codes: number[]) => String.fromCharCode(...codes);
const DECOMPOSED_I_SHORT = char(0x0438, 0x0306);
const NO_BREAK = char(0x00a0);
const DECOMPOSED_I_DIAERESIS = char(0x0456, 0x0308);

describe('position name key [SEC-POS-01, ADR-013]', () => {
  it('folds Ukrainian case in app code: «АФІЛЕЙТ ЛІД» equals «афілейт лід»', () => {
    expect(positionNameKey('АФІЛЕЙТ ЛІД')).toBe('афілейт лід');
    expect(positionNameKey('Афілейт Лід')).toBe(positionNameKey('афілейт лід'));
    expect(positionNameKey('ҐАНОК Є Ї')).toBe('ґанок є ї');
  });

  it('treats composed and decomposed «й» and «ї» as the same key', () => {
    expect(positionNameKey('Й')).toBe('й');
    expect(positionNameKey(DECOMPOSED_I_SHORT)).toBe('й');
    expect(positionNameKey(DECOMPOSED_I_DIAERESIS)).toBe('ї');
    expect(positionNameKey(`Укра${DECOMPOSED_I_DIAERESIS}на`)).toBe(
      positionNameKey('УКРАЇНА'),
    );
    expect(positionNameKey(`Мед${DECOMPOSED_I_SHORT}а`)).toBe(
      positionNameKey('МедЙА'),
    );
  });

  it('collapses inner whitespace and trims', () => {
    expect(positionNameKey(`  Афілейт ${NO_BREAK}  Лід  `)).toBe('афілейт лід');
    expect(normalizePositionName(`  Афілейт ${NO_BREAK}  Лід  `)).toBe(
      'Афілейт Лід',
    );
  });

  it('equates every apostrophe variant with ʼ (U+02BC) in the key only', () => {
    const modifier = positionNameKey(`П${char(0x02bc)}ятниця`);
    for (const code of [0x27, 0x2019, 0x2018, 0x60, 0xb4])
      expect(positionNameKey(`П${char(code)}ятниця`), code.toString(16)).toBe(
        modifier,
      );
    expect(normalizePositionName(`П${char(0x2019)}ятниця`)).toBe(
      `П${char(0x2019)}ятниця`,
    );
  });

  it('keeps different names apart', () => {
    expect(positionNameKey('Афілейт')).not.toBe(positionNameKey('Афілейт Лід'));
    expect(positionNameKey(`П${char(0x2019)}ятниця`)).not.toBe(
      positionNameKey('Пятниця'),
    );
  });

  it('is idempotent', () => {
    const once = positionNameKey(`  ЇЖАК  ${DECOMPOSED_I_SHORT} `);
    expect(positionNameKey(once)).toBe(once);
  });
});

describe('client name check mirrors the shared schema [ADR-013]', () => {
  it('measures the normalised name', () => {
    expect(positionNameProblem('   ')).toBe('required');
    expect(positionNameProblem(' Ф ')).toBe('tooShort');
    expect(positionNameProblem(` Фа${NO_BREAK}${NO_BREAK}ль `)).toBeNull();
    expect(positionNameProblem('Ф'.repeat(80))).toBeNull();
    expect(positionNameProblem('Ф'.repeat(81))).toBe('tooLong');
  });

  it('rejects invisible and bidi characters before measuring', () => {
    expect(positionNameProblem(`Лід${char(0x200b)}`)).toBe('invalid');
    expect(positionNameProblem(`Лід${char(0x202e)}`)).toBe('invalid');
    expect(positionNameProblem(`Лід${char(0)}`)).toBe('invalid');
  });
});

describe('client check and schema agree on every kind of input [ADR-013, SEC-POS-01]', () => {
  const ISSUE_OF = {
    required: 'too_small',
    tooShort: 'too_small',
    tooLong: 'too_big',
    invalid: 'custom',
  } as const;
  const cases: ReadonlyArray<readonly [label: string, value: string]> = [
    ['empty', ''],
    ['whitespace only', ` ${NO_BREAK}  `],
    ['1 char', 'Ф'],
    ['2 chars', 'Фа'],
    ['80 chars', 'Ф'.repeat(80)],
    ['81 chars', 'Ф'.repeat(81)],
    [
      '80 chars once collapsed',
      `${'Ф'.repeat(40)}${NO_BREAK}${NO_BREAK}${'Ф'.repeat(39)}`,
    ],
    ['NUL', `Лід${char(0)}`],
    ['zero-width space', `Лід${char(0x200b)}`],
    ['bidi override', `Лід${char(0x202e)}`],
    ['lone high surrogate', `Лід${char(0xd800)}`],
    ['lone low surrogate', `${char(0xdc00)}Лід`],
    ['modifier apostrophe', `П${char(0x02bc)}ятниця`],
    ['straight apostrophe', "П'ятниця"],
    ['NFC й', char(0x0439, 0x0439)],
    ['NFD й', DECOMPOSED_I_SHORT + DECOMPOSED_I_SHORT],
    ['NFD 40 pairs: 80 units, 40 after NFC', DECOMPOSED_I_SHORT.repeat(40)],
    ['NFD 41 pairs: 82 units, 41 after NFC', DECOMPOSED_I_SHORT.repeat(41)],
  ];

  it.each(cases)('%s', (_label, value) => {
    const problem = positionNameProblem(value);
    const parsed = positionNameSchema.safeParse(value);
    expect(parsed.success).toBe(problem === null);
    if (parsed.success) expect(parsed.data).toBe(normalizePositionName(value));
    else expect(parsed.error.issues[0]?.code).toBe(ISSUE_OF[problem!]);
  });
});
