import { pgErrorInfo } from './errors';

/** CLI tools print SQLSTATE and constraint only, because driver messages can embed row values. */
export function toolErrorSummary(error: unknown): string {
  const pg = pgErrorInfo(error);
  if (pg) {
    return pg.constraint
      ? `SQLSTATE ${pg.sqlState}, constraint ${pg.constraint}`
      : `SQLSTATE ${pg.sqlState}`;
  }
  if (!(error instanceof Error)) return 'unknown error';
  const code = (error as { code?: unknown }).code;
  const parts = [error.name];
  if (typeof code === 'string') parts.push(code);
  if (error.constructor === Error) parts.push(error.message);
  return parts.join(': ');
}
