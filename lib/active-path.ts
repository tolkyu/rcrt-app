/** Own module so the settings sub-menu does not pull the whole nav config into its layout chunk (PERF-04). */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
