import type { ResolverResult } from 'react-hook-form';
import type { LoginValues } from './login-validation';
import type { TotpValues } from './totp-validation';

/** Same field errors as the zod schemas in the lazy chunks, so the inline messages and focus-on-error work without them. */
export function loginFallback({
  email,
}: LoginValues): ResolverResult<LoginValues> {
  const trimmed = email.trim();
  if (!trimmed)
    return {
      values: {},
      errors: { email: { type: 'required', message: 'required' } },
    };
  if (!/^\S+@\S+$/.test(trimmed))
    return {
      values: {},
      errors: { email: { type: 'pattern', message: 'invalid' } },
    };
  return { values: { email: trimmed }, errors: {} };
}

export function totpFallback({ code }: TotpValues): ResolverResult<TotpValues> {
  return /^\d{6}$/.test(code)
    ? { values: { code }, errors: {} }
    : { values: {}, errors: { code: { type: 'pattern', message: 'invalid' } } };
}
