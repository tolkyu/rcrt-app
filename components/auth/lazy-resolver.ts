import { useEffect } from 'react';
import type { FieldValues, Resolver, ResolverResult } from 'react-hook-form';

/**
 * Zod is ~30 kB gz, so form validation loads on first use (PERF-04). If that chunk cannot load, `fallback`
 * (a tiny dependency-free check with the same field errors) decides instead of hanging the form; the server validates again.
 * Every call retries the import, so a later submit recovers once the network is back.
 */
export function lazyResolver<Values extends FieldValues>(
  load: () => Promise<Resolver<Values>>,
  fallback: (values: Values) => ResolverResult<Values>,
): Resolver<Values> {
  return async (values, context, options) => {
    let resolver: Resolver<Values>;
    try {
      resolver = await load();
    } catch {
      return fallback(values);
    }
    return resolver(values, context, options);
  };
}

/** The resolver plus `warm`, which starts the chunk early (on idle and on first focus) and ignores a failure: the submit retries it. */
export function lazyValidation<Values extends FieldValues>(
  load: () => Promise<Resolver<Values>>,
  fallback: (values: Values) => ResolverResult<Values>,
) {
  return {
    resolver: lazyResolver(load, fallback),
    warm: () => {
      void load().catch(() => undefined);
    },
  };
}

export function useWarmOnIdle(warm: () => void) {
  useEffect(() => {
    if (typeof requestIdleCallback === 'function') {
      const handle = requestIdleCallback(warm);
      return () => cancelIdleCallback(handle);
    }
    const handle = setTimeout(warm, 200);
    return () => clearTimeout(handle);
  }, [warm]);
}
