---
"@three-flatland/bake": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## @three-flatland/bake

### New features

- **`flatland-bake` CLI**: unified binary that discovers and dispatches to bakers contributed by workspace or npm packages via `package.json` `flatland.bake` manifest — installing a package that provides a baker makes its subcommand appear in `flatland-bake --list` automatically
- **CWD self-discovery**: when the CLI runs inside a package whose own `package.json` declares bakers, those are registered ahead of `node_modules` scans — lets package authors iterate without symlinking
- **`BakedAssetLoaderOptions` type**: shared option type across all baked-asset loaders in the ecosystem
- **`forceRuntime` option**: replaces `skipBakedProbe` across `BakedAssetLoaderOptions` and all loaders — one name, one pattern (`normals: true | descriptor` to opt in; `forceRuntime: true` to skip the probe)
- **Sidecar utilities**: `writeSidecar`, `sidecar` HEAD-probe, and `devtimeWarn` modules for the canonical try-baked-fallback pattern

### Bug fixes

- Fixed USAGE help text referencing legacy `flatland.bakers` field; now points to canonical `flatland.bake`
- Removed dead `&& header.status !== 206` guard in sidecar probe (redundant with `!response.ok`)
- Fixed `setTorchEnabled` being called inside `useFrame` in lighting example; deferred via `queueMicrotask` to avoid mid-frame React re-render

This release introduces the `@three-flatland/bake` package with a plugin-driven CLI and the shared `BakedAssetLoaderOptions` contract used by all baked-asset loaders.
