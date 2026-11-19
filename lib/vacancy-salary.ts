/** Free of Zod, so the salary inputs can normalise their text on blur outside the lazy module; every offered currency has two minor digits (D116). */
export type SalaryTextError = 'salaryNumber' | 'salaryTooLarge';

export type SalaryAmount =
  | { readonly ok: true; readonly minor: string }
  | { readonly ok: false; readonly error: SalaryTextError };

/** Whole part: plain digits, or groups of three after a leading one to three (a space or no-break space between groups). */
const AMOUNT = /^(\d+|\d{1,3}(?:\s\d{3})+)(?:[.,](\d{1,2}))?$/;
/** The create contract stores `^(0|[1-9]\d{0,14})$` minor units. */
const MINOR_MAX_DIGITS = 15;
const GROUP_SEPARATOR = '\u00a0';

/** «2 500,50» / «2500.5» → minor units as a digit string; a space only groups thousands (the no-break ones `uk-UA` prints included), a second separator is an error. */
export function parseSalaryAmount(text: string): SalaryAmount {
  const match = AMOUNT.exec(text.trim());
  if (!match) return { ok: false, error: 'salaryNumber' };
  const minor =
    `${match[1]!.replace(/\s/g, '')}${(match[2] ?? '').padEnd(2, '0')}`.replace(
      /^0+(?=\d)/,
      '',
    );
  return minor.length > MINOR_MAX_DIGITS
    ? { ok: false, error: 'salaryTooLarge' }
    : { ok: true, minor };
}

/** Minor units → «2 500» or «2 500,5», grouped like `uk-UA` without going through a float. */
export function formatSalaryAmount(minor: string): string {
  const padded = minor.padStart(3, '0');
  const whole = padded
    .slice(0, -2)
    .replace(/\B(?=(\d{3})+$)/g, GROUP_SEPARATOR);
  const fraction = padded.slice(-2).replace(/0+$/, '');
  return fraction ? `${whole},${fraction}` : whole;
}

/** What a salary input shows after blur: a valid amount in its normal form, anything else exactly as typed so the error can point at it. */
export function normalizeSalaryText(text: string): string {
  const amount = parseSalaryAmount(text);
  return amount.ok ? formatSalaryAmount(amount.minor) : text;
}
