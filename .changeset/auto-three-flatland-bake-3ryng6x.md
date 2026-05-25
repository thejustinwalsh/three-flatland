---
"@three-flatland/bake": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- New `@three-flatland/bake` CLI (`flatland-bake`) with extensible baker discovery via `package.json` manifests
- Baker discovery walks `node_modules` upward from CWD; packages declare bakers under `flatland.bake` (array of `{ name, description, entry }`)
- CWD-self-discovery: bakers in the running package's own `package.json` register first, enabling local iteration without symlinking
- First-wins conflict policy for duplicate baker names with console warning
- `devtimeWarn` helper: one-shot development warnings keyed by URL (silent in `NODE_ENV=production`)
- Sidecar utilities: read/write version-tagged PNG sidecar files (hash embedded in tEXt chunk for staleness detection)
- `flatland-bake --list` enumerates all discovered bakers
- Fixed: USAGE help text updated from legacy `flatland.bakers` to canonical `flatland.bake`
- Fixed: dead `&& header.status !== 206` guard removed from sidecar.ts (unreachable after `!ok` check)
- Fixed: `setTorchEnabled` in lighting example deferred off the `useFrame` loop via `queueMicrotask`

**BREAKING CHANGES**

- `skipBakedProbe` renamed to `forceRuntime` in `BakedAssetLoaderOptions`; update any loader call sites that passed `skipBakedProbe: true`

Adds the `@three-flatland/bake` CLI entry point for extensible offline asset baking, with sidecar read/write utilities and devtime warning infrastructure shared across all baked-asset loaders.
