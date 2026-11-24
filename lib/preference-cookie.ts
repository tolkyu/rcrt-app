const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** UI preferences (theme, sidebar, vertical filter) live in plain cookies so the server renders them without a flash. */
export const PREFERENCE_COOKIES = {
  theme: 'theme',
  sidebar: 'sidebar',
  vertical: 'vertical',
} as const;

export function preferenceCookie(
  name: string,
  value: string,
  secure: boolean,
): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${ONE_YEAR_SECONDS}`,
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function writePreference(name: string, value: string): void {
  document.cookie = preferenceCookie(
    name,
    value,
    window.location.protocol === 'https:',
  );
}
