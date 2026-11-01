const BROWSERS: readonly [RegExp, string][] = [
  [/Edg\//u, 'Edge'],
  [/OPR\/|Opera/u, 'Opera'],
  [/Firefox\/|FxiOS/u, 'Firefox'],
  [/Chrome\/|CriOS/u, 'Chrome'],
  [/Safari\//u, 'Safari'],
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
): { browser: string; os: string } | null {
  if (!userAgent) return null;
  const browser = match(userAgent, BROWSERS);
  const os = match(userAgent, SYSTEMS);
  return browser && os ? { browser, os } : null;
}
