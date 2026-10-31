export interface PgErrorInfo {
  readonly sqlState: string;
  readonly constraint: string | null;
  readonly message: string;
}

/** postgres.js errors arrive directly or wrapped by Drizzle (`cause`), whose message embeds query parameters. */
export function pgErrorInfo(error: unknown): PgErrorInfo | null {
  for (let current = error, depth = 0; current && depth < 3; depth++) {
    if (typeof current !== 'object') return null;
    const candidate = current as {
      name?: unknown;
      code?: unknown;
      constraint_name?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (
      candidate.name === 'PostgresError' &&
      typeof candidate.code === 'string'
    ) {
      return {
        sqlState: candidate.code,
        constraint:
          typeof candidate.constraint_name === 'string'
            ? candidate.constraint_name
            : null,
        message: typeof candidate.message === 'string' ? candidate.message : '',
      };
    }
    current = candidate.cause;
  }
  return null;
}
