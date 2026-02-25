---
"@three-flatland/presets": major
---

Initial alpha release of `@three-flatland/presets` — pre-configured effect setups built on top of `three-flatland` and `@three-flatland/nodes`.

**Package / build:**
- Dependency updated from `@three-flatland/core` (internal) to the public `three-flatland` package
- `source` export condition added for monorepo dev without building
- Build switched from `treeshake: true` to `bundle: false` (unbundled ESM/CJS output)
- README and LICENSE added

## BREAKING CHANGES

- Previously depended on the internal `@three-flatland/core` package, which no longer exists; the runtime dependency is now `three-flatland`

This is the initial alpha release, wiring up the presets package to the consolidated `three-flatland` core and publishing for the first time.
