# Dependency audit exemption: picomatch GHSA-fc5q-39xc-vjpf

| Item     | Value                                                                                                                                                                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advisory | GHSA-fc5q-39xc-vjpf, picomatch ReDoS (repeated extglobs), high, `<=4.0.7`, "fixed in 4.0.8"                                                                                                                                                                       |
| Problem  | npm has no 4.0.8 (latest 4.0.7, 2026-08-24); a pnpm override cannot reach a version that does not exist                                                                                                                                                           |
| Path     | `next-intl@4.14.9 > @parcel/watcher@2.6.0 > picomatch@4.0.7`; next-intl 4.15.1 still depends on `@parcel/watcher ^2.4.1`                                                                                                                                          |
| Decision | Time-boxed, path-exact production exemption in `.github/production-advisories.json` (until **2026-12-18**). Default stays zero advisories; any other GHSA, module, severity or path, or a date past `until`, fails `pnpm audit:check`                             |
| Re-check | By 2026-12-18: `npm view picomatch version`. If a fixed version exists, add `overrides: { '@parcel/watcher>picomatch': '<fixed>' }` (mind `minimumReleaseAge`), delete the exemption. Otherwise re-review reachability and extend `until` once, with a new reason |

## Reachability evidence (next-intl 4.14.9, our config)

- `@parcel/watcher` is imported in one place: `extractor/source/SourceFileWatcher.js`, created by `CatalogManager` only when `isDevelopment` is true. `CatalogManager` is built only by the message extractor, which `createNextIntlPlugin` starts only when `experimental.extract` is set (`plugin/extractor/initExtractionCompiler.js`, `plugin/createNextIntlPlugin.js`) and only in `next dev` or `next build`. `next.config.ts` sets `experimental.messages` only, no `extract`.
- `next-intl/plugin` is imported only by `next.config.ts` (build/start configuration), never by `app/`, `server/` or `lib/` runtime code, so it is not in the Vercel function bundle.
- `@parcel/watcher` calls `picomatch.makeRe` in `wrapper.js` for its `ignore` option. next-intl passes fixed globs (`**/<IGNORED_DIRECTORIES>/**`); no request, candidate or user data reaches a glob. Pattern input is not attacker-controlled; worst case would be a build-time hang on a developer machine.
- `@parcel/watcher` is not built or loaded by the app (`allowBuilds: '@parcel/watcher': false`).

Residual risk: Low (no production reachability). Tooling-side policy is unchanged.
