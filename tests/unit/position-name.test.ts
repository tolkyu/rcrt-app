import { describe, expect, it } from 'vitest';
import { normalizePositionName, positionNameKey } from '@/lib/position-name';

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
