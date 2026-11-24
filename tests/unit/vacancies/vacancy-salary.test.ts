import { describe, expect, it } from 'vitest';
import {
  formatSalaryAmount,
  normalizeSalaryText,
  parseSalaryAmount,
} from '@/lib/vacancy-salary';

const NBSP = '\u00a0';
const NNBSP = '\u202f';

describe('parseSalaryAmount: text → minor units [VAC-01, D116]', () => {
  it.each([
    ['2500', '250000'],
    ['2 500', '250000'],
    [`2${NBSP}500`, '250000'],
    [`2${NNBSP}500`, '250000'],
    ['2 500,50', '250050'],
    ['2500.5', '250050'],
    ['2500,05', '250005'],
    ['0', '0'],
    ['0,5', '50'],
    ['0,05', '5'],
    ['007', '700'],
    ['  1 000 000  ', '100000000'],
    ['12 345', '1234500'],
    [`12${NBSP}345,5`, '1234550'],
    [`1${NNBSP}234${NNBSP}567`, '123456700'],
    ['9999999999999,99', '999999999999999'],
  ])('%j → %s', (text, minor) => {
    expect(parseSalaryAmount(text)).toEqual({ ok: true, minor });
  });

  it.each([
    ['abc'],
    ['1 2 3'],
    ['12 34'],
    ['1 2345'],
    ['1234 567'],
    ['2 500 ,50'],
    ['2500, 5'],
    ['1  234'],
    ['12abc'],
    ['-5'],
    ['1e3'],
    ['2 500,555'],
    ['2,500.50'],
    ['1.000,50'],
    [','],
    ['2 500,'],
    ['٣'],
    ['-0'],
    ['-0,01'],
    ['+5'],
    [''],
  ])('%j is not a number', (text) => {
    expect(parseSalaryAmount(text)).toEqual({
      ok: false,
      error: 'salaryNumber',
    });
  });

  it.each([
    ['10000000000000'],
    ['10000000000000,00'],
    ['1234567890123456'],
    ['9999999999999999'],
    ['99999999999999999999'],
  ])('%s exceeds the stored range', (text) => {
    expect(parseSalaryAmount(text)).toEqual({
      ok: false,
      error: 'salaryTooLarge',
    });
  });
});

describe('formatSalaryAmount / normalizeSalaryText: what the input shows after blur', () => {
  it.each([
    ['0', '0'],
    ['5', '0,05'],
    ['50', '0,5'],
    ['100', '1'],
    ['250000', `2${NBSP}500`],
    ['250050', `2${NBSP}500,5`],
    ['250005', `2${NBSP}500,05`],
    ['100000000', `1${NBSP}000${NBSP}000`],
  ])('%s minor units → %j', (minor, shown) => {
    expect(formatSalaryAmount(minor)).toBe(shown);
  });

  it('matches the uk-UA grouping of Intl, so the field reads like the rest of the app', () => {
    const intl = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 });
    for (const amount of [999, 1000, 2500.5, 1234567.89])
      expect(formatSalaryAmount(String(Math.round(amount * 100)))).toBe(
        intl.format(amount).replaceAll(NNBSP, NBSP),
      );
  });

  it('parses what it printed back to the same amount', () => {
    for (const minor of ['0', '5', '250050', '999999999999999'])
      expect(parseSalaryAmount(formatSalaryAmount(minor))).toEqual({
        ok: true,
        minor,
      });
  });

  it('normalises a valid amount and leaves anything else exactly as typed', () => {
    expect(normalizeSalaryText('2500,50')).toBe(`2${NBSP}500,5`);
    expect(normalizeSalaryText('')).toBe('');
    expect(normalizeSalaryText('abc')).toBe('abc');
    expect(normalizeSalaryText('2,500.50')).toBe('2,500.50');
  });
});
