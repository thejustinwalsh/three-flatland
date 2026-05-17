---
"@three-flatland/bake": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## Changes

**New package: `@three-flatland/bake`**
- Unified `flatland-bake` CLI binary — discovers and dispatches bakers contributed by workspace or npm packages via a `flatland.bake` manifest in `package.json`
- Baker discovery walks `node_modules` upward from CWD, tolerating scoped packages, missing dirs, and malformed manifests; first-wins conflict policy on duplicate names
- CWD self-discovery: when the CLI runs inside a package that declares its own bakers, those are registered before `node_modules` scans (useful during package authoring)
- `flatland-bake --list` shows all available subcommands from installed packages

**API changes**
- `BakedAssetLoaderOptions.skipBakedProbe` renamed to `forceRuntime` — aligns with `SlugFontLoader.forceRuntime`; all baked-asset loaders now share one opt-out flag name
- `flatland.bakers` manifest key renamed to `flatland.bake`; legacy `bakers` key still accepted with a deprecation warning

**Bug fixes**
- CLI `--help` text corrected to reference `flatland.bake` instead of legacy `flatland.bakers`
- Sidecar HTTP probe: removed dead `&& header.status !== 206` branch that could never fire (already short-circuited by `!header.ok`)

## BREAKING CHANGES

- `BakedAssetLoaderOptions.skipBakedProbe` → `forceRuntime`: rename any `{ skipBakedProbe: true }` call sites to `{ forceRuntime: true }`

Introduces the `@three-flatland/bake` CLI package with a plugin-driven baker system; installing any package that declares a `flatland.bake` manifest entry automatically registers its `flatland-bake` subcommand.
