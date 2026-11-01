import {
  parseCookieHeader,
  serializeCookieHeader,
  type CookieOptions,
} from '@supabase/ssr';

type Cookie = { name: string; value: string; options: CookieOptions };
export interface AuthCookieStore {
  getAll(): { name: string; value: string }[];
  setAll(cookies: Cookie[]): void;
  commit(): void;
  discard(): void;
  clear(): void;
  /** Short-lived HttpOnly cookie outside the Supabase session (OAuth invite hand-off). */
  setTransient(name: string, value: string, maxAge: number, path: string): void;
  /** Caps cookie Max-Age at the session's remaining absolute lifetime (T4-B09). */
  limitLifetime(seconds: number): void;
  apply(response: Response): void;
}

export const SESSION_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

/** SDK writes are staged until the returned JWT and app principal have both been verified. */
export function createAuthCookieStore(
  headers: Headers,
  appUrl: string,
): AuthCookieStore {
  const raw = headers.get('cookie') ?? '';
  const initial = raw.length <= 65_536 ? parseCookieHeader(raw) : [];
  const current = new Map(initial.map(({ name, value }) => [name, value]));
  const staged = new Map<string, Cookie>();
  const defaults: CookieOptions = {
    path: '/',
    sameSite: 'lax',
    secure: new URL(appUrl).protocol === 'https:',
    // No browser Supabase client exists; script never needs the tokens (XSS cannot read them).
    httpOnly: true,
    maxAge: SESSION_COOKIE_MAX_AGE,
  };
  let committed = false;
  return {
    getAll: () => [...current].map(([name, value]) => ({ name, value })),
    setAll(cookies) {
      for (const cookie of cookies) {
        staged.set(cookie.name, {
          ...cookie,
          options: {
            ...cookie.options,
            ...defaults,
            ...(cookie.options.maxAge === 0 ? { maxAge: 0 } : {}),
          },
        });
        if (cookie.options.maxAge === 0) current.delete(cookie.name);
        else current.set(cookie.name, cookie.value);
      }
    },
    setTransient(name, value, maxAge, path) {
      staged.set(name, {
        name,
        value,
        options: { ...defaults, path, maxAge, sameSite: 'lax' },
      });
    },
    limitLifetime(seconds) {
      defaults.maxAge = Math.max(
        0,
        Math.min(SESSION_COOKIE_MAX_AGE, Math.floor(seconds)),
      );
      for (const cookie of staged.values())
        if (cookie.options.maxAge !== 0) cookie.options.maxAge = defaults.maxAge;
    },
    commit() {
      committed = true;
    },
    discard() {
      staged.clear();
      committed = false;
    },
    clear() {
      const names = new Set([
        ...initial
          .filter(({ name }) =>
            /^sb-[A-Za-z0-9_-]+-auth-token(?:-code-verifier)?(?:[.]\d+)?$/.test(name),
          )
          .map(({ name }) => name),
        ...staged.keys(),
      ]);
      staged.clear();
      for (const name of names) {
        staged.set(name, {
          name,
          value: '',
          options: { ...defaults, maxAge: 0 },
        });
        current.delete(name);
      }
      committed = true;
    },
    apply(response) {
      if (committed)
        for (const { name, value, options } of staged.values()) {
          response.headers.append(
            'Set-Cookie',
            serializeCookieHeader(name, value, options),
          );
        }
    },
  };
}
