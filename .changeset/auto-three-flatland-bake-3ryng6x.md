---
"@three-flatland/bake": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

### New `flatland-bake` CLI

- `flatland-bake` binary discovers and dispatches to bakers contributed by workspace or npm packages via a `flatland.bake` manifest field in `package.json`
- Baker packages default-export a `Baker` (`{ name, description, run(args), usage? }`) — installing a package that provides one makes its subcommand appear in `flatland-bake --list` with no further wiring
- Discovery walks `node_modules` upward from CWD, tolerating scoped packages, missing dirs, and malformed manifests; first-wins policy on duplicate names
- CWD self-discovery: when the CLI runs inside a package that declares its own bakers, those register ahead of `node_modules` scans (lets package authors iterate without symlinking)
- Sidecar writer (`writeSidecar`) and probe added for managing baked-asset metadata

### API changes

- `BakedAssetLoaderOptions.forceRuntime` — unified opt-out flag shared across all baked-asset loaders; replaces the previous inconsistent per-loader names (`skipBakedProbe`, `disableRuntimeBake`)
- `flatland.bake` is the canonical manifest field; legacy `flatland.bakers` is still accepted with a deprecation warning
- `BakedAssetLoaderOptions` type exported from `@three-flatland/bake` so all loader packages can reference the same structural type

Adds the `flatland-bake` CLI and the `BakedAssetLoaderOptions` contract used across `@three-flatland/normals`, `@three-flatland/slug`, and the core loaders.
