import 'server-only';
import pino from 'pino';
import { pgErrorInfo } from '../db/errors';

/** Structured logs carry ids, codes and timings only; redaction is the backstop for accidental PII (DG-16). */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: null,
  redact: {
    paths: [
      'email',
      '*.email',
      'phone',
      '*.phone',
      'fullName',
      '*.fullName',
      'authorization',
      '*.authorization',
      'cookie',
      '*.cookie',
      'body',
      '*.body',
      'query',
      '*.query',
    ],
    censor: '[redacted]',
  },
});

/** Database errors are reported by SQLSTATE and constraint only; driver messages embed parameters. */
export function describeError(error: unknown): Record<string, string> {
  const pg = pgErrorInfo(error);
  if (pg) {
    return pg.constraint
      ? {
          name: 'PostgresError',
          sqlState: pg.sqlState,
          constraint: pg.constraint,
        }
      : { name: 'PostgresError', sqlState: pg.sqlState };
  }
  return { name: error instanceof Error ? error.name : typeof error };
}
