import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { cancelVacancySchema, VACANCY_REASON_MAX } from '@/lib/schemas/vacancy';
import { serverTextLength, trimmedTextLength } from '@/lib/text-length';

describe('serverTextLength [UI foundation F5]', () => {
  it('counts Unicode code points: an emoji is 1, a family emoji is 5, not one grapheme and not UTF-16 units', () => {
    expect(serverTextLength('Привіт')).toBe(6);
    expect(serverTextLength('😀')).toBe(1);
    expect('😀'.length).toBe(2);
    expect(serverTextLength('👨‍👩‍👧')).toBe(5);
    expect([...new Intl.Segmenter().segment('👨‍👩‍👧')]).toHaveLength(1);
  });

  it('counts a decomposed letter as the one precomposed character the server stores (NFC)', () => {
    expect(serverTextLength('é')).toBe(1);
    expect(serverTextLength('й')).toBe(1);
  });

  it('counts a combining mark that has no precomposed form as its own code point', () => {
    expect(serverTextLength('x́')).toBe(2);
  });

  it('collapses whitespace runs and trims, as every line() schema does before max', () => {
    expect(serverTextLength('  a   b \n c  ')).toBe(5);
    expect(serverTextLength('   ')).toBe(0);
  });

  it.each([
    ['at the limit', 'а'.repeat(VACANCY_REASON_MAX)],
    ['one over', 'а'.repeat(VACANCY_REASON_MAX + 1)],
    ['emoji at the limit', '😀'.repeat(VACANCY_REASON_MAX)],
    ['emoji one over', '😀'.repeat(VACANCY_REASON_MAX + 1)],
    ['decomposed at the limit', 'é'.repeat(VACANCY_REASON_MAX)],
    ['uncomposable marks over', 'x́'.repeat(VACANCY_REASON_MAX / 2 + 1)],
    ['padded by whitespace', ` ${'а'.repeat(VACANCY_REASON_MAX)}   `],
    ['inner whitespace run', `${'а'.repeat(250)}      ${'б'.repeat(249)}`],
  ])('agrees with cancelVacancySchema (reason 1..500): %s', (_name, value) => {
    const accepted = cancelVacancySchema.safeParse({ reason: value }).success;
    expect(serverTextLength(value) <= VACANCY_REASON_MAX).toBe(accepted);
  });
});

describe('trimmedTextLength [UI foundation F5]', () => {
  it.each([
    ['at the limit', 'а'.repeat(40)],
    ['one over', 'а'.repeat(41)],
    ['padded by whitespace', `  ${'а'.repeat(40)}  `],
    [
      'inner whitespace runs count in full',
      `${'а'.repeat(20)}      ${'б'.repeat(15)}`,
    ],
    [
      'inner whitespace run over the limit',
      `${'а'.repeat(20)}      ${'б'.repeat(15)}ж`,
    ],
    ['decomposed letters stay two code points', 'é'.repeat(21)],
    ['decomposed letters at the limit', 'é'.repeat(20)],
    ['emoji at the limit', '😀'.repeat(40)],
    ['emoji one over', '😀'.repeat(41)],
  ])('agrees with z.string().trim().max(40): %s', (_name, value) => {
    const accepted = z.string().trim().max(40).safeParse(value).success;
    expect(trimmedTextLength(value) <= 40).toBe(accepted);
  });

  it('differs from serverTextLength exactly where normalisation changes the string', () => {
    expect(trimmedTextLength('a   b')).toBe(5);
    expect(serverTextLength('a   b')).toBe(3);
    expect(trimmedTextLength('é')).toBe(2);
    expect(serverTextLength('é')).toBe(1);
  });
});
