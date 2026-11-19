/** Keep salary minor units exact even beyond JavaScript's safe integer range. */
export function formatVacancyMoney(minor: string, currency: string): string {
  const formatter = new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency,
  });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  const scale = 10n ** BigInt(digits);
  const amount = BigInt(minor);
  const fraction = (amount % scale).toString().padStart(digits, '0');
  return formatter
    .formatToParts(amount / scale)
    .map((part) => (part.type === 'fraction' ? fraction : part.value))
    .join('');
}
