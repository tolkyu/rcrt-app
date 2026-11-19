import { describe, expect, it } from 'vitest';
import { reasonLength, VACANCY_REASON_MAX } from '@/lib/reason-length';
import { hasOnlyReasonChars, normalizeReason } from '@/lib/reason-text';
import { cancelVacancySchema } from '@/lib/schemas/vacancy-cancel';

describe('normalizeReason [D113]', () => {
  it.each([
    ['one line, trimmed', '  Потреба зникла  ', 'Потреба зникла'],
    ['runs of spaces and tabs collapse', 'а \t\t  б', 'а б'],
    ['a line break stays', 'перший\nдругий', 'перший\nдругий'],
    ['CRLF and CR become LF', 'а\r\nб\rв', 'а\nб\nв'],
    ['spaces around a break go', 'а  \n  б', 'а\nб'],
    ['one blank line stays', 'а\n\nб', 'а\n\nб'],
    ['all internal blank lines stay', 'а\n\n\n\n\nб', 'а\n\n\n\n\nб'],
    ['outer breaks are trimmed', '\n\n а \n\n', 'а'],
    ['no-break space counts as a space', 'а  б', 'а б'],
    ['decomposed letters become one precomposed', 'é', 'é'],
  ])('%s', (_name, input, expected) => {
    expect(normalizeReason(input)).toBe(expected);
  });
});

describe('hasOnlyReasonChars [D113]', () => {
  it.each([
    ['plain text', 'Дубль', true],
    ['LF, CR and tab', 'а\nб\r\nв\tг', true],
    ['emoji', 'ок 👍', true],
    ['NUL', 'а\u0000б', false],
    ['vertical tab', 'а\u000Bб', false],
    ['form feed', 'а\u000Cб', false],
    ['next line (NEL)', 'а\u0085б', false],
    ['line separator', 'а б', false],
    ['paragraph separator', 'а б', false],
    ['zero-width space', 'а​б', false],
    ['bidi override', 'а‮б', false],
    ['private use', 'аб', false],
    ['lone surrogate', 'а\uD800б', false],
    ['braille pattern blank', 'а⠀б', false],
    ['hangul choseong filler', 'аᅟб', false],
    ['hangul jungseong filler', 'аᅠб', false],
    ['hangul filler', 'аㅤб', false],
    ['halfwidth hangul filler', 'аﾠб', false],
  ])('%s', (_name, input, expected) => {
    expect(hasOnlyReasonChars(input)).toBe(expected);
  });
});

describe('cancelVacancySchema refuses blank fillers [D113]', () => {
  it.each(['⠀', 'ㅤㅤ', 'аﾠ'])('%j', (reason) => {
    const result = cancelVacancySchema.safeParse({ reason });
    expect(result.success).toBe(false);
  });
});

describe('reasonLength: the counter and cancelVacancySchema cannot disagree [D113]', () => {
  const cases: [string, string][] = [
    ['at the limit', 'а'.repeat(VACANCY_REASON_MAX)],
    ['one over', 'а'.repeat(VACANCY_REASON_MAX + 1)],
    ['a line break counts as one', `${'а'.repeat(249)}\n${'б'.repeat(250)}`],
    ['a line break pushes it over', `${'а'.repeat(250)}\n${'б'.repeat(250)}`],
    ['CRLF counts as one', `${'а'.repeat(249)}\r\n${'б'.repeat(250)}`],
    [
      'every internal blank line counts',
      `${'а'.repeat(250)}\n\n\n\n${'б'.repeat(248)}`,
    ],
    ['padded by breaks and spaces', `\n  ${'а'.repeat(500)}  \n\n`],
    ['emoji at the limit', '😀'.repeat(VACANCY_REASON_MAX)],
    ['emoji one over', '😀'.repeat(VACANCY_REASON_MAX + 1)],
    ['decomposed at the limit', 'é'.repeat(VACANCY_REASON_MAX)],
    ['only breaks', '\n\n\n'],
    ['only spaces', '   '],
  ];
  it.each(cases)('%s', (_name, value) => {
    const accepted = cancelVacancySchema.safeParse({ reason: value }).success;
    const length = reasonLength(value);
    expect(length >= 1 && length <= VACANCY_REASON_MAX).toBe(accepted);
  });
});
