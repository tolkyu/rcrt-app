const NETWORK_CODES =
  /\b(ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN)\b/;

function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : '';
}

export function networkCode(error: unknown) {
  const text = errorText(error);
  return (
    text.match(NETWORK_CODES)?.[1] ??
    (/socket hang up/i.test(text) ? 'ECONNRESET' : 'UNEXPECTED_ERROR')
  );
}

export function isRouteTeardownError(error: unknown) {
  return /disposed|already handled|closed|Test ended/i.test(String(error));
}

/** Playwright fetch errors embed authenticated request headers in their call log. */
export function safeNetworkError(
  operation: 'fixed-clock document/RSC' | 'fixed-clock masked API',
  error: unknown,
) {
  return new Error(
    `${operation} failed (${networkCode(error)}); request details omitted`,
  );
}
