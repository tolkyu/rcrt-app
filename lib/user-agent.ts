const BROWSERS: readonly [RegExp, string][] = [
  [/Edg\/(\d+)/u, 'Edge'],
  [/(?:OPR|Opera)\/(\d+)/u, 'Opera'],
  [/(?:Firefox|FxiOS)\/(\d+)/u, 'Firefox'],
  [/(?:Chrome|CriOS)\/(\d+)/u, 'Chrome'],
  [/Version\/(\d+).*Safari\//u, 'Safari'],
];
const SYSTEMS: readonly [RegExp, string][] = [
  [/iPhone|iPad|iPod/u, 'iOS'],
  [/Android/u, 'Android'],
  [/Windows/u, 'Windows'],
  [/Mac OS X|Macintosh/u, 'macOS'],
  [/CrOS/u, 'ChromeOS'],
  [/Linux/u, 'Linux'],
];

const match = (value: string, table: readonly [RegExp, string][]) =>
  table.find(([pattern]) => pattern.test(value))?.[1] ?? null;

/** Coarse «browser · OS» for the sessions list; order matters because Chrome UAs also contain "Safari". */
export function describeDevice(
  userAgent: string | null,
  includeVersion = false,
): { browser: string; os: string } | null {
  if (!userAgent) return null;
  const browser = match(userAgent, BROWSERS);
  const os = match(userAgent, SYSTEMS);
  if (!browser || !os) return null;
  const version = includeVersion
    ? BROWSERS.find(([, name]) => name === browser)?.[0].exec(userAgent)?.[1]
    : undefined;
  return { browser: version ? `${browser} ${version}` : browser, os };
}

/** Phones only: tablets keep the desktop layout, as the 768 px breakpoint does; iPad Safari reports as Mac, but iPad Chrome/Firefox send "iPad … Mobile" and Android tablets may carry "Tablet", so those are excluded explicitly. */
export const isPhoneUserAgent = (userAgent: string | null): boolean =>
  userAgent !== null &&
  !/iPad|Tablet/u.test(userAgent) &&
  /Mobi|iPhone|iPod/u.test(userAgent);
